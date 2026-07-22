"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import type { RunSummary } from "@/lib/db";
import { History, Loader2 } from "lucide-react";

export function RunHistory({
  runs,
  onSelect,
  loadingId,
}: {
  runs: RunSummary[];
  onSelect: (id: string) => void;
  loadingId: string | null;
}) {
  if (runs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent Analyses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              disabled={loadingId === r.id}
              className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
            >
              {r.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnail}
                  alt=""
                  className="h-10 w-16 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.video_title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{r.channel_title}</span>
                  <span>·</span>
                  <span>{formatNumber(r.total_comments)}</span>
                </div>
              </div>
              {loadingId === r.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant="muted" className="shrink-0 text-[10px]">
                  {r.sentiment_label}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
