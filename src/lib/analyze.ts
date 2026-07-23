import { randomUUID } from "crypto";
import { persistAnalysis } from "./db";
import { toUserMessage } from "./errors";
import {
  analyzeBatch,
  makeBatches,
  mergeClusters,
  type IndexedComment,
  type ThemeForMerge,
} from "./openai";
import {
  FullReportSchema,
  SENTIMENT_LABELS,
  THEME_CATEGORIES,
  type BatchAnalysis,
  type FullReport,
  type ModerationGroup,
  type ModerationType,
  type ProgressEvent,
  type StoredComment,
  type Supporter,
  type ThemeCategory,
  type ThemeGroup,
} from "./schema";
import { fetchAllComments, resolveVideo } from "./youtube";

export type Emit = (event: ProgressEvent) => void;

type CollectedTheme = {
  ref: string;
  category: ThemeCategory;
  label: string;
  indices: number[];
};
type CollectedMod = { type: ModerationType; indices: number[] };

function computeSentiment(batches: BatchAnalysis[]) {
  const positive = batches.reduce((s, b) => s + (b.sentiment.positive || 0), 0);
  const neutral = batches.reduce((s, b) => s + (b.sentiment.neutral || 0), 0);
  const negative = batches.reduce((s, b) => s + (b.sentiment.negative || 0), 0);
  const total = positive + neutral + negative || 1;
  const positivePct = (positive / total) * 100;
  const neutralPct = (neutral / total) * 100;
  const negativePct = (negative / total) * 100;

  let label: (typeof SENTIMENT_LABELS)[number];
  const net = positivePct - negativePct;
  if (net > 60) label = "Overwhelmingly Positive";
  else if (net > 15) label = "Positive";
  else if (net > -15) label = "Mixed";
  else if (net > -60) label = "Negative";
  else label = "Overwhelmingly Negative";

  return { positive, neutral, negative, positivePct, neutralPct, negativePct, label };
}

function uniqueByLikes(indices: number[], comments: StoredComment[]): StoredComment[] {
  const seen = new Set<string>();
  const out: StoredComment[] = [];
  for (const i of indices) {
    const c = comments[i];
    if (!c || seen.has(c.commentId)) continue;
    seen.add(c.commentId);
    out.push(c);
  }
  out.sort((a, b) => b.likeCount - a.likeCount);
  return out;
}

function computeSupporters(comments: StoredComment[]): Supporter[] {
  const map = new Map<string, Supporter>();
  for (const c of comments) {
    const key = c.authorChannelId ?? c.author;
    const existing = map.get(key);
    if (existing) existing.commentCount += 1;
    else
      map.set(key, {
        author: c.author,
        authorChannelId: c.authorChannelId,
        commentCount: 1,
      });
  }
  return [...map.values()]
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 8);
}

/** Merge groups that share a (case-insensitive) label within one category. */
function dedupeGroups(groups: ThemeGroup[]): ThemeGroup[] {
  const byLabel = new Map<string, ThemeGroup>();
  for (const g of groups) {
    const key = g.theme.trim().toLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, { ...g, comments: [...g.comments] });
      continue;
    }
    const seen = new Set(existing.comments.map((c) => c.commentId));
    for (const c of g.comments) {
      if (!seen.has(c.commentId)) {
        seen.add(c.commentId);
        existing.comments.push(c);
      }
    }
    existing.comments.sort((a, b) => b.likeCount - a.likeCount);
    existing.mentionCount = existing.comments.length;
  }
  return [...byLabel.values()].sort((a, b) => b.mentionCount - a.mentionCount);
}

export async function runAnalysis(url: string, emit: Emit): Promise<void> {
  try {
    emit({ type: "status", message: "Resolving YouTube URL…" });

    const { video, selection } = await resolveVideo(url);
    const selectionNote =
      selection === "channel-latest-longform" ? "Latest long-form upload selected." : "";

    emit({ type: "video", video, selection, selectionNote });
    if (selectionNote) emit({ type: "status", message: selectionNote });
    emit({ type: "status", message: `Fetching comments for “${video.title}”…` });

    // Step 2 — download every comment + reply, fully paginated.
    let lastEmit = 0;
    const comments: StoredComment[] = await fetchAllComments(
      video.videoId,
      (fetched, replies) => {
        const now = Date.now();
        if (now - lastEmit > 150) {
          lastEmit = now;
          emit({
            type: "comments",
            fetched,
            replies,
            done: false,
            message: `Fetching comments… ${fetched.toLocaleString()} found`,
          });
        }
      },
    );

    const replies = comments.filter((c) => c.isReply).length;

    if (comments.length === 0) {
      emit({
        type: "error",
        message: "No comments were found for this video (comments may be disabled or empty).",
      });
      return;
    }

    emit({
      type: "comments",
      fetched: comments.length,
      replies,
      done: true,
      message: `${comments.length.toLocaleString()} comments found (${replies.toLocaleString()} replies).`,
    });

    // Step 3 — batch. Never send all comments in one request.
    const indexed: IndexedComment[] = comments.map((c, i) => ({ i, c }));
    const batchesInput = makeBatches(indexed);
    const total = batchesInput.length;

    const collectedThemes: CollectedTheme[] = [];
    const collectedMods: CollectedMod[] = [];
    const batchResults: BatchAnalysis[] = [];
    let refCounter = 0;

    // Run a couple of batches in parallel to finish within host time limits,
    // while still emitting ordered progress for the UI.
    const CONCURRENCY = 2;
    for (let start = 0; start < batchesInput.length; start += CONCURRENCY) {
      const slice = batchesInput.slice(start, start + CONCURRENCY);
      emit({
        type: "batch",
        index: Math.min(start + slice.length, total),
        total,
        message:
          slice.length === 1
            ? `Analyzing batch ${start + 1} / ${total} (${slice[0].length} comments)…`
            : `Analyzing batches ${start + 1}–${start + slice.length} / ${total}…`,
      });

      const results = await Promise.all(slice.map((batch) => analyzeBatch(batch, video)));

      for (const result of results) {
        batchResults.push(result);
        for (const theme of result.themes) {
          const indices = theme.commentIndices.filter(
            (i) => Number.isInteger(i) && i >= 0 && i < comments.length,
          );
          if (indices.length === 0) continue;
          collectedThemes.push({
            ref: `t${refCounter++}`,
            category: theme.category,
            label: theme.label.trim() || "Untitled theme",
            indices,
          });
        }
        for (const mod of result.moderation) {
          const indices = mod.commentIndices.filter(
            (i) => Number.isInteger(i) && i >= 0 && i < comments.length,
          );
          if (indices.length === 0) continue;
          collectedMods.push({ type: mod.type, indices });
        }
      }
    }

    // Final merge — cluster batch themes by short refs (model never touches
    // comment data, only labels + refs, so evidence stays exact).
    emit({ type: "merge", message: `Final merge — consolidating ${total} batches…` });

    const themesForMerge: ThemeForMerge[] = collectedThemes.map((t) => ({
      ref: t.ref,
      category: t.category,
      label: t.label,
      count: t.indices.length,
      examples: t.indices.slice(0, 2).map((i) => comments[i].text.slice(0, 140)),
    }));

    const themeByRef = new Map(collectedThemes.map((t) => [t.ref, t]));

    let clusters: { category: ThemeCategory; label: string; memberRefs: string[] }[] = [];
    let summary = "";
    let sentimentLabelFromAI: (typeof SENTIMENT_LABELS)[number] = "Mixed";
    let confidence = 0.5;
    let actionItems: string[] = [];

    if (themesForMerge.length > 0) {
      const merged = await mergeClusters(themesForMerge, video, {
        totalComments: comments.length,
        totalReplies: replies,
      });
      clusters = merged.clusters.map((c) => ({
        category: c.category,
        label: c.label,
        memberRefs: c.memberRefs,
      }));
      summary = merged.summary;
      sentimentLabelFromAI = merged.sentimentLabel;
      confidence = Math.max(0, Math.min(1, merged.confidence));
      actionItems = merged.actionItems;
    }

    // Resolve clusters → theme groups per category.
    const groupsByCategory: Record<ThemeCategory, ThemeGroup[]> = {
      positiveFeedback: [],
      criticism: [],
      episodeRequests: [],
      hostFeedback: [],
      editingFeedback: [],
      thumbnailFeedback: [],
      titleFeedback: [],
      sponsorFeedback: [],
      recurringTopics: [],
    };

    const assignedRefs = new Set<string>();
    for (const cluster of clusters) {
      const indices: number[] = [];
      for (const ref of cluster.memberRefs) {
        const t = themeByRef.get(ref);
        if (!t) continue;
        assignedRefs.add(ref);
        indices.push(...t.indices);
      }
      const cmts = uniqueByLikes(indices, comments);
      if (cmts.length === 0) continue;
      groupsByCategory[cluster.category].push({
        theme: cluster.label.trim() || "Untitled theme",
        category: cluster.category,
        mentionCount: cmts.length,
        comments: cmts,
      });
    }

    // Coverage: any batch theme the merge dropped becomes its own group.
    for (const t of collectedThemes) {
      if (assignedRefs.has(t.ref)) continue;
      const cmts = uniqueByLikes(t.indices, comments);
      if (cmts.length === 0) continue;
      groupsByCategory[t.category].push({
        theme: t.label,
        category: t.category,
        mentionCount: cmts.length,
        comments: cmts,
      });
    }

    for (const cat of THEME_CATEGORIES) {
      groupsByCategory[cat] = dedupeGroups(groupsByCategory[cat]);
    }

    // Most Requested Future Episodes = aggregated episode requests + supporters.
    const mostRequestedFutureEpisodes = groupsByCategory.episodeRequests
      .map((g) => ({
        title: g.theme,
        mentionCount: g.mentionCount,
        supporters: computeSupporters(g.comments),
        comments: g.comments,
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount);

    // Moderation aggregated by type (fixed enum → done reliably in code).
    const modByType = new Map<ModerationType, number[]>();
    for (const m of collectedMods) {
      const existing = modByType.get(m.type) ?? [];
      existing.push(...m.indices);
      modByType.set(m.type, existing);
    }
    const moderationIssues: ModerationGroup[] = [...modByType.entries()]
      .map(([type, indices]) => {
        const cmts = uniqueByLikes(indices, comments);
        return { type, count: cmts.length, comments: cmts };
      })
      .filter((g) => g.count > 0)
      .sort((a, b) => b.count - a.count);

    const sentiment = computeSentiment(batchResults);
    const topComment =
      comments.length > 0
        ? comments.reduce((best, c) => (c.likeCount > best.likeCount ? c : best), comments[0])
        : null;

    const report: FullReport = FullReportSchema.parse({
      summary: summary || "No dominant themes were detected in the comments.",
      confidence,
      totalComments: comments.length,
      totalReplies: replies,
      sentimentLabel: sentimentLabelFromAI,
      sentiment: {
        positive: sentiment.positive,
        neutral: sentiment.neutral,
        negative: sentiment.negative,
        positivePct: sentiment.positivePct,
        neutralPct: sentiment.neutralPct,
        negativePct: sentiment.negativePct,
        label: sentiment.label,
      },
      positiveFeedback: groupsByCategory.positiveFeedback,
      criticism: groupsByCategory.criticism,
      episodeRequests: groupsByCategory.episodeRequests,
      hostFeedback: groupsByCategory.hostFeedback,
      editingFeedback: groupsByCategory.editingFeedback,
      thumbnailFeedback: groupsByCategory.thumbnailFeedback,
      titleFeedback: groupsByCategory.titleFeedback,
      sponsorFeedback: groupsByCategory.sponsorFeedback,
      recurringTopics: groupsByCategory.recurringTopics,
      mostRequestedFutureEpisodes,
      moderationIssues,
      actionItems,
      topComment,
    });

    const runId = randomUUID();
    emit({ type: "status", message: "Saving report…" });
    const persisted = await persistAnalysis({ runId, video, comments, report });

    emit({ type: "done", runId, video, report, comments, persisted, selectionNote });
  } catch (err) {
    const { message } = toUserMessage(err);
    emit({ type: "error", message: message || "Analysis failed." });
  }
}
