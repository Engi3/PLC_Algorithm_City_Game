-- Phase 13: AI code-review log. Run once in the Supabase SQL Editor.
--
-- One row per successful Gemini review from POST /api/evaluate-submission.
-- Separate from play_logs (which records every submit attempt, AI or not) -
-- this table only exists for reviews that actually got a Gemini response,
-- and is the data source for Phase 15's "past AI evaluation logs" teacher
-- drill-down.

create table public.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  level_id uuid not null references public.levels (id) on delete cascade,
  correctness integer not null check (correctness between 0 and 100),
  conciseness integer not null check (conciseness between 0 and 100),
  safety integer not null check (safety between 0 and 100),
  feedback text not null,
  coins_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_evaluations_user_id_idx on public.ai_evaluations (user_id);
create index ai_evaluations_level_id_idx on public.ai_evaluations (level_id);

alter table public.ai_evaluations enable row level security;

create policy "users view own ai evaluations, teachers view all"
  on public.ai_evaluations for select
  to authenticated
  using (auth.uid() = user_id or public.is_teacher(auth.uid()));

-- No insert/update/delete policy for regular roles: rows are written only
-- by /api/evaluate-submission via the service-role admin client, after it
-- has independently re-verified the submission's test cases pass server
-- side (mirrors how submitLevelAction writes student_scores).
