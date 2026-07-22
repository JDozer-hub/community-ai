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
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      if (missing.length) {
        send({
          type: "error",
          message: `Missing ${missing.join(" and ")} in .env.local. Add your API key(s) and restart the dev server.`,
        });
        controller.close();
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
        controller.close();
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
