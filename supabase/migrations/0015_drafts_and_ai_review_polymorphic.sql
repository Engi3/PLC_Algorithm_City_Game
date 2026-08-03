-- Three additions needed together for "Save ladder / Ask AI for a hint /
-- AI review" across Challenge Mode and Game Mode (previously Levels-only):
--
-- 1. ladder_drafts: a generic "save my in-progress circuit, come back to
--    it later" slot, one row per (user, context). Deliberately NOT
--    play_logs (which is an append-only attempt history) - a draft is a
--    single mutable slot the student overwrites each time they hit Save,
--    same mental model as "Save" in a normal editor vs. "Submit".
--
-- 2. ai_evaluations made polymorphic: level_id is now nullable, with two
--    new nullable FKs (challenge_id, game_level_id) - exactly one of the
--    three must be set. /api/evaluate-submission already writes here for
--    Levels; this lets it do the same for Challenge/Game submissions
--    without a second table (Analytics' existing drill-down keeps working
--    unchanged for level_id rows, and gets new columns to embed for the
--    other two kinds).
--
-- 3. game_levels.reference_grid_program_json: the reference-solution GridProgram
--    each generate-*.ts script already builds and self-verifies against
--    the real engine, but never persisted. Backfilled by re-running the
--    existing generator + replace scripts (they already hold `solution`
--    in memory - only toRow() needed a new field), not by hand-editing
--    rows here.
--
-- Run once in the Supabase SQL Editor.

create table public.ladder_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  context_kind text not null check (context_kind in ('level', 'challenge', 'game')),
  context_id uuid not null,
  program_json jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, context_kind, context_id)
);

create index ladder_drafts_user_context_idx on public.ladder_drafts (user_id, context_kind, context_id);

alter table public.ladder_drafts enable row level security;

create policy "users manage their own drafts"
  on public.ladder_drafts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.ai_evaluations
  alter column level_id drop not null,
  add column challenge_id uuid references public.challenge_levels (id) on delete cascade,
  add column game_level_id uuid references public.game_levels (id) on delete cascade,
  add column context_kind text not null default 'level' check (context_kind in ('level', 'challenge', 'game'));

alter table public.ai_evaluations
  add constraint ai_evaluations_exactly_one_context check (
    (case when level_id is not null then 1 else 0 end) +
    (case when challenge_id is not null then 1 else 0 end) +
    (case when game_level_id is not null then 1 else 0 end) = 1
  );

create index ai_evaluations_challenge_id_idx on public.ai_evaluations (challenge_id);
create index ai_evaluations_game_level_id_idx on public.ai_evaluations (game_level_id);

alter table public.game_levels
  add column reference_grid_program_json jsonb;
