import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, features } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key.
 * Returns null when Supabase isn't configured so the app degrades gracefully
 * (analysis still runs; persistence is simply skipped).
 */
export function getSupabase(): SupabaseClient | null {
  if (!features.hasSupabase) return null;
  if (cached) return cached;
  cached = createClient(env.supabaseUrl!, env.supabaseServiceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
