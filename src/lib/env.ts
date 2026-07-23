/**
 * Centralised environment access. Server-only.
 * Nothing here is exposed to the client bundle.
 */

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. Add it to .env.local and restart the dev server.`,
    );
  }
  return v;
}

export const env = {
  get openaiApiKey() {
    return required("OPENAI_API_KEY");
  },
  get openaiModel() {
    // Fast default — gpt-5 is often too slow for multi-batch serverless runs.
    return optional("OPENAI_MODEL") ?? "gpt-4o-mini";
  },
  get youtubeApiKey() {
    return required("YOUTUBE_API_KEY");
  },
  get supabaseUrl() {
    return optional("SUPABASE_URL") ?? optional("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return (
      optional("SUPABASE_SERVICE_ROLE_KEY") ?? optional("SUPABASE_ANON_KEY")
    );
  },
};

/** Best-effort feature detection so the app degrades gracefully. */
export const features = {
  get hasOpenAI() {
    return Boolean(optional("OPENAI_API_KEY"));
  },
  get hasYouTube() {
    return Boolean(optional("YOUTUBE_API_KEY"));
  },
  get hasSupabase() {
    return Boolean(
      (optional("SUPABASE_URL") ?? optional("NEXT_PUBLIC_SUPABASE_URL")) &&
        (optional("SUPABASE_SERVICE_ROLE_KEY") ?? optional("SUPABASE_ANON_KEY")),
    );
  },
};
