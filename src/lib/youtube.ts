import { env } from "./env";
import { AppError, withRetry } from "./errors";
import type { StoredComment, VideoMeta, VideoSelection } from "./schema";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** Videos this long or shorter are treated as Shorts. */
const SHORT_MAX_SECONDS = 60;

/** Parse an ISO 8601 duration (e.g. PT1M35S) into seconds. */
export function parseISODuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (
    (Number(d) || 0) * 86400 +
    (Number(h) || 0) * 3600 +
    (Number(min) || 0) * 60 +
    (Number(s) || 0)
  );
}

type ParsedTarget =
  | { kind: "video"; videoId: string }
  | { kind: "channelId"; channelId: string }
  | { kind: "handle"; handle: string }
  | { kind: "username"; username: string };

/** Parse a pasted YouTube URL (or bare id/handle) into a target. */
export function parseYouTubeInput(raw: string): ParsedTarget {
  const input = raw.trim();
  if (!input) throw new AppError("INVALID_URL", "Please paste a YouTube URL.");

  // Bare handle
  if (input.startsWith("@")) return { kind: "handle", handle: input.slice(1) };

  // Bare 11-char video id
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return { kind: "video", videoId: input };
  }

  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    throw new AppError("INVALID_URL", "That doesn't look like a valid URL.");
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0];
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return { kind: "video", videoId: id };
    throw new AppError("INVALID_URL", "Could not find a video id in that short link.");
  }

  if (host.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return { kind: "video", videoId: v };

    const first = parts[0]?.toLowerCase();
    if ((first === "watch" || first === "shorts" || first === "live" || first === "embed") && parts[1]) {
      const id = first === "watch" ? v ?? parts[1] : parts[1];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return { kind: "video", videoId: id };
    }
    if (parts[0]?.startsWith("@")) {
      return { kind: "handle", handle: parts[0].slice(1) };
    }
    if (first === "channel" && parts[1]) {
      return { kind: "channelId", channelId: parts[1] };
    }
    if ((first === "c" || first === "user") && parts[1]) {
      return { kind: "username", username: parts[1] };
    }
  }

  throw new AppError(
    "INVALID_URL",
    "Unsupported YouTube URL. Paste a video link or a channel link (e.g. https://www.youtube.com/@Channel).",
  );
}

async function ytFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams({ ...params, key: env.youtubeApiKey });
  const url = `${API_BASE}/${path}?${search.toString()}`;

  return withRetry(
    async () => {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        let reason = "";
        let message = `YouTube API error (${res.status}).`;
        try {
          const body = (await res.json()) as {
            error?: { message?: string; errors?: { reason?: string }[] };
          };
          reason = body.error?.errors?.[0]?.reason ?? "";
          if (body.error?.message) message = body.error.message;
        } catch {
          /* ignore parse errors */
        }
        if (reason === "commentsDisabled") {
          throw new AppError("COMMENTS_DISABLED", "Comments are disabled for this video.");
        }
        if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
          throw new AppError(
            "QUOTA_EXCEEDED",
            "YouTube API quota exceeded. Try again after the quota resets, or use a different API key.",
            429,
          );
        }
        if (res.status === 404) {
          throw new AppError("VIDEO_NOT_FOUND", "That video or channel could not be found.");
        }
        throw new AppError("YOUTUBE_ERROR", message, res.status);
      }
      return (await res.json()) as T;
    },
    {
      retries: 1,
      shouldRetry: (err) =>
        !(err instanceof AppError) ||
        err.code === "YOUTUBE_ERROR" ||
        err.status >= 500,
    },
  );
}

type YtVideoListResponse = {
  items?: {
    id: string;
    snippet: {
      title: string;
      description: string;
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      thumbnails: Record<string, { url: string; width: number }>;
    };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }[];
};

function bestThumbnail(thumbs: Record<string, { url: string; width: number }>): string {
  const order = ["maxres", "standard", "high", "medium", "default"];
  for (const key of order) if (thumbs[key]?.url) return thumbs[key].url;
  const any = Object.values(thumbs)[0];
  return any?.url ?? "";
}

type YtVideoItem = NonNullable<YtVideoListResponse["items"]>[number];

function toVideoMeta(item: YtVideoItem): VideoMeta {
  return {
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description ?? "",
    thumbnail: bestThumbnail(item.snippet.thumbnails ?? {}),
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
    durationSeconds: parseISODuration(item.contentDetails?.duration),
    url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

/** Fetch metadata for up to 50 video ids at once, preserving input order. */
async function getVideoMetaBatch(ids: string[]): Promise<VideoMeta[]> {
  if (ids.length === 0) return [];
  const data = await ytFetch<YtVideoListResponse>("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
  });
  const byId = new Map<string, VideoMeta>();
  for (const item of data.items ?? []) byId.set(item.id, toVideoMeta(item));
  return ids.map((id) => byId.get(id)).filter((v): v is VideoMeta => Boolean(v));
}

export async function getVideoMeta(videoId: string): Promise<VideoMeta> {
  const data = await ytFetch<YtVideoListResponse>("videos", {
    part: "snippet,statistics,contentDetails",
    id: videoId,
  });
  const item = data.items?.[0];
  if (!item) {
    throw new AppError("VIDEO_NOT_FOUND", "This video doesn't exist or has been deleted.");
  }
  return toVideoMeta(item);
}

type YtChannelListResponse = {
  items?: {
    id: string;
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
};

async function resolveChannelId(target: ParsedTarget): Promise<string> {
  if (target.kind === "channelId") return target.channelId;

  const params: Record<string, string> = { part: "id" };
  if (target.kind === "handle") params.forHandle = target.handle;
  else if (target.kind === "username") params.forUsername = target.username;
  else throw new AppError("CHANNEL_NOT_FOUND", "Not a channel URL.");

  const data = await ytFetch<YtChannelListResponse>("channels", params);
  let channelId = data.items?.[0]?.id;

  // Fallback: search for the handle/username if the direct lookup fails.
  if (!channelId) {
    const q = target.kind === "handle" ? `@${target.handle}` : target.username;
    const search = await ytFetch<{
      items?: { snippet?: { channelId?: string } }[];
    }>("search", { part: "snippet", type: "channel", q, maxResults: "1" });
    channelId = search.items?.[0]?.snippet?.channelId;
  }

  if (!channelId) {
    throw new AppError("CHANNEL_NOT_FOUND", "Could not resolve that channel.");
  }
  return channelId;
}

/**
 * For a channel URL, page through recent uploads (newest first), skip every
 * Short (duration <= 60s), and return the most recent long-form upload.
 */
export async function getLatestLongformForChannel(
  target: ParsedTarget,
  opts: { maxScan?: number } = {},
): Promise<VideoMeta> {
  const { maxScan = 200 } = opts;
  const channelId = await resolveChannelId(target);

  const channel = await ytFetch<YtChannelListResponse>("channels", {
    part: "contentDetails",
    id: channelId,
  });
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  let scanned = 0;
  let sawAnyVideo = false;
  let pageToken: string | undefined;

  if (uploads) {
    do {
      const params: Record<string, string> = {
        part: "contentDetails",
        playlistId: uploads,
        maxResults: "50",
      };
      if (pageToken) params.pageToken = pageToken;

      const playlist = await ytFetch<{
        nextPageToken?: string;
        items?: { contentDetails?: { videoId?: string } }[];
      }>("playlistItems", params);

      const ids = (playlist.items ?? [])
        .map((i) => i.contentDetails?.videoId)
        .filter((v): v is string => Boolean(v));

      if (ids.length) {
        sawAnyVideo = true;
        const metas = await getVideoMetaBatch(ids);
        const longform = metas.find((m) => m.durationSeconds > SHORT_MAX_SECONDS);
        if (longform) return longform;
      }

      scanned += ids.length;
      pageToken = playlist.nextPageToken;
    } while (pageToken && scanned < maxScan);
  }

  if (sawAnyVideo) {
    throw new AppError(
      "NO_LONGFORM",
      "No long-form uploads were found. This channel appears to publish only Shorts.",
    );
  }
  throw new AppError("VIDEO_NOT_FOUND", "This channel has no public videos to analyze.");
}

export type ResolvedVideo = { video: VideoMeta; selection: VideoSelection };

/** Resolve any pasted input to a concrete video to analyze. */
export async function resolveVideo(raw: string): Promise<ResolvedVideo> {
  const target = parseYouTubeInput(raw);
  if (target.kind === "video") {
    return { video: await getVideoMeta(target.videoId), selection: "direct" };
  }
  return {
    video: await getLatestLongformForChannel(target),
    selection: "channel-latest-longform",
  };
}

type CommentThreadResponse = {
  nextPageToken?: string;
  items?: {
    snippet: {
      totalReplyCount: number;
      topLevelComment: {
        id: string;
        snippet: {
          textDisplay: string;
          textOriginal: string;
          authorDisplayName: string;
          authorChannelId?: { value: string };
          likeCount: number;
          publishedAt: string;
          updatedAt: string;
        };
      };
    };
    replies?: {
      comments: {
        id: string;
        snippet: {
          parentId: string;
          textDisplay: string;
          textOriginal: string;
          authorDisplayName: string;
          authorChannelId?: { value: string };
          likeCount: number;
          publishedAt: string;
          updatedAt: string;
        };
      }[];
    };
  }[];
};

type RepliesResponse = {
  nextPageToken?: string;
  items?: {
    id: string;
    snippet: {
      parentId: string;
      textDisplay: string;
      textOriginal: string;
      authorDisplayName: string;
      authorChannelId?: { value: string };
      likeCount: number;
      publishedAt: string;
      updatedAt: string;
    };
  }[];
};

function decodeHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchAllReplies(parentId: string): Promise<StoredComment[]> {
  const out: StoredComment[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      part: "snippet",
      parentId,
      maxResults: "100",
      textFormat: "plainText",
    };
    if (pageToken) params.pageToken = pageToken;
    const data = await ytFetch<RepliesResponse>("comments", params);
    for (const c of data.items ?? []) {
      out.push({
        commentId: c.id,
        parentId: c.snippet.parentId,
        author: c.snippet.authorDisplayName,
        authorChannelId: c.snippet.authorChannelId?.value ?? null,
        text: decodeHtml(c.snippet.textOriginal || c.snippet.textDisplay),
        likeCount: c.snippet.likeCount ?? 0,
        publishedAt: c.snippet.publishedAt,
        updatedAt: c.snippet.updatedAt ?? c.snippet.publishedAt,
        isReply: true,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * Download every available comment for a video, fully paginated, including
 * replies. `onProgress` is called after each page so the caller can stream
 * counts to the UI.
 */
export async function fetchAllComments(
  videoId: string,
  onProgress?: (fetched: number, replies: number) => void,
  opts: { maxComments?: number } = {},
): Promise<StoredComment[]> {
  const { maxComments = 20000 } = opts;
  const comments: StoredComment[] = [];
  const seen = new Set<string>();
  let replyCount = 0;
  let pageToken: string | undefined;

  const push = (c: StoredComment) => {
    if (seen.has(c.commentId)) return;
    seen.add(c.commentId);
    comments.push(c);
    if (c.isReply) replyCount++;
  };

  do {
    const params: Record<string, string> = {
      part: "snippet,replies",
      videoId,
      maxResults: "100",
      order: "relevance",
      textFormat: "plainText",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await ytFetch<CommentThreadResponse>("commentThreads", params);

    for (const item of data.items ?? []) {
      const top = item.snippet.topLevelComment;
      push({
        commentId: top.id,
        parentId: null,
        author: top.snippet.authorDisplayName,
        authorChannelId: top.snippet.authorChannelId?.value ?? null,
        text: decodeHtml(top.snippet.textOriginal || top.snippet.textDisplay),
        likeCount: top.snippet.likeCount ?? 0,
        publishedAt: top.snippet.publishedAt,
        updatedAt: top.snippet.updatedAt ?? top.snippet.publishedAt,
        isReply: false,
      });

      const inlineReplies = item.replies?.comments ?? [];
      for (const r of inlineReplies) {
        push({
          commentId: r.id,
          parentId: r.snippet.parentId,
          author: r.snippet.authorDisplayName,
          authorChannelId: r.snippet.authorChannelId?.value ?? null,
          text: decodeHtml(r.snippet.textOriginal || r.snippet.textDisplay),
          likeCount: r.snippet.likeCount ?? 0,
          publishedAt: r.snippet.publishedAt,
          updatedAt: r.snippet.updatedAt ?? r.snippet.publishedAt,
          isReply: true,
        });
      }

      // If there are more replies than were returned inline, page through them.
      if (item.snippet.totalReplyCount > inlineReplies.length) {
        try {
          const rest = await fetchAllReplies(top.id);
          for (const r of rest) push(r);
        } catch {
          /* replies are best-effort; keep the top-level comment */
        }
      }

      onProgress?.(comments.length, replyCount);
      if (comments.length >= maxComments) return comments;
    }

    onProgress?.(comments.length, replyCount);
    pageToken = data.nextPageToken;
  } while (pageToken && comments.length < maxComments);

  return comments;
}
