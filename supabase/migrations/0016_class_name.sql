-- Final polishing phase, Task 1: adds a lightweight `class_name` grouping
-- to users so the teacher can assign students to a class/section and the
-- new Global Leaderboard can filter by it. Nullable text, no fixed list -
-- this project has no separate "classes" table, so a free-text label
-- (set by a teacher on the Manage Users page) is enough for the "sort by
-- class" filter without introducing a whole new entity.
--
-- Added to protect_system_managed_columns' reset list (0004_economy.sql /
-- 0013_mode_overrides_and_games.sql), same reasoning as game_mode_override:
-- without it, a student's own "update own profile" self-update could set
-- their own class_name, which should only be a teacher's call.
--
-- Run once in the Supabase SQL Editor.

alter table public.users
  add column class_name text;

create or replace function public.protect_system_managed_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_teacher(auth.uid()) then
    return new;
  end if;

  new.role := old.role;
  new.is_guest := old.is_guest;
  new.approval_status := old.approval_status;
  new.coins := old.coins;
  new.energy := old.energy;
  new.energy_updated_at := old.energy_updated_at;
  new.hint_credits := old.hint_credits;
  new.skip_tokens := old.skip_tokens;
  new.game_mode_override := old.game_mode_override;
  new.challenge_mode_override := old.challenge_mode_override;
  new.class_name := old.class_name;
  return new;
end;
$$;
