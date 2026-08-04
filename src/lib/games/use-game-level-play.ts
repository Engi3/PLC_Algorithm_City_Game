"use client";

import { useMemo, useRef, useState } from "react";
import type { GridProgram } from "@/lib/ladder/grid-types";
import { useGamePlcBridge, type GamePlcBinding, type GamePlcBridge } from "./use-game-plc-bridge";
import { mazeBinding, hybridMazeBinding, createMazeGameState } from "./maze-plc-binding";
import { factoryBinding, createFactoryGameState } from "./factory-plc-binding";
import { checkSuccessCondition, evaluateGameLevelTick, type GameLevelOutcome, type GameRunState } from "./evaluate-game-level";
import type { GameLevelSpec } from "./game-level-types";

/**
 * Composes mazeBinding/factoryBinding into one GamePlcBinding<GameRunState>
 * for useGamePlcBridge, per the level's `gameType`. A HYBRID level can't run
 * both sub-bindings' scans simultaneously - the world simulation only
 * advances one domain per tick. It runs its Factory phase first, then
 * switches to its Maze phase once every non-`reach_goal` success condition
 * is met (`phaseRef`, flipped from the onTick callback below) - matching the
 * one concrete HYBRID scenario the curriculum spec describes (pack a batch,
 * then send the AGV to deliver it). The Maze half of a HYBRID level uses
 * hybridMazeBinding (X10-X12/Y10-Y12/AI10), not the standalone track's
 * mazeBinding (X0-X2/Y0-Y2/AI0) - see maze-plc-binding.ts's header comment -
 * so its addresses never collide with Factory's (X0-X1/Y0-Y7/AI1-AI3).
 */
function buildCombinedBinding(spec: GameLevelSpec, phaseRef: { current: "factory" | "maze" }): GamePlcBinding<GameRunState> {
  return {
    readInputs(run) {
      if (spec.gameType === "MAZE") return mazeBinding.readInputs(run.maze!);
      if (spec.gameType === "FACTORY") return factoryBinding.readInputs(run.factory!);
      return phaseRef.current === "factory" ? factoryBinding.readInputs(run.factory!) : hybridMazeBinding.readInputs(run.maze!);
    },
    step(run, outputs, memory) {
      if (spec.gameType === "MAZE") return { ...run, maze: mazeBinding.step(run.maze!, outputs, memory) };
      if (spec.gameType === "FACTORY") return { ...run, factory: factoryBinding.step(run.factory!, outputs, memory) };
      if (phaseRef.current === "factory") return { ...run, factory: factoryBinding.step(run.factory!, outputs, memory) };
      return { ...run, maze: hybridMazeBinding.step(run.maze!, outputs, memory) };
    },
  };
}

export type GameLevelPlay = {
  bridge: GamePlcBridge<GameRunState>;
  outcome: GameLevelOutcome;
  ticksElapsed: number;
  /** Convenience over bridge.reset(initialRun) - a caller (e.g. GamePlayClient's "เล่นใหม่" button) doesn't need to know or recompute the level's own initial state. */
  resetLevel: () => void;
};

/**
 * Drives one Game Level end to end: builds the right binding for its
 * `gameType`, runs it through useGamePlcBridge (Task 2), and evaluates
 * win/fail every tick (evaluate-game-level.ts) - stopping the bridge the
 * instant the level resolves, same as a real E-stop rather than continuing
 * to scan a level that's already won or failed.
 */
export function useGameLevelPlay(program: GridProgram, spec: GameLevelSpec): GameLevelPlay {
  const [outcome, setOutcome] = useState<GameLevelOutcome>({ status: "playing" });
  const [ticksElapsed, setTicksElapsed] = useState(0);
  const phaseRef = useRef<"factory" | "maze">("factory");
  // Assigned after useGamePlcBridge returns below - by the time onTick actually
  // fires (async, on a later tick), it always points at the real bridge.stop.
  const stopRef = useRef<() => void>(() => {});

  const initialRun = useMemo<GameRunState>(() => {
    const maze =
      spec.gameType === "MAZE" || spec.gameType === "HYBRID" ? createMazeGameState(spec.mapLayout, spec.robotStart) : undefined;
    const factory = spec.gameType === "FACTORY" || spec.gameType === "HYBRID" ? createFactoryGameState(spec.factoryInitial) : undefined;
    return { maze, factory };
  }, [spec]);

  const binding = useMemo(() => buildCombinedBinding(spec, phaseRef), [spec]);

  const bridge = useGamePlcBridge(program, binding, initialRun, {
    ticksPerSecond: spec.ticksPerSecond,
    onTick: ({ inputs, analogInputs, memory, gameState, ticksElapsed: n }) => {
      setTicksElapsed(n);

      if (spec.gameType === "HYBRID" && phaseRef.current === "factory") {
        const nonGoalConditions = spec.successConditions.filter((c) => !("kind" in c && c.kind === "reach_goal"));
        const factoryPhaseDone = nonGoalConditions.every((c) => checkSuccessCondition(c, gameState, inputs, memory, analogInputs));
        if (factoryPhaseDone) phaseRef.current = "maze";
      }

      const result = evaluateGameLevelTick(spec, gameState, inputs, memory, analogInputs, n);
      setOutcome(result);
      if (result.status !== "playing") stopRef.current();
    },
  });
  stopRef.current = bridge.stop;

  function resetLevel() {
    phaseRef.current = "factory";
    setOutcome({ status: "playing" });
    setTicksElapsed(0);
    bridge.reset(initialRun);
  }

  return { bridge, outcome, ticksElapsed, resetLevel };
}
