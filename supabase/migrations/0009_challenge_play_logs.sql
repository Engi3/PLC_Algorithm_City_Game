-- Task 5.1: attempt/completion tracking for Challenge Mode, mirroring
-- public.play_logs exactly (same columns, same RLS shape) but pointing at
-- challenge_levels instead of levels. The Challenge Browser (Task 5.1)
-- reads this table to show pass/fail status per challenge; the actual
-- write path (submitting a Challenge attempt via evaluateChallenge) is
-- Task 5.2's job - this migration only adds the table both need.
-- Run once in the Supabase SQL Editor.

create table public.challenge_play_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  challenge_level_id uuid not null references public.challenge_levels (id) on delete cascade,
  is_success boolean not null default false,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);

create index challenge_play_logs_user_id_idx on public.challenge_play_logs (user_id);
create index challenge_play_logs_challenge_level_id_idx on public.challenge_play_logs (challenge_level_id);

alter table public.challenge_play_logs enable row level security;

create policy "users manage own challenge play logs, teachers view all"
  on public.challenge_play_logs for select
  to authenticated
  using (auth.uid() = user_id or public.is_teacher(auth.uid()));

create policy "users insert own challenge play logs"
  on public.challenge_play_logs for insert
  to authenticated
  with check (auth.uid() = user_id);
