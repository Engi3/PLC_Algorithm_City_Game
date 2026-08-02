-- Task 5.3's original 50-challenge curriculum was capped at challenge_id
-- 1-50 by a check constraint. Now that teachers can create new challenges
-- from the UI (Create Challenge, numbered continuing from the current
-- max), that upper bound has to go - only the lower bound (must be
-- positive) and uniqueness still make sense. Run once in the Supabase SQL
-- Editor.

alter table public.challenge_levels drop constraint challenge_levels_challenge_id_check;
alter table public.challenge_levels add constraint challenge_levels_challenge_id_check check (challenge_id > 0);
