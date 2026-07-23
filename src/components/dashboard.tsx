"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressPanel, type PhaseState } from "@/components/progress-panel";
import { ReportView } from "@/components/report-view";
import { RunHistory } from "@/components/run-history";
import type { RunSummary } from "@/lib/db";
import type {
  FullReport,
  ProgressEvent,
  StoredComment,
  VideoMeta,
} from "@/lib/schema";
import {
  AlertCircle,
  ArrowRight,
  History,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
} from "lucide-react";

type Phase = "idle" | "running" | "done" | "error";

type Result = {
  video: VideoMeta;
  report: FullReport;
  comments: StoredComment[];
  persisted: boolean;
  selectionNote?: string;
};

const EXAMPLES = [
  "https://www.youtube.com/@CrimeHouse",
  "https://www.youtube.com/@HiddenHistory",
  "https://www.youtube.com/@Clues",
];

const EMPTY_PHASE: PhaseState = {
  status: "",
  video: null,
  comments: null,
  batch: null,
  merging: false,
};

export function Dashboard() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<PhaseState>(EMPTY_PHASE);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { runs: RunSummary[] };
      setRuns(data.runs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { runs: RunSummary[] };
        if (active) setRuns(data.runs ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const analyze = useCallback(
    async (target: string) => {
      const value = target.trim();
      if (!value || phase === "running") return;

      setPhase("running");
      setProgress({ ...EMPTY_PHASE, status: "Starting…" });
      setResult(null);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: value }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Accumulate video/comments so the "done" event isn't required to carry it.
        let liveVideo: VideoMeta | null = null;
        let finished = false;
        let lastStage = "starting";

        const handle = (event: ProgressEvent) => {
          switch (event.type) {
            case "status":
              if (event.message !== "Still analyzing…") {
                lastStage = event.message;
              }
              setProgress((p) => ({ ...p, status: event.message }));
              break;
            case "video":
              liveVideo = event.video;
              setProgress((p) => ({ ...p, video: event.video }));
              break;
            case "comments":
              setProgress((p) => ({
                ...p,
                status: event.message,
                comments: {
                  fetched: event.fetched,
                  replies: event.replies,
                  done: event.done,
                },
              }));
              break;
            case "batch":
              lastStage = `batch ${event.index}/${event.total}`;
              setProgress((p) => ({
                ...p,
                status: event.message,
                batch: { index: event.index, total: event.total },
              }));
              break;
            case "merge":
              lastStage = "merge";
              setProgress((p) => ({ ...p, status: event.message, merging: true }));
              break;
            case "done":
              finished = true;
              setResult({
                video: event.video ?? liveVideo!,
                report: event.report,
                comments: event.comments,
                persisted: event.persisted,
                selectionNote: event.selectionNote,
              });
              setPhase("done");
              refreshRuns();
              break;
            case "error":
              finished = true;
              setError(event.message);
              setPhase("error");
              break;
          }
        };

        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              handle(JSON.parse(trimmed) as ProgressEvent);
            } catch {
              /* ignore malformed partial line */
            }
          }
        }
        // Flush any trailing buffered line.
        if (buffer.trim()) {
          try {
            handle(JSON.parse(buffer.trim()) as ProgressEvent);
          } catch {
            /* ignore */
          }
        }

        if (!finished) {
          setError(
            lastStage.startsWith("batch") || lastStage === "merge"
              ? `The server closed the connection during ${lastStage}. This usually means the host timed out mid-analysis — try again, or use a video with fewer comments.`
              : "The analysis stream ended unexpectedly. Try again in a moment.",
          );
          setPhase("error");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [phase, refreshRuns],
  );

  const loadRun = useCallback(async (id: string) => {
    setLoadingRunId(id);
    try {
      const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load that run.");
      const data = (await res.json()) as Result;
      setResult({ ...data, persisted: true });
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that run.");
      setPhase("error");
    } finally {
      setLoadingRunId(null);
    }
  }, []);

  const resetToIdle = () => {
    setPhase("idle");
    setResult(null);
    setError(null);
    setUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToHistory = () => {
    document.getElementById("run-history")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 lg:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] gap-3 sm:min-h-[calc(100vh-2rem)] lg:gap-4">
        {/* Floating dark glass rail */}
        <aside className="glass-panel-dark hidden w-[72px] shrink-0 flex-col items-center rounded-[1.85rem] py-5 text-sidebar-foreground sm:flex">
          <div className="btn-glass-primary mb-8 flex h-11 w-11 items-center justify-center rounded-[1.15rem]">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <nav className="flex flex-1 flex-col items-center gap-2">
            <button
              type="button"
              onClick={resetToIdle}
              title="Analyze"
              className="btn-glass-dark flex h-11 w-11 items-center justify-center rounded-[1.15rem] text-sidebar-active"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={scrollToHistory}
              title="Recent analyses"
              className="btn-glass-dark flex h-11 w-11 items-center justify-center rounded-[1.15rem] text-sidebar-muted hover:text-sidebar-active"
            >
              <History className="h-5 w-5" />
            </button>
          </nav>
          <div className="btn-glass-dark mt-auto flex h-10 w-10 items-center justify-center rounded-[1.05rem] text-[11px] font-semibold tracking-wide text-[#c7d4ff]">
            CA
          </div>
        </aside>

        {/* Main frosted shell */}
        <div className="glass-panel flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.85rem] text-shell-foreground sm:rounded-[2.15rem]">
          <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
            <header className="mb-7 sm:mb-8">
              <div className="glass-chip mb-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-brand">
                <Sparkles className="h-3.5 w-3.5" />
                YouTube Community Intelligence
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-[#10182b] sm:text-[2.45rem]">
                    Community AI
                  </h1>
                  <p className="mt-1.5 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
                    Analyze comments, surface themes, and export producer-ready reports.
                  </p>
                </div>
                {phase === "done" && (
                  <Button variant="outline" size="sm" onClick={resetToIdle}>
                    New analysis
                  </Button>
                )}
              </div>
            </header>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    analyze(url);
                  }}
                  className="flex flex-col gap-3 sm:flex-row"
                >
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste a YouTube video or channel URL…"
                    className="h-12 flex-1 text-[15px]"
                    disabled={phase === "running"}
                    autoFocus
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 shrink-0"
                    disabled={phase === "running" || !url.trim()}
                  >
                    {phase === "running" ? "Analyzing…" : "Analyze Community"}
                    {phase !== "running" && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Try:</span>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        setUrl(ex);
                        analyze(ex);
                      }}
                      disabled={phase === "running"}
                      className="glass-chip rounded-full px-3 py-1 text-xs font-medium text-[#2a3550] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {ex.replace("https://www.youtube.com/", "")}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="mt-6 space-y-6">
              {phase === "running" && <ProgressPanel phase={progress} />}

              {phase === "error" && error && (
                <Card className="border-destructive/30">
                  <CardContent className="flex items-start gap-3 p-5">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <div>
                      <div className="font-medium">Analysis failed</div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{error}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {phase === "done" && result && (
                <>
                  <div className="flex items-center justify-between">
                    <Badge variant="brand" className="gap-1">
                      Analysis complete
                    </Badge>
                  </div>
                  <ReportView
                    video={result.video}
                    report={result.report}
                    comments={result.comments}
                    persisted={result.persisted}
                    selectionNote={result.selectionNote}
                  />
                </>
              )}

              {(phase !== "running") && (
                <div id="run-history">
                  <RunHistory runs={runs} onSelect={loadRun} loadingId={loadingRunId} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
