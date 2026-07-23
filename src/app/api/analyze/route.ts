import { NextRequest } from "next/server";
import { runAnalysis } from "@/lib/analyze";
import { features } from "@/lib/env";
import { AnalyzeRequestSchema, type ProgressEvent } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const missing: string[] = [];
  if (!features.hasYouTube) missing.push("YOUTUBE_API_KEY");
  if (!features.hasOpenAI) missing.push("OPENAI_API_KEY");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ProgressEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      // Keep the HTTP stream alive while OpenAI batches run (proxies often
      // drop silent connections after ~15–30s).
      const heartbeat = setInterval(() => {
        send({ type: "status", message: "Still analyzing…" });
      }, 8000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (missing.length) {
        send({
          type: "error",
          message: `Missing ${missing.join(" and ")}. Add your API key(s) in the environment and redeploy / restart.`,
        });
        close();
        return;
      }

      try {
        await runAnalysis(parsed.data.url, send);
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Analysis failed unexpectedly.",
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
