import { z } from "zod";

/**
 * Schemas fall into two groups:
 *  - "AI" schemas (BatchAnalysis / MergedClusters) are what the model returns.
 *    They are "strict friendly" for the OpenAI Responses API (every property
 *    required, primitive-heavy). Crucially, the model references comments by
 *    their integer index — it never invents like counts, dates, or usernames.
 *  - "Report" schemas describe the assembled report, where every insight is
 *    backed by the REAL comment objects resolved in code.
 */

export const MODERATION_TYPES = [
  "Spam",
  "Threats",
  "Bots",
  "Hate Speech",
  "Scams",
  "Harassment",
  "Other",
] as const;
export type ModerationType = (typeof MODERATION_TYPES)[number];

export const SENTIMENT_LABELS = [
  "Overwhelmingly Positive",
  "Positive",
  "Mixed",
  "Negative",
  "Overwhelmingly Negative",
] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const THEME_CATEGORIES = [
  "positiveFeedback",
  "criticism",
  "episodeRequests",
  "hostFeedback",
  "editingFeedback",
  "thumbnailFeedback",
  "titleFeedback",
  "sponsorFeedback",
  "recurringTopics",
] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

/* ------------------------------------------------------------------ */
/* Raw comment (all original metadata is preserved, never discarded)   */
/* ------------------------------------------------------------------ */

export const StoredCommentSchema = z.object({
  commentId: z.string(),
  parentId: z.string().nullable(),
  author: z.string(),
  authorChannelId: z.string().nullable(),
  text: z.string(),
  likeCount: z.number().int(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  isReply: z.boolean(),
});
export type StoredComment = z.infer<typeof StoredCommentSchema>;

/* ------------------------------------------------------------------ */
/* AI output — batch analysis (references comments by index)           */
/* ------------------------------------------------------------------ */

export const SentimentCountsSchema = z.object({
  positive: z.number().int(),
  neutral: z.number().int(),
  negative: z.number().int(),
});

export const BatchThemeSchema = z.object({
  category: z.enum(THEME_CATEGORIES),
  label: z
    .string()
    .describe("Short, specific theme label, e.g. 'Cover Candy Montgomery' or 'Sponsor breaks too long'"),
  commentIndices: z
    .array(z.number().int())
    .describe("The # indices of EVERY comment in this batch that supports this theme (evidence is required)"),
});

export const BatchModerationSchema = z.object({
  type: z.enum(MODERATION_TYPES),
  commentIndices: z.array(z.number().int()),
});

export const BatchAnalysisSchema = z.object({
  sentiment: SentimentCountsSchema,
  themes: z.array(BatchThemeSchema),
  moderation: z.array(BatchModerationSchema),
});
export type BatchAnalysis = z.infer<typeof BatchAnalysisSchema>;

/* ------------------------------------------------------------------ */
/* AI output — merge step (clusters batch themes by short refs)        */
/* ------------------------------------------------------------------ */

export const ClusterSchema = z.object({
  category: z.enum(THEME_CATEGORIES),
  label: z.string().describe("Canonical, de-duplicated label for the merged theme"),
  memberRefs: z
    .array(z.string())
    .describe("The refs (e.g. 't3','t17') of the batch themes that belong to this cluster"),
});

export const MergedClustersSchema = z.object({
  summary: z.string().describe("Concise, decision-useful executive summary (3-6 sentences)"),
  sentimentLabel: z.enum(SENTIMENT_LABELS),
  confidence: z.number().describe("0-1 confidence based on comment volume and clarity of signal"),
  actionItems: z.array(z.string()).describe("4-8 concrete, prioritized recommendations"),
  clusters: z.array(ClusterSchema),
});
export type MergedClusters = z.infer<typeof MergedClustersSchema>;

/* ------------------------------------------------------------------ */
/* Assembled report — every insight carries the real comments          */
/* ------------------------------------------------------------------ */

export const ThemeGroupSchema = z.object({
  theme: z.string(),
  category: z.enum(THEME_CATEGORIES),
  mentionCount: z.number().int(),
  comments: z.array(StoredCommentSchema),
});
export type ThemeGroup = z.infer<typeof ThemeGroupSchema>;

export const SupporterSchema = z.object({
  author: z.string(),
  authorChannelId: z.string().nullable(),
  commentCount: z.number().int(),
});
export type Supporter = z.infer<typeof SupporterSchema>;

export const FutureEpisodeGroupSchema = z.object({
  title: z.string(),
  mentionCount: z.number().int(),
  supporters: z.array(SupporterSchema),
  comments: z.array(StoredCommentSchema),
});
export type FutureEpisodeGroup = z.infer<typeof FutureEpisodeGroupSchema>;

export const ModerationGroupSchema = z.object({
  type: z.enum(MODERATION_TYPES),
  count: z.number().int(),
  comments: z.array(StoredCommentSchema),
});
export type ModerationGroup = z.infer<typeof ModerationGroupSchema>;

export const FullReportSchema = z.object({
  summary: z.string(),
  confidence: z.number(),
  totalComments: z.number().int(),
  totalReplies: z.number().int(),
  sentimentLabel: z.enum(SENTIMENT_LABELS),
  sentiment: z.object({
    positive: z.number().int(),
    neutral: z.number().int(),
    negative: z.number().int(),
    positivePct: z.number(),
    neutralPct: z.number(),
    negativePct: z.number(),
    label: z.enum(SENTIMENT_LABELS),
  }),
  positiveFeedback: z.array(ThemeGroupSchema),
  criticism: z.array(ThemeGroupSchema),
  episodeRequests: z.array(ThemeGroupSchema),
  hostFeedback: z.array(ThemeGroupSchema),
  editingFeedback: z.array(ThemeGroupSchema),
  thumbnailFeedback: z.array(ThemeGroupSchema),
  titleFeedback: z.array(ThemeGroupSchema),
  sponsorFeedback: z.array(ThemeGroupSchema),
  recurringTopics: z.array(ThemeGroupSchema),
  mostRequestedFutureEpisodes: z.array(FutureEpisodeGroupSchema),
  moderationIssues: z.array(ModerationGroupSchema),
  actionItems: z.array(z.string()),
  topComment: StoredCommentSchema.nullable(),
});
export type FullReport = z.infer<typeof FullReportSchema>;

/* ------------------------------------------------------------------ */
/* API request / progress contracts                                    */
/* ------------------------------------------------------------------ */

export const AnalyzeRequestSchema = z.object({
  url: z.string().min(1, "Please paste a YouTube video or channel URL."),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export type VideoSelection = "direct" | "channel-latest-longform";

export type VideoMeta = {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  url: string;
};

export type ProgressEvent =
  | { type: "status"; message: string }
  | { type: "video"; video: VideoMeta; selection: VideoSelection; selectionNote: string }
  | {
      type: "comments";
      fetched: number;
      replies: number;
      done: boolean;
      message: string;
    }
  | { type: "batch"; index: number; total: number; message: string }
  | { type: "merge"; message: string }
  | {
      type: "done";
      runId: string;
      video: VideoMeta;
      report: FullReport;
      comments: StoredComment[];
      persisted: boolean;
      selectionNote: string;
    }
  | { type: "error"; message: string };
