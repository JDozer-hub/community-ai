import { listRuns } from "@/lib/db";
import { features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listRuns();
  return Response.json({ runs, supabase: features.hasSupabase });
}
