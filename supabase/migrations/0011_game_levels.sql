-- Game Engines Task 3: the 100-level Maze/Factory/Hybrid curriculum, kept as
-- its own table rather than folded into public.levels or challenge_levels -
-- these levels grade in real time against a simulated game world
-- (evaluate-game-level.ts's evaluateGameLevelTick, driven every PLC scan by
-- useGamePlcBridge), not a static truth-table/frame-script check, and carry
-- game-world setup (map_layout_json/robot_start_json/factory_initial_json)
-- neither existing table has a column for.
-- Run once in the Supabase SQL Editor.

create table public.game_levels (
  id uuid primary key default gen_random_uuid(),
  level_number integer not null unique check (level_number between 1 and 100),
  game_type text not null check (game_type in ('MAZE', 'FACTORY', 'HYBRID')),
  title text not null,
  description text not null,
  hints text[] not null default '{}',
  -- MazeMap (2D tile array) - required for MAZE/HYBRID, null for FACTORY.
  -- Shape-validated in TypeScript (gameLevelRowToSpec) per game_type, same
  -- "schema-validate in TS, not SQL" convention as levels.map_layout_json.
  map_layout_json jsonb,
  -- MazeRobotState (start x/y/direction) - required for MAZE/HYBRID.
  robot_start_json jsonb,
  -- FactoryState (belt/tank/heater initial values) - required for FACTORY/HYBRID.
  factory_initial_json jsonb,
  -- SuccessCondition[] (game-level-types.ts) - StageExpectation-shaped PLC
  -- address checks, reused directly from challenge-eval.ts, plus the
  -- game-world-derived reach_goal/process_items kinds.
  success_conditions_json jsonb not null default '[]'::jsonb,
  -- SafetyConstraint[], same shape challenge_levels' stages use - any one
  -- true at any tick ends the level in failure immediately.
  safety_constraints_json jsonb not null default '[]'::jsonb,
  -- Optional tick budget; null means untimed.
  time_limit_ticks integer,
  -- Optional PLC scan rate override for this level; null means
  -- useGamePlcBridge's own default (5 ticks/sec).
  ticks_per_second integer,
  created_at timestamptz not null default now()
);

create index game_levels_level_number_idx on public.game_levels (level_number);

alter table public.game_levels enable row level security;

-- Same access shape as public.levels/challenge_levels: any signed-in user
-- can read the curriculum (students need it to play), only teachers author it.
create policy "game levels are readable by any authenticated user"
  on public.game_levels for select
  to authenticated
  using (true);

create policy "only teachers manage game levels"
  on public.game_levels for all
  to authenticated
  using (public.is_teacher(auth.uid()))
  with check (public.is_teacher(auth.uid()));
