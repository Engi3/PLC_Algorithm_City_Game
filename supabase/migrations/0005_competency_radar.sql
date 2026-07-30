-- Phase 12: 6-Axis Engineering Competency model. Run once in the Supabase SQL Editor.
--
-- Only the 4 axes that have no other data source to derive from get a
-- stored column here - `ladder_programming` (completion x conciseness) and
-- `problem_solving` (passed levels / total attempts) are fully derivable
-- from existing play_logs + levels data, so the app computes them on the
-- fly (src/lib/ladder/../analytics/competency.ts) instead of duplicating
-- that logic into a second, driftable source of truth.
--
--   ladder_programming  - computed in-app from play_logs + levels
--   wiring_skills       - stored here, teacher-graded (no auto component)
--   debugging_testing   - stored here, teacher-graded; app falls back to an
--                         auto "error recovery rate" when a level's first
--                         attempt failed but was eventually passed, only
--                         when the teacher hasn't graded it (null)
--   problem_solving     - computed in-app from play_logs
--   advanced_challenge  - stored here, reserved for the upcoming Challenge Mode
--   system_control      - stored here, reserved for the upcoming Adventures Mode

alter table public.student_scores
  add column wiring_skills numeric check (wiring_skills is null or (wiring_skills between 0 and 100)),
  add column debugging_testing numeric check (debugging_testing is null or (debugging_testing between 0 and 100)),
  add column advanced_challenge numeric check (advanced_challenge is null or (advanced_challenge between 0 and 100)),
  add column system_control numeric check (system_control is null or (system_control between 0 and 100));

-- Existing RLS policies on student_scores ("users view own scores, teachers
-- view all" / "only teachers write scores") apply at the row level, so they
-- automatically cover these new columns too - no policy changes needed.

-- ============================================================
-- Convenience view for ad-hoc SQL exploration (e.g. in the Supabase SQL
-- Editor) - mirrors the exact formulas used in computeCompetencyScores() so
-- a teacher can sanity-check a student's radar without opening the app.
-- The app itself does NOT query this view (it already has play_logs/levels
-- in memory from loadClassData() and computes the same numbers in
-- TypeScript, which is easier to unit-verify than a correlated SQL query).
-- security_invoker ensures RLS is enforced as the querying user, not the
-- view owner, in case this ever *is* queried through the app later.
-- ============================================================
create or replace view public.student_competency_scores
with (security_invoker = true) as
with level_totals as (
  select count(*)::numeric as total_levels from public.levels
),
best_scores as (
  select user_id, level_id, max(score) as best_score
  from public.play_logs
  where is_success
  group by user_id, level_id
),
per_student_passed as (
  select
    user_id,
    count(*) as levels_passed,
    avg(best_score) as avg_passed_score
  from best_scores
  group by user_id
),
per_student_attempts as (
  select
    user_id,
    count(*) as total_attempts,
    count(distinct level_id) filter (where is_success) as distinct_levels_passed
  from public.play_logs
  group by user_id
)
select
  u.id as user_id,
  round(
    coalesce(pp.levels_passed, 0) / nullif(lt.total_levels, 0)
    * coalesce(pp.avg_passed_score, 0)
  )::int as ladder_programming,
  ss.wiring_skills,
  ss.debugging_testing,
  round(
    coalesce(pa.distinct_levels_passed, 0)::numeric
    / nullif(pa.total_attempts, 0) * 100
  )::int as problem_solving,
  ss.advanced_challenge,
  ss.system_control
from public.users u
left join public.student_scores ss on ss.user_id = u.id
left join per_student_passed pp on pp.user_id = u.id
left join per_student_attempts pa on pa.user_id = u.id
cross join level_totals lt
where u.role = 'student';
