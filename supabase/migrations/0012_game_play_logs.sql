-- Attempt/completion tracking for Game Mode (Maze/Factory/Hybrid),
-- mirroring public.challenge_play_logs exactly (same columns, same RLS
-- shape) but pointing at game_levels instead of challenge_levels - Game
-- Mode is graded pass/fail in real time (evaluateGameLevelTick), same as
-- Challenge Mode, not a numeric score like play_logs.
-- Run once in the Supabase SQL Editor.

create table public.game_play_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_level_id uuid not null references public.game_levels (id) on delete cascade,
  is_success boolean not null default false,
  created_at timestamptz not null default now()
);

create index game_play_logs_user_id_idx on public.game_play_logs (user_id);
create index game_play_logs_game_level_id_idx on public.game_play_logs (game_level_id);

alter table public.game_play_logs enable row level security;

create policy "users manage own game play logs, teachers view all"
  on public.game_play_logs for select
  to authenticated
  using (auth.uid() = user_id or public.is_teacher(auth.uid()));

create policy "users insert own game play logs"
  on public.game_play_logs for insert
  to authenticated
  with check (auth.uid() = user_id);
