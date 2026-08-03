-- Two independent additions, batched into one migration since both are
-- needed together for this round of Game Mode work:
--
-- 1. Per-student teacher override for Challenge Mode / Game Mode unlock -
--    a special case on top of the normal 50%-per-category gate
--    (checkLevelGate in challenge-unlock.ts, reused for Game Mode).
--    Null means "use the normal gate"; 'unlocked'/'locked' force the
--    result either way, e.g. unlocking a struggling student's favorite
--    mode early, or locking a mode for a student who's misusing it.
--    Added to protect_system_managed_columns' reset list (0004_economy.sql)
--    for the same reason coins/energy are there - without it, a student's
--    own "update own profile" self-update could set their own override,
--    defeating the whole point. Only a teacher (or service_role) may set it.
--
-- 2. A `games` table grouping game_levels by which simulated game they
--    belong to (Maze Explorer, Factory Simulator, and room for more later)
--    - replaces inferring this from game_type alone, since a future game
--    might reuse MAZE/FACTORY/HYBRID mechanics under a different theme.
--
-- Run once in the Supabase SQL Editor.

alter table public.users
  add column game_mode_override text check (game_mode_override in ('locked', 'unlocked')),
  add column challenge_mode_override text check (challenge_mode_override in ('locked', 'unlocked'));

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
  return new;
end;
$$;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_th text not null,
  title_en text not null,
  icon text not null,
  sort_order integer not null
);

alter table public.games enable row level security;

create policy "games are readable by any authenticated user"
  on public.games for select
  to authenticated
  using (true);

create policy "only teachers manage games"
  on public.games for all
  to authenticated
  using (public.is_teacher(auth.uid()))
  with check (public.is_teacher(auth.uid()));

insert into public.games (slug, title_th, title_en, icon, sort_order) values
  ('maze', 'เขาวงกตอัจฉริยะ', 'Maze Explorer', '🤖', 1),
  ('factory', 'โรงงานจำลอง', 'Factory Simulator', '🏭', 2);

alter table public.game_levels
  add column game_id uuid references public.games (id);

-- Existing levels: MAZE -> maze game, FACTORY/HYBRID -> factory game (the
-- one existing HYBRID level, the boss, starts in the factory and only
-- hands off to a maze delivery run at the end - it reads as a Factory
-- Simulator capstone, not a Maze Explorer level).
update public.game_levels
set game_id = (select id from public.games where slug = 'maze')
where game_type = 'MAZE';

update public.game_levels
set game_id = (select id from public.games where slug = 'factory')
where game_type in ('FACTORY', 'HYBRID');

alter table public.game_levels
  alter column game_id set not null;

create index game_levels_game_id_idx on public.game_levels (game_id);
