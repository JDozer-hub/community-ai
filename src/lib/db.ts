import { getSupabase } from "./supabase";
import type { FullReport, StoredComment, VideoMeta } from "./schema";

/**
 * Persistence layer. Everything is best-effort: if Supabase isn't configured
 * (or a write fails), analysis still succeeds and the UI keeps working.
 * This is the seam we'll grow into multi-channel / scheduling / trends later.
 */

export type RunSummary = {
  id: string;
  created_at: string;
  video_id: string;
  video_title: string;
  channel_title: string;
  thumbnail: string;
  total_comments: number;
  sentiment_label: string;
};

export async function persistAnalysis(args: {
  runId: string;
  video: VideoMeta;
  comments: StoredComment[];
  report: FullReport;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { runId, video, comments, report } = args;

  try {
    // Upsert video.
    const { error: vErr } = await supabase.from("videos").upsert(
      {
        video_id: video.videoId,
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnail,
        channel_id: video.channelId,
        channel_title: video.channelTitle,
        published_at: video.publishedAt,
        view_count: video.viewCount,
        like_count: video.likeCount,
        comment_count: video.commentCount,
        duration_seconds: video.durationSeconds,
        url: video.url,
      },
      { onConflict: "video_id" },
    );
    if (vErr) throw vErr;

    // Insert run.
    const { error: rErr } = await supabase.from("runs").insert({
      id: runId,
      video_id: video.videoId,
      channel_id: video.channelId,
      channel_title: video.channelTitle,
      video_title: video.title,
      thumbnail: video.thumbnail,
      total_comments: report.totalComments,
      total_replies: report.totalReplies,
      sentiment_label: report.sentiment.label,
    });
    if (rErr) throw rErr;

    // Insert AI report.
    const { error: repErr } = await supabase.from("ai_reports").insert({
      run_id: runId,
      video_id: video.videoId,
      model: process.env.OPENAI_MODEL ?? "gpt-5",
      confidence: report.confidence,
      report,
    });
    if (repErr) throw repErr;

    // Bulk insert comments in chunks. Scoped by run so we can compare later.
    const rows = comments.map((c) => ({
      run_id: runId,
      video_id: video.videoId,
      comment_id: c.commentId,
      parent_id: c.parentId,
      author: c.author,
      author_channel_id: c.authorChannelId,
      text: c.text,
      like_count: c.likeCount,
      published_at: c.publishedAt,
      updated_at: c.updatedAt,
      is_reply: c.isReply,
    }));

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error: cErr } = await supabase.from("comments").insert(chunk);
      if (cErr) throw cErr;
    }

    return true;
  } catch (err) {
    console.error("[persistAnalysis] Supabase write failed:", err);
    return false;
  }
}

export async function listRuns(limit = 25): Promise<RunSummary[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("runs")
    .select(
      "id, created_at, video_id, video_title, channel_title, thumbnail, total_comments, sentiment_label",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listRuns] failed:", error);
    return [];
  }
  return (data ?? []) as RunSummary[];
}

export async function getRun(runId: string): Promise<{
  video: VideoMeta;
  report: FullReport;
  comments: StoredComment[];
} | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: run } = await supabase
    .from("runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (!run) return null;

  const { data: reportRow } = await supabase
    .from("ai_reports")
    .select("report")
    .eq("run_id", runId)
    .single();

  const { data: videoRow } = await supabase
    .from("videos")
    .select("*")
    .eq("video_id", run.video_id)
    .single();

  const { data: commentRows } = await supabase
    .from("comments")
    .select("*")
    .eq("run_id", runId)
    .order("like_count", { ascending: false });

  if (!reportRow || !videoRow) return null;

  const video: VideoMeta = {
    videoId: videoRow.video_id,
    title: videoRow.title,
    description: videoRow.description ?? "",
    thumbnail: videoRow.thumbnail ?? "",
    channelId: videoRow.channel_id,
    channelTitle: videoRow.channel_title,
    publishedAt: videoRow.published_at,
    viewCount: videoRow.view_count ?? 0,
    likeCount: videoRow.like_count ?? 0,
    commentCount: videoRow.comment_count ?? 0,
    durationSeconds: videoRow.duration_seconds ?? 0,
    url: videoRow.url,
  };

  const comments: StoredComment[] = (commentRows ?? []).map((c) => ({
    commentId: c.comment_id,
    parentId: c.parent_id,
    author: c.author,
    authorChannelId: c.author_channel_id,
    text: c.text,
    likeCount: c.like_count,
    publishedAt: c.published_at,
    updatedAt: c.updated_at ?? c.published_at,
    isReply: c.is_reply,
  }));

  return { video, report: reportRow.report as FullReport, comments };
}
