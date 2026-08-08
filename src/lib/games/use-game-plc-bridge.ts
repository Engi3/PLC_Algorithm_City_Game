"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runGridScan, type GridFlowResult } from "@/lib/ladder/grid-engine";
import { createEmptyMemory, type AnalogInputs, type Inputs, type SimMemory } from "@/lib/ladder/types";
import type { GridProgram } from "@/lib/ladder/grid-types";

/**
 * A game's own PLC I/O contract - what "sensors" it reports into a scan and
 * how a scan's "actuator" outputs advance its own state by one tick. Kept
 * generic over `TGameState` so the same bridge drives Maze, Factory, and any
 * future game type off one shared loop - see maze-plc-binding.ts/
 * factory-plc-binding.ts for the concrete standardized address maps.
 */
export type GamePlcBinding<TGameState> = {
  /** Reads the game's current sensor state into PLC inputs, before each scan. */
  readInputs: (state: TGameState) => { inputs: Inputs; analogInputs: AnalogInputs };
  /** Applies this scan's coil outputs (`memory.coils` - same shape as Inputs) to advance the game world by exactly one tick. Must be a pure function of its arguments - called from inside a state updater, same contract as a React state reducer. */
  step: (state: TGameState, outputs: Inputs, memory: SimMemory) => TGameState;
};

export type GamePlcBridge<TGameState> = {
  gameState: TGameState;
  memory: SimMemory;
  /** Per-cell power/conduct result from the most recent scan (Task 7) - threaded through so a consumer feeding this into GridEditorSurface can skip re-running evalGridFlow itself. */
  flows: GridFlowResult[];
  /** Sensor state as of the most recent tick - exposed so a caller can drive a live IoPanel-style readout the same way GridEditorSurface already shows manually-toggled inputs. */
  inputs: Inputs;
  analogInputs: AnalogInputs;
  running: boolean;
  toggleRunning: () => void;
  /** Unconditionally pauses - unlike `toggleRunning`, safe for a caller (e.g. the Task 3 level evaluator) that needs to guarantee the loop stops the instant a level resolves, without needing to know the current `running` value first. */
  stop: () => void;
  /** Advances exactly one PLC scan + one game tick, regardless of `running` - the same "single Step" affordance GridEditorSurface's own Step button already gives the ladder-only editor. */
  step: () => void;
  reset: (state: TGameState) => void;
};

const DEFAULT_TICKS_PER_SECOND = 5;
/** How many ticks a single requestAnimationFrame callback is allowed to catch up on at once - without this, resuming a backgrounded tab (where rAF was paused but real time kept passing) would replay a huge burst of ticks in one frame. */
const MAX_CATCHUP_TICKS = 10;

/**
 * Drives a game's own render state from a live PLC program. Each tick:
 * reads the game's current sensor state into PLC inputs
 * (`binding.readInputs`), runs one grid scan - the exact same `runGridScan`
 * GridEditorSurface's own Run/Step already uses, so timers/counters/SET-
 * RESET behave identically in a game level as in the plain ladder editor -
 * then feeds the scan's coil outputs back into the game to advance it one
 * step (`binding.step`).
 *
 * Driven by requestAnimationFrame with a fixed-timestep accumulator (not a
 * raw per-frame tick), so the PLC scan rate stays deterministic and
 * independent of the display's refresh rate - same reasoning
 * use-ladder-grid's own RUN mode uses a fixed setInterval for, just
 * rAF-driven here so it automatically pauses when the tab is backgrounded
 * instead of silently accumulating ticks.
 */
export type GameTickResult<TGameState> = {
  inputs: Inputs;
  analogInputs: AnalogInputs;
  memory: SimMemory;
  gameState: TGameState;
  ticksElapsed: number;
};

export function useGamePlcBridge<TGameState>(
  program: GridProgram,
  binding: GamePlcBinding<TGameState>,
  initialState: TGameState,
  options?: {
    ticksPerSecond?: number;
    /**
     * Fired after every tick with the exact snapshot that produced it - the
     * sensor `inputs`/`analogInputs` read at the START of the scan, paired
     * with the `memory`/`gameState` AFTER it, matching how challenge-eval.ts's
     * `checkAll`/`findSafetyViolation` already expect to be called (see
     * evaluate-game-level.ts, Task 3). Lets a caller layer a real-time
     * win/fail evaluator on top without this hook needing to know anything
     * about levels, success conditions, or safety constraints itself.
     */
    onTick?: (result: GameTickResult<TGameState>) => void;
  }
): GamePlcBridge<TGameState> {
  const [gameState, setGameState] = useState(initialState);
  const [memory, setMemory] = useState<SimMemory>(() => createEmptyMemory());
  const [flows, setFlows] = useState<GridFlowResult[]>(() => []);
  const [inputs, setInputs] = useState<Inputs>({});
  const [analogInputs, setAnalogInputs] = useState<AnalogInputs>({});
  const [running, setRunning] = useState(false);

  // Refs mirror the latest program/binding/state/memory for the rAF loop's
  // closure - same "don't re-subscribe the loop every render" reasoning
  // GridEditorSurface's own port-drag listeners and use-ladder-grid's RUN
  // interval already rely on (grid/binding/state identity changes every
  // render otherwise).
  const programRef = useRef(program);
  programRef.current = program;
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const onTickRef = useRef(options?.onTick);
  onTickRef.current = options?.onTick;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const ticksElapsedRef = useRef(0);

  const runOneTick = useCallback(() => {
    const { inputs, analogInputs } = bindingRef.current.readInputs(gameStateRef.current);
    const { memory: nextMemory, flows: nextFlows } = runGridScan(programRef.current, inputs, memoryRef.current, { tick: true }, analogInputs);
    const nextState = bindingRef.current.step(gameStateRef.current, nextMemory.coils, nextMemory);
    // Written synchronously (not just via setState) so several ticks queued
    // in the same rAF frame's catch-up loop each see the previous tick's
    // result immediately, without waiting for a React re-render in between.
    memoryRef.current = nextMemory;
    gameStateRef.current = nextState;
    ticksElapsedRef.current += 1;
    setMemory(nextMemory);
    setFlows(nextFlows);
    setGameState(nextState);
    setInputs(inputs);
    setAnalogInputs(analogInputs);
    onTickRef.current?.({ inputs, analogInputs, memory: nextMemory, gameState: nextState, ticksElapsed: ticksElapsedRef.current });
  }, []);

  useEffect(() => {
    if (!running) return;
    const tickMs = 1000 / (options?.ticksPerSecond ?? DEFAULT_TICKS_PER_SECOND);
    const maxCatchUpMs = tickMs * MAX_CATCHUP_TICKS;
    let raf = 0;
    let lastTime = performance.now();
    let accumulator = 0;

    function loop(now: number) {
      accumulator = Math.min(accumulator + (now - lastTime), maxCatchUpMs);
      lastTime = now;
      while (accumulator >= tickMs) {
        accumulator -= tickMs;
        runOneTick();
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, runOneTick, options?.ticksPerSecond]);

  const toggleRunning = useCallback(() => setRunning((r) => !r), []);
  const stop = useCallback(() => setRunning(false), []);
  const reset = useCallback((state: TGameState) => {
    setRunning(false);
    gameStateRef.current = state;
    memoryRef.current = createEmptyMemory();
    ticksElapsedRef.current = 0;
    setGameState(state);
    setMemory(memoryRef.current);
    setFlows([]);
    setInputs({});
    setAnalogInputs({});
  }, []);

  return {
    gameState,
    memory,
    flows,
    inputs,
    analogInputs,
    running,
    toggleRunning,
    stop,
    step: runOneTick,
    reset,
  };
}
