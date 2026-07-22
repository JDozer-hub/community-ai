-- Community AI — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- or via `supabase db execute`. Safe to re-run.

create extension if not exists "pgcrypto";

-- Videos analyzed (deduplicated by YouTube video id).
create table if not exists public.videos (
  video_id       text primary key,
  title          text not null,
  description    text default '',
  thumbnail      text,
  channel_id     text,
  channel_title  text,
  published_at   timestamptz,
  view_count     bigint default 0,
  like_count     bigint default 0,
  comment_count  bigint default 0,
  duration_seconds integer default 0,
  url            text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Each analysis execution.
create table if not exists public.runs (
  id              uuid primary key default gen_random_uuid(),
  video_id        text references public.videos(video_id) on delete cascade,
  channel_id      text,
  channel_title   text,
  video_title     text,
  thumbnail       text,
  total_comments  integer default 0,
  total_replies   integer default 0,
  sentiment_label text,
  created_at      timestamptz not null default now()
);

-- Downloaded comments, scoped by run so trends can be compared over time.
create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid references public.runs(id) on delete cascade,
  video_id          text,
  comment_id        text not null,
  parent_id         text,
  author            text,
  author_channel_id text,
  text              text,
  like_count        integer default 0,
  published_at      timestamptz,
  updated_at        timestamptz,
  is_reply          boolean default false,
  created_at        timestamptz not null default now()
);

-- Structured AI reports (full JSON kept for later diffing / trend analysis).
create table if not exists public.ai_reports (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.runs(id) on delete cascade,
  video_id    text,
  model       text,
  confidence  double precision,
  report      jsonb not null,
  created_at  timestamptz not null default now()
);

-- Safe upgrades for databases created before these columns existed.
alter table public.videos   add column if not exists duration_seconds integer default 0;
alter table public.comments add column if not exists updated_at timestamptz;

create index if not exists idx_runs_video on public.runs(video_id);
create index if not exists idx_runs_channel on public.runs(channel_id);
create index if not exists idx_runs_created on public.runs(created_at desc);
create index if not exists idx_comments_run on public.comments(run_id);
create index if not exists idx_comments_video on public.comments(video_id);
create index if not exists idx_comments_text on public.comments using gin (to_tsvector('english', coalesce(text, '')));
create index if not exists idx_reports_run on public.ai_reports(run_id);

-- NOTE: For this server-side MVP we use the service role key from API routes,
-- which bypasses RLS. When you add Supabase Auth + client access later, enable
-- RLS and add per-user policies here.
