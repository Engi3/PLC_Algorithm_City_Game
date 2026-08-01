-- Challenge Mode Task 2: the 50-level high-difficulty industrial simulation
-- curriculum, kept as its own table rather than folded into public.levels -
-- Challenges have a different shape entirely (sequential multi-stage
-- test cases + safety constraints via stages_json, evaluated by
-- challenge-eval.ts's evaluateChallenge, not evaluateGridLevel) and a
-- different numbering space (challenge_id 1-50 vs. level_number 1-100).
-- Run once in the Supabase SQL Editor.

create table public.challenge_levels (
  id uuid primary key default gen_random_uuid(),
  challenge_id integer not null unique check (challenge_id between 1 and 50),
  title text not null,
  description text not null,
  -- Free-text competency tags (see RequiredCompetency in challenge-types.ts)
  -- - kept as a plain array rather than a Postgres enum so the tag set can
  -- grow without a migration, same reasoning as map_layout_json below being
  -- schema-validated in TypeScript (isChallengeSpec) rather than in SQL.
  required_competencies text[] not null default '{}',
  -- Progressive hints, same shape/intent as levels.map_layout_json's hints.
  hints text[] not null default '{}',
  -- { testCases: ChallengeTestCase[] } - see challenge-types.ts. Each test
  -- case holds its own sequential `stages` (frames + expect) and optional
  -- `safetyConstraints`, validated at read time by isChallengeStagesJson
  -- rather than a SQL CHECK, matching how map_layout_json/isLevelSpec
  -- already works for the existing Levels table.
  stages_json jsonb not null default '{}'::jsonb,
  -- Strict cap for the conciseness component of scoring (see
  -- computeChallengeScore in a later task) - unlike levels.optimal_blocks_count
  -- this is required, not nullable, since every Challenge must define one.
  max_optimal_blocks integer not null check (max_optimal_blocks > 0),
  -- The teacher's model solution in the grid editor's native shape, kept
  -- only so re-opening a challenge in the (future) authoring editor
  -- restores their work - never read by grading. Nullable: a challenge can
  -- exist before a reference solution has been authored for it.
  reference_grid_program_json jsonb,
  created_at timestamptz not null default now()
);

create index challenge_levels_challenge_id_idx on public.challenge_levels (challenge_id);

alter table public.challenge_levels enable row level security;

-- Same access shape as public.levels: any signed-in user can read the
-- curriculum (students need it to play), only teachers can author it.
create policy "challenge levels are readable by any authenticated user"
  on public.challenge_levels for select
  to authenticated
  using (true);

create policy "only teachers manage challenge levels"
  on public.challenge_levels for all
  to authenticated
  using (public.is_teacher(auth.uid()))
  with check (public.is_teacher(auth.uid()));
