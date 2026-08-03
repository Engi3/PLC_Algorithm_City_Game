import { runGridScan } from "@/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "@/lib/ladder/types";
import type { GridProgram } from "@/lib/ladder/grid-types";
import { createMazeGameState, mazeBinding } from "./maze-plc-binding";
import { createFactoryGameState, factoryBinding } from "./factory-plc-binding";
import { checkSuccessCondition, evaluateGameLevelTick, type GameLevelOutcome, type GameRunState } from "./evaluate-game-level";
import type { GameLevelSpec } from "./game-level-types";

const DEFAULT_MAX_TICKS = 600;

/**
 * Server-authoritative version of useGameLevelPlay's live loop (Task 2's
 * useGamePlcBridge, driven client-side via requestAnimationFrame) - a
 * plain synchronous replay to completion instead, safe to call from a
 * server action. Unlike Challenge Mode's scripted test-case frames, a
 * Game Level has no external randomness or mid-run user input at all -
 * outcome is fully determined by the initial state + the submitted
 * GridProgram - so replaying it here produces the exact same result the
 * student already saw live, giving submitGameLevelAction something to
 * verify against instead of trusting the client's own "outcome" state.
 * Mirrors the HYBRID phase-switch logic in use-game-level-play.ts (and
 * the same logic re-derived for the curriculum generator's own
 * verification harness in scripts/level-gen/generate-game-levels-81-100.ts)
 * exactly, so all three call sites can never quietly drift apart.
 */
export function runGameLevelToCompletion(program: GridProgram, spec: GameLevelSpec, maxTicks = DEFAULT_MAX_TICKS): GameLevelOutcome {
  let run: GameRunState = {
    maze: spec.gameType === "MAZE" || spec.gameType === "HYBRID" ? createMazeGameState(spec.mapLayout, spec.robotStart) : undefined,
    factory: spec.gameType === "FACTORY" || spec.gameType === "HYBRID" ? createFactoryGameState(spec.factoryInitial) : undefined,
  };
  let memory: SimMemory = createEmptyMemory();
  let phase: "factory" | "maze" = "factory";
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;

  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const usesMaze = spec.gameType === "MAZE" || (spec.gameType === "HYBRID" && phase === "maze");
    const binding = usesMaze ? mazeBinding : factoryBinding;
    const state = usesMaze ? run.maze! : run.factory!;
    const { inputs, analogInputs } = binding.readInputs(state as never);
    const { memory: nextMemory } = runGridScan(program, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = usesMaze
      ? { ...run, maze: mazeBinding.step(run.maze!, memory.coils, memory) }
      : { ...run, factory: factoryBinding.step(run.factory!, memory.coils, memory) };

    if (spec.gameType === "HYBRID" && phase === "factory") {
      const nonGoalConditions = spec.successConditions.filter((c) => !("kind" in c && c.kind === "reach_goal"));
      if (nonGoalConditions.every((c) => checkSuccessCondition(c, run, inputs, memory, analogInputs))) phase = "maze";
    }

    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }

  return outcome;
}
