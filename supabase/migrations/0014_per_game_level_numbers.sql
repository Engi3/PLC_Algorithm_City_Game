-- Prep for splitting Maze/Factory into independently-numbered 50-level
-- tracks (Task: Maze/Factory 50-level expansion + new Hybrid game):
--
-- 1. level_number was globally unique across the whole table, forcing
--    Maze/Factory/Hybrid to share one 1-100 number line. Each game now
--    gets its own 1-50 sequence, so uniqueness moves to (game_id,
--    level_number) instead.
-- 2. Adds a 'hybrid' row to public.games for the new standalone Hybrid
--    game (was previously just the single Level 100 boss capstone under
--    Factory Simulator).
-- 3. Deletes the old Level 100 HYBRID boss level - confirmed with the
--    user (0 game_play_logs reference any game_levels row at the time of
--    writing, so this is not destroying real student progress) - a fresh
--    50-level Hybrid track replaces it as its own independent game rather
--    than folding the old boss in as a capstone.
--
-- Run once in the Supabase SQL Editor.

alter table public.game_levels
  drop constraint if exists game_levels_level_number_key;

alter table public.game_levels
  add constraint game_levels_game_id_level_number_key unique (game_id, level_number);

insert into public.games (slug, title_th, title_en, icon, sort_order) values
  ('hybrid', 'สายการผลิตอัจฉริยะ', 'Hybrid AGV+Factory', '⚡', 3);

delete from public.game_levels where game_type = 'HYBRID';
