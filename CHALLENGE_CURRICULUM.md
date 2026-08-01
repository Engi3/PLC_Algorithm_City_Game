# Challenge Mode Curriculum Design (50 Levels)

Design spec for the high-difficulty industrial simulation curriculum built on Task 1's
`evaluateChallenge` engine (`src/lib/ladder/challenge-eval.ts`) and Task 2's
`challenge_levels` schema (`supabase/migrations/0008_challenge_levels.sql`). This
document is the rubric Task 4+ (seed data generation) is written against, so every
batch of challenges stays consistent in difficulty and structure instead of drifting
scenario-to-scenario.

## Chapter architecture

| Chapter | IDs | Theme | Competency emphasis |
| --- | --- | --- | --- |
| 1 | 1-10 | Advanced Safety & Interlocks | `NO_NC`, `INTERLOCK` |
| 2 | 11-20 | Sequential Pneumatics & Timers | `TIMER`, `INTERLOCK` |
| 3 | 21-30 | Batching & Counting Systems | `COUNTER`, `MATH` |
| 4 | 31-40 | Analog Process Control | `ANALOG`, `MATH` |
| 5 | 41-50 | Full Plant Integration | `ANALOG`, `TIMER`, `COUNTER`, `INTERLOCK` |

Each chapter's theme is also its dominant `required_competencies` tag(s), but every
challenge from Chapter 2 onward should carry at least one tag from an *earlier*
chapter too (e.g. a Chapter 4 analog challenge still needs an interlock or two) -
the curriculum is cumulative, not siloed, matching how a real automation project
never uses only one instruction family.

### Chapter 1 - Advanced Safety & Interlocks (1-10)

Complex motor control, opposing limit switches, emergency-stop sequences. No
timers/counters/analog required yet - the point is mastering `SafetyConstraint`
thinking (Task 1) with pure digital logic before adding time or count pressure.
Scenarios: reversing motor starters (forward/reverse interlock), two-hand safety
press circuits, E-stop chains with manual reset, opposing pneumatic cylinder
lockouts.

### Chapter 2 - Sequential Pneumatics & Timers (11-20)

Multi-cylinder step sequences (A+ B+ A- B-, and longer), precision timing for
curing/pressing/dwell stations. Introduces `TON`/`TOF`/`RTO` under sequential
`ChallengeStage` gating - a stage can't advance until the prior cylinder stroke's
limit switch is confirmed, exactly the "stage 2 only after stage 1" case Task 1's
evaluator was built for. Safety constraints here are almost always "two opposing
actuators must never both be commanded at once."

### Chapter 3 - Batching & Counting Systems (21-30)

Packaging lines, rejecting defective items by sensor count, batch-limit resets.
`CTU`/`CTD` become the primary instruction, usually paired with a `RESET` at the
end of each batch. Safety constraints shift from "two things at once" to
"don't exceed a count" (e.g. a reject pusher must never fire more than once per
detected item - an over-fire is itself a fault, not just a wrong final count).

### Chapter 4 - Analog Process Control (31-40)

Mixing tanks, temperature-threshold holding, weight-based conveyor speed. Every
challenge needs at least 2 `CMP` blocks (e.g. a hysteresis band: turn on below a
low threshold, off above a high one, never right at one exact value) - a single
threshold is Chapter-1-level and no longer sufficient here. Safety constraints
graduate to numeric ones (Task 1's `NumericExpectation`), e.g. "heater output must
never be on while `AI0 < 500`" instead of a plain digital tank-empty bit.

### Chapter 5 - Full Plant Integration (41-50)

Continuous-loop systems combining counting, timing, and analog thresholds in one
scenario (automated bottling plant, smart warehouse sorting). These are the only
challenges expected to need the full 6-stage `ChallengeStage` sequence and 2+
simultaneous `SafetyConstraint`s. Chapter 5 is where `maxOptimalBlocks` gets
loosest (see scaling table below) - the difficulty here is systems-integration
correctness under a long sequence, not code-golf conciseness.

## Difficulty scaling matrix

Concrete targets for Task 4+ to author against, so "harder" is a checkable property
and not just a vibe:

| Chapter | Stages per test case | Safety constraints | `maxOptimalBlocks` | Numeric (`CMP`) conditions |
| --- | --- | --- | --- | --- |
| 1 (1-10) | 1-2 | 1 | 8-12 | 0 |
| 2 (11-20) | 2-3 | 1-2 | 10-14 | 0 |
| 3 (21-30) | 2-3 | 1-2 | 10-15 | 0-1 |
| 4 (31-40) | 3-4 | 2 | 12-16 | 2+ |
| 5 (41-50) | 4-6 | 2-3 | 14-20 | 2+ |

`maxOptimalBlocks` rises with chapter because later scenarios genuinely need more
instructions to be *correct*, not because sloppier code should score better - the
conciseness penalty (existing `computeScore`/`PENALTY_PER_EXTRA_BLOCK` pattern) is
calibrated per-challenge against this ceiling, same mechanism the 100-level Levels
track already uses (`levels.optimal_blocks_count`).

## Numbering and continuity with the existing 100 Levels

Challenge Mode is a fully separate track (`challenge_levels`, `challenge_id`
1-50) from the existing Levels curriculum (`levels`, `level_number` 1-100) - it
does not replace or renumber the existing levels, and a student's Levels
progress/certificates are unaffected by Challenge Mode (that integration -
scoring, unlocks, dashboards - is intentionally out of scope until a later task).

## Content authoring checklist (per challenge)

Every challenge Task 4+ generates must specify, matching `ChallengeSpec`
(`src/lib/ladder/challenge-types.ts`):

1. `title` - short Thai scenario name.
2. `description` - the exact sequence AND every safety constraint spelled out
   in Technical Thai, precise enough that two different teachers would author
   the same `stages_json` from it.
3. `requiredCompetencies` - matching the chapter's emphasis (see table above).
4. `hints` - 2-3 progressive hints, general direction only (never the answer -
   same rule the existing Levels hints already follow).
5. `stages_json` (`testCases[].stages[]` + `.safetyConstraints[]`) - built to the
   stage/safety-constraint counts in the scaling matrix above.
6. `maxOptimalBlocks` - within the chapter's range above.
