import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "./env";
import { AppError, withRetry } from "./errors";
import {
  BatchAnalysisSchema,
  MergedClustersSchema,
  type BatchAnalysis,
  type MergedClusters,
  type StoredComment,
  type VideoMeta,
} from "./schema";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: env.openaiApiKey });
  return client;
}

export type IndexedComment = { i: number; c: StoredComment };

/**
 * Split indexed comments into batches. Never sends everything in one request.
 * Because comments are consumed in order, each batch holds a CONTIGUOUS range
 * of global indices, which makes the model's index references reliable.
 */
export function makeBatches(
  comments: IndexedComment[],
  opts: { maxPerBatch?: number; maxCharsPerBatch?: number } = {},
): IndexedComment[][] {
  const { maxPerBatch = 90, maxCharsPerBatch = 14000 } = opts;
  const batches: IndexedComment[][] = [];
  let current: IndexedComment[] = [];
  let chars = 0;

  for (const item of comments) {
    const len = item.c.text.length + 40;
    if (
      current.length > 0 &&
      (current.length >= maxPerBatch || chars + len > maxCharsPerBatch)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function renderComments(batch: IndexedComment[]): string {
  return batch
    .map(({ i, c }) => {
      const kind = c.isReply ? "reply" : "comment";
      const text = c.text.replace(/\s+/g, " ").slice(0, 600);
      return `#${i} [${kind}] (${c.likeCount} likes) ${c.author}: ${text}`;
    })
    .join("\n");
}

const CATEGORY_GUIDE = `Assign comments to these theme categories:
- positiveFeedback: praise ("best episode", "loved the bloopers", "great chemistry").
- criticism: general complaints / negative feedback.
- episodeRequests: requests to cover a specific case/topic ("Cover JonBenét", "Do Elisa Lam", "revisit Zodiac"). Use the requested topic as the label (e.g. "Candy Montgomery").
- hostFeedback: feedback about hosts/presenters ("Love Morgan", "Bring Corinne back", "Alexis is great").
- editingFeedback: pacing/audio/visual edits ("music too loud", "need captions", "too many zooms").
- thumbnailFeedback: thumbnail packaging ("thumbnail spoiled the ending").
- titleFeedback: title packaging ("title was misleading", "clickbait").
- sponsorFeedback: ads/sponsors ("too many sponsor breaks", "ads are getting ridiculous").
- recurringTopics: themes that appear repeatedly across many comments.
Also flag moderation issues: Spam, Threats, Bots, Hate Speech, Scams, Harassment (use "Other" if needed).`;

const EVIDENCE_RULE = `CRITICAL EVIDENCE RULE:
Never create a theme or moderation flag without preserving its supporting comments.
Every extracted insight MUST include the "commentIndices" of every comment that supports it,
referenced by the "#" number shown before each comment. A theme with an empty commentIndices
array is invalid — omit it entirely. Do not invent indices; only use indices present in this batch.`;

export async function analyzeBatch(
  batch: IndexedComment[],
  video: VideoMeta,
): Promise<BatchAnalysis> {
  const oai = getClient();
  const input = `You are an expert YouTube community manager analyzing viewer comments for a video.

VIDEO
Title: ${video.title}
Channel: ${video.channelTitle}

${CATEGORY_GUIDE}

${EVIDENCE_RULE}

For sentiment, classify each comment as positive, neutral, or negative and return the counts.
Be precise — do not invent themes that are not present. Group near-identical requests under one label.

Analyze ONLY the following ${batch.length} comments (referenced by their # index):

COMMENTS
${renderComments(batch)}`;

  return withRetry(
    async () => {
      const response = await oai.responses.parse({
        model: env.openaiModel,
        input,
        text: { format: zodTextFormat(BatchAnalysisSchema, "batch_analysis") },
      });
      const parsed = response.output_parsed;
      if (!parsed) {
        throw new AppError("OPENAI_ERROR", "OpenAI returned no parsed output for a batch.");
      }
      return parsed;
    },
    { retries: 1, baseDelayMs: 900 },
  );
}

export type ThemeForMerge = {
  ref: string;
  category: string;
  label: string;
  count: number;
  examples: string[];
};

export async function mergeClusters(
  themes: ThemeForMerge[],
  video: VideoMeta,
  totals: { totalComments: number; totalReplies: number },
): Promise<MergedClusters> {
  const oai = getClient();

  const input = `You are consolidating per-batch theme extractions from the YouTube comments of one video into a single final report.

VIDEO
Title: ${video.title}
Channel: ${video.channelTitle}
Total comments analyzed: ${totals.totalComments} (${totals.totalReplies} replies)

You are given a flat list of batch themes, each with a unique "ref", a category, a label, an example comment or two, and a count. Your job:
- Group batch themes that describe the SAME underlying topic into one cluster (e.g. "Candy Montgomery" + "Cover Candy Montgomery" → one cluster).
- Each cluster must list the "memberRefs" (the refs of every batch theme it contains) and keep the correct category.
- Give each cluster a clean, canonical label.
- A cluster's category should match its members; keep episode requests in "episodeRequests".
- Also write: an executive summary (3-6 sentences), 4-8 prioritized actionItems, an overall sentimentLabel, and a confidence (0-1).
- Do not drop any ref — every ref should belong to exactly one cluster.

BATCH THEMES (JSON)
${JSON.stringify(themes).slice(0, 120000)}`;

  return withRetry(
    async () => {
      const response = await oai.responses.parse({
        model: env.openaiModel,
        input,
        text: { format: zodTextFormat(MergedClustersSchema, "merged_clusters") },
      });
      const parsed = response.output_parsed;
      if (!parsed) {
        throw new AppError("OPENAI_ERROR", "OpenAI returned no parsed output for the merge.");
      }
      return parsed;
    },
    { retries: 1, baseDelayMs: 900 },
  );
}
