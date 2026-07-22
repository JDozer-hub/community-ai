"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { VideoMeta } from "@/lib/schema";
import { CheckCircle2, Loader2 } from "lucide-react";

export type PhaseState = {
  status: string;
  video: VideoMeta | null;
  comments: { fetched: number; replies: number; done: boolean } | null;
  batch: { index: number; total: number } | null;
  merging: boolean;
};

export function ProgressPanel({ phase }: { phase: PhaseState }) {
  const steps: { label: string; state: "done" | "active" | "pending"; detail?: string }[] = [];

  steps.push({
    label: "Resolve video",
    state: phase.video ? "done" : "active",
    detail: phase.video ? phase.video.title : undefined,
  });

  steps.push({
    label: "Download comments",
    state: phase.comments?.done
      ? "done"
      : phase.video
        ? "active"
        : "pending",
    detail: phase.comments
      ? `${formatNumber(phase.comments.fetched)} comments found${
          phase.comments.replies ? ` · ${formatNumber(phase.comments.replies)} replies` : ""
        }`
      : undefined,
  });

  const batchState: "done" | "active" | "pending" = phase.merging
    ? "done"
    : phase.batch
      ? "active"
      : "pending";
  steps.push({
    label: "AI batch analysis",
    state: batchState,
    detail: phase.batch ? `Batch ${phase.batch.index} / ${phase.batch.total}` : undefined,
  });

  steps.push({
    label: "Final merge",
    state: phase.merging ? "active" : "pending",
  });

  const batchPct = phase.batch ? (phase.batch.index / phase.batch.total) * 100 : 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          {phase.status || "Working…"}
        </div>

        <div className="space-y-3">
          {steps.map((s) => (
            <div key={s.label} className="flex items-start gap-3">
              <div className="mt-0.5">
                {s.state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                ) : s.state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted" />
                )}
              </div>
              <div className="flex-1">
                <div
                  className={cn(
                    "text-sm",
                    s.state === "pending" ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {s.label}
                </div>
                {s.detail && (
                  <div className="truncate text-xs text-muted-foreground">{s.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {phase.batch && !phase.merging && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Analyzing batches</span>
              <Badge variant="muted">
                {phase.batch.index} / {phase.batch.total}
              </Badge>
            </div>
            <Progress value={batchPct} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
