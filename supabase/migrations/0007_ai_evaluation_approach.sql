-- Phase 4 (grid migration): adds a 4th Gemini-scored axis to ai_evaluations,
-- judging the student's chosen approach/reasoning rather than just
-- correctness/conciseness/safety - see /api/evaluate-submission's prompt.

alter table public.ai_evaluations
  add column approach integer not null default 0 check (approach between 0 and 100);

alter table public.ai_evaluations
  alter column approach drop default;
