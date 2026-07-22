# Community AI

Automatically analyze YouTube communities. Paste a video or channel URL and get a
structured, decision-ready report of what the audience is actually saying — episode
requests, host/editing/thumbnail/title/sponsor feedback, recurring topics, moderation
issues, action items, and sentiment — built from **every** comment (fully paginated,
including replies).

Built with Next.js (App Router) + TypeScript + TailwindCSS + shadcn/ui, the OpenAI
Responses API (structured output validated with Zod), the YouTube Data API v3, and
Supabase (Postgres) for persistence.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

### Where to paste your API keys

Open **`.env.local`** in the project root and fill in:

```
OPENAI_API_KEY=sk-...            # https://platform.openai.com/api-keys
YOUTUBE_API_KEY=AIza...          # Google Cloud Console → Credentials (enable "YouTube Data API v3")
OPENAI_MODEL=gpt-5

# Optional — enables persistence / history / trend comparison
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Then **restart** the dev server (`Ctrl+C`, `npm run dev`).

The app runs without Supabase — analysis works immediately with just the OpenAI and
YouTube keys, and persistence is skipped until Supabase is configured.

### Enabling Supabase (optional but recommended)

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard: **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. Copy **Project Settings → API** → `Project URL` and the `service_role` key into
   `.env.local` as `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
4. Restart the dev server. New analyses are now saved and appear under "Recent Analyses".

## How it works

1. **Resolve** — parses video URLs (`youtu.be/…`, `watch?v=…`, `shorts/…`) and channel
   URLs (`@handle`, `/channel/…`, `/c/…`, `/user/…`). For a **channel** it skips every
   Short (duration ≤ 60s) and selects the most recent **long-form** upload ("Latest
   long-form upload selected."). If a channel has only Shorts it reports "No long-form
   uploads were found."
2. **Download** — fetches video metadata, then paginates through *every* comment thread
   and *every* reply, preserving all original metadata (commentId, parentId, username,
   authorChannelId, publishedAt, updatedAt, likeCount, textOriginal, isReply).
3. **Batch** — comments are chunked (never sent in one request) and each batch is
   analyzed by the OpenAI Responses API with a strict, Zod-validated schema. The model
   references comments **by index** and must attach supporting comment indices to every
   theme — so all evidence (username, likes, date) is real, never hallucinated.
4. **Merge** — a final pass clusters batch themes into canonical topics; the app then
   resolves indices back to the real comments, aggregates mention counts, ranks episode
   requests with their **top supporters**, and writes summary + action items + confidence.
5. **Persist & explore** — everything is stored in Supabase (videos, comments, runs,
   ai_reports) so you can compare trends over time. Every topic is expandable to show
   *every* related comment (username · 👍 likes · date), and the dashboard lets you
   search, filter, and sort the raw comments.

## Exports

- **Save Report** — downloads a single, self-contained `.html` file that reproduces the
  dashboard with the same expandable dropdown sections and reads/organizes **every**
  comment the same way (username · 👍 likes · date), plus a full comment database.
  Opens offline in any browser — nothing else required, so you can archive it forever.
- **Copy Google Sheets Row** — a tab-separated row for your existing tracker.
- **Markdown / TXT / JSON / CSV** — one-click downloads (JSON includes the full raw data).

## Scripts

```bash
npm run dev        # start dev server
npm run build      # production build
npm run start      # run the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Password-protecting the site

To lock a deployment down to your team, set `SITE_PASSWORD` (and optionally
`SITE_USERNAME`, which defaults to `manager`) in your environment / Vercel project
settings. Visitors then get a native browser username + password prompt. Leave
`SITE_PASSWORD` unset to disable the gate (e.g. for local development).

## Designed to grow

The persistence layer (`src/lib/db.ts`) and run-scoped storage are the seam for the
roadmap: Slack/Discord delivery, the Google Sheets API, multi-channel + multi-user,
scheduled daily reports, and email digests.
