import { features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    hasOpenAI: features.hasOpenAI,
    hasYouTube: features.hasYouTube,
    hasSupabase: features.hasSupabase,
    model: process.env.OPENAI_MODEL ?? "gpt-5",
  });
}
