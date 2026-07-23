"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MetricCard } from "@/components/metric-card";
import { SentimentDonut } from "@/components/sentiment-chart";
import { ThemeSectionCard } from "@/components/section-card";
import { CommentExplorer } from "@/components/comment-explorer";
import { EvidenceList } from "@/components/evidence";
import type { ExportFormat } from "@/lib/exporters";
import type { FullReport, StoredComment, VideoMeta } from "@/lib/schema";
import { compactNumber, formatDate, formatNumber } from "@/lib/utils";
import {
  Award,
  Check,
  Clapperboard,
  Copy,
  Download,
  Eye,
  FileJson,
  FileText,
  Film,
  Gauge,
  Heart,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  Mic,
  Repeat,
  Save,
  Shield,
  Sparkles,
  Table,
  ThumbsDown,
  ThumbsUp,
  Type as TypeIcon,
  Users,
  Wallet,
} from "lucide-react";

const SENTIMENT_BADGE: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  "Overwhelmingly Positive": "success",
  Positive: "success",
  Mixed: "warning",
  Negative: "destructive",
  "Overwhelmingly Negative": "destructive",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ReportView({
  video,
  report,
  comments,
  persisted,
  selectionNote,
}: {
  video: VideoMeta;
  report: FullReport;
  comments: StoredComment[];
  persisted: boolean;
  selectionNote?: string;
}) {
  return (
    <div className="space-y-6">
      <VideoHeader video={video} report={report} selectionNote={selectionNote} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Comments"
          value={formatNumber(report.totalComments)}
          sub={`${formatNumber(report.totalReplies)} replies`}
          icon={MessageSquare}
        />
        <MetricCard label="Views" value={compactNumber(video.viewCount)} icon={Eye} />
        <MetricCard label="Likes" value={compactNumber(video.likeCount)} icon={Heart} />
        <MetricCard
          label="Positive"
          value={`${Math.round(report.sentiment.positivePct)}%`}
          icon={ThumbsUp}
        />
        <MetricCard
          label="Negative"
          value={`${Math.round(report.sentiment.negativePct)}%`}
          icon={ThumbsDown}
        />
        <MetricCard
          label="Confidence"
          value={`${Math.round(report.confidence * 100)}%`}
          icon={Gauge}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Sparkles className="h-4 w-4 text-brand" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground/90">{report.summary}</p>
            {report.topComment && (
              <>
                <Separator className="my-4" />
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Award className="h-3.5 w-3.5" /> Top Comment
                  </div>
                  <blockquote className="glass-chip rounded-2xl p-3.5 text-sm">
                    “{report.topComment.text}”
                    <footer className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {report.topComment.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {formatNumber(report.topComment.likeCount)}
                      </span>
                      <span>{formatDate(report.topComment.publishedAt)}</span>
                    </footer>
                  </blockquote>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-[15px]">
              <span>Sentiment</span>
              <Badge variant={SENTIMENT_BADGE[report.sentiment.label] ?? "muted"}>
                {report.sentiment.label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SentimentDonut sentiment={report.sentiment} />
          </CardContent>
        </Card>
      </div>

      <ExportBar video={video} report={report} comments={comments} persisted={persisted} />

      <FutureEpisodesCard report={report} />

      <div className="grid gap-4 md:grid-cols-2">
        <ThemeSectionCard title="Positive Feedback" icon={ThumbsUp} items={report.positiveFeedback} accent="success" />
        <ThemeSectionCard title="Criticism" icon={ThumbsDown} items={report.criticism} accent="destructive" />
        <ThemeSectionCard title="Episode Requests" icon={Sparkles} items={report.episodeRequests} />
        <ThemeSectionCard title="Host Feedback" icon={Mic} items={report.hostFeedback} />
        <ThemeSectionCard title="Editing Feedback" icon={Clapperboard} items={report.editingFeedback} />
        <ThemeSectionCard title="Sponsor Feedback" icon={Wallet} items={report.sponsorFeedback} accent="warning" />
        <ThemeSectionCard title="Thumbnail Feedback" icon={ImageIcon} items={report.thumbnailFeedback} />
        <ThemeSectionCard title="Title Feedback" icon={TypeIcon} items={report.titleFeedback} />
        <ThemeSectionCard title="Recurring Topics" icon={Repeat} items={report.recurringTopics} />
        <ModerationCard report={report} />
      </div>

      <ActionItemsCard report={report} />

      <CommentExplorer comments={comments} />
    </div>
  );
}

function VideoHeader({
  video,
  report,
  selectionNote,
}: {
  video: VideoMeta;
  report: FullReport;
  selectionNote?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row">
        {video.thumbnail && (
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border sm:w-64"
          >
            <Image
              src={video.thumbnail}
              alt={video.title}
              fill
              sizes="256px"
              className="object-cover"
              unoptimized
            />
            {video.durationSeconds > 0 && (
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                {formatDuration(video.durationSeconds)}
              </span>
            )}
          </a>
        )}
        <div className="min-w-0 flex-1">
          {selectionNote && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--success)]/12 px-2 py-1 text-xs font-medium text-[var(--success)]">
              <Film className="h-3.5 w-3.5" />
              {selectionNote}
            </div>
          )}
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{video.channelTitle}</span>
            <span>·</span>
            <span>{formatDate(video.publishedAt)}</span>
          </div>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-lg font-semibold leading-snug hover:underline"
          >
            {video.title}
          </a>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="muted">{formatNumber(video.viewCount)} views</Badge>
            <Badge variant="muted">{formatNumber(video.likeCount)} likes</Badge>
            <Badge variant="muted">
              {formatNumber(report.totalComments)} comments analyzed
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FutureEpisodesCard({ report }: { report: FullReport }) {
  const items = report.mostRequestedFutureEpisodes;
  const max = Math.max(1, ...items.map((i) => i.mentionCount));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <Sparkles className="h-4 w-4 text-brand" />
          Most Requested Future Episodes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No specific episode requests detected.</p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {items.map((e, i) => (
              <AccordionItem key={`${e.title}-${i}`} value={`${i}`}>
                <AccordionTrigger className="py-3">
                  <div className="flex w-full flex-col gap-1.5 pr-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-left font-medium">
                        {i + 1}. {e.title}
                      </span>
                      <Badge variant="muted" className="shrink-0">
                        {formatNumber(e.mentionCount)} mentions
                      </Badge>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(e.mentionCount / max) * 100}%` }}
                      />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {e.supporters.length > 0 && (
                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> Top Supporters
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {e.supporters.map((s) => (
                          <span
                            key={s.authorChannelId ?? s.author}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs"
                          >
                            <span className="font-medium">{s.author}</span>
                            <span className="text-muted-foreground">
                              {s.commentCount} comment{s.commentCount === 1 ? "" : "s"}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Representative Comments
                  </div>
                  <EvidenceList comments={e.comments} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function ModerationCard({ report }: { report: FullReport }) {
  const issues = report.moderationIssues;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <span className="btn-glass flex h-8 w-8 items-center justify-center rounded-[0.9rem] text-brand">
            <Shield className="h-4 w-4" />
          </span>
          Moderation Issues
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moderation issues flagged.</p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {issues.map((m, i) => (
              <AccordionItem key={`${m.type}-${i}`} value={`${i}`}>
                <AccordionTrigger className="py-3">
                  <span className="flex w-full items-center justify-between gap-3 pr-2">
                    <Badge variant="destructive">{m.type}</Badge>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatNumber(m.count)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <EvidenceList comments={m.comments} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItemsCard({ report }: { report: FullReport }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Action Items
        </CardTitle>
      </CardHeader>
      <CardContent>
        {report.actionItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No action items.</p>
        ) : (
          <ol className="space-y-2">
            {report.actionItems.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{a}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ExportBar({
  video,
  report,
  comments,
  persisted,
}: {
  video: VideoMeta;
  report: FullReport;
  comments: StoredComment[];
  persisted: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const payload = { video, report, comments };

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, payload }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] ?? `report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function copySheetsRow() {
    setBusy("sheets");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "sheets", payload }),
      });
      const text = await res.text();
      const dataRow = text.split("\n")[1] ?? text;
      await navigator.clipboard.writeText(dataRow);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Table className="h-4 w-4" />
          <span>Export report</span>
          <Badge variant={persisted ? "success" : "muted"} className="ml-1">
            {persisted ? "Saved to Supabase" : "Not persisted"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => download("html")} disabled={busy === "html"}>
            <Save className="h-4 w-4" /> Save Report
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button size="sm" variant="outline" onClick={copySheetsRow} disabled={busy === "sheets"}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy Google Sheets Row"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("markdown")} disabled={busy === "markdown"}>
            <FileText className="h-4 w-4" /> Markdown
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("txt")} disabled={busy === "txt"}>
            <FileText className="h-4 w-4" /> TXT
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("json")} disabled={busy === "json"}>
            <FileJson className="h-4 w-4" /> JSON
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("csv")} disabled={busy === "csv"}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
