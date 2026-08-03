import { checkAll, findSafetyViolation } from "@/lib/ladder/challenge-eval";
import type { AnalogInputs, Inputs, SimMemory } from "@/lib/ladder/types";
import type { GameLevelSpec, SuccessCondition } from "./game-level-types";
import type { MazeGameState } from "./maze-plc-binding";
import type { FactoryGameState } from "./factory-plc-binding";

/** Combined live state for whichever sub-game(s) a level's `gameType` uses - a HYBRID level carries both (see use-game-level-play.ts for how its two phases populate them). */
export type GameRunState = {
  maze?: MazeGameState;
  factory?: FactoryGameState;
};

export type GameLevelOutcome = { status: "playing" } | { status: "won" } | { status: "failed"; reason: string };

/** Exported so use-game-level-play.ts's HYBRID phase-switch check (has the factory phase's own non-`reach_goal` conditions all been met yet?) shares the exact same per-condition logic as the win-check below, instead of a second near-duplicate. */
export function checkSuccessCondition(
  cond: SuccessCondition,
  run: GameRunState,
  inputs: Inputs,
  memory: SimMemory,
  analogInputs: AnalogInputs
): boolean {
  if (cond.kind === "reach_goal") return run.maze?.status === "won";
  if (cond.kind === "process_items") return (run.factory?.processedCount ?? 0) >= cond.target;
  if (cond.kind === "sort_items") return (run.factory?.sortedCorrectCount ?? 0) >= cond.target;
  if (cond.kind === "return_items") return (run.factory?.returnedCount ?? 0) >= cond.target;
  return checkAll([cond], inputs, memory, analogInputs);
}

/**
 * Real-time tick evaluator for Game Levels - called once per PLC scan (the
 * same cadence useGamePlcBridge's `onTick` already fires at), unlike a plain
 * Level's static `evaluateGridLevel` (checked once, after a fixed frame
 * script) or a Challenge's `evaluateChallenge` (checked once per scripted
 * stage). A Maze level's own binding already resolves its own "failed" the
 * instant the robot enters a Hazard tile - checked first here so that still
 * ends the level immediately, ahead of the level's own `safetyConstraints`
 * (which target Factory-style numeric/bit faults a pure Maze level typically
 * has none of).
 *
 * Reuses challenge-eval.ts's `checkAll`/`findSafetyViolation` directly for
 * both `successConditions` (the StageExpectation-shaped ones) and
 * `safetyConstraints` - the exact same functions the Challenge Mode live
 * Play engine already checks frame-by-frame with, so a Game Level's
 * real-time grading can never quietly drift from a Challenge's.
 */
export function evaluateGameLevelTick(
  spec: GameLevelSpec,
  run: GameRunState,
  inputs: Inputs,
  memory: SimMemory,
  analogInputs: AnalogInputs,
  ticksElapsed: number
): GameLevelOutcome {
  if (run.maze?.status === "failed") return { status: "failed", reason: "hit_hazard" };

  const violation = spec.safetyConstraints ? findSafetyViolation(spec.safetyConstraints, inputs, memory, analogInputs) : null;
  if (violation) return { status: "failed", reason: violation.description };

  if (spec.timeLimitTicks !== undefined && ticksElapsed >= spec.timeLimitTicks) {
    return { status: "failed", reason: "time_limit_exceeded" };
  }

  const allMet = spec.successConditions.every((cond) => checkSuccessCondition(cond, run, inputs, memory, analogInputs));
  if (allMet) return { status: "won" };

  return { status: "playing" };
}
