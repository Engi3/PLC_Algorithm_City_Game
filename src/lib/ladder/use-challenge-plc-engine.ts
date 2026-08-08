"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyMemory, type AnalogInputs, type Inputs, type SimMemory } from "./types";
import { runGridScan, type GridFlowResult } from "./grid-engine";
import type { GridProgram } from "./grid-types";
import { checkAll, findSafetyViolation, type SafetyFault } from "./challenge-eval";
import type { ChallengeTestCase } from "./challenge-types";

/**
 * Task 5.2: drives a ChallengeTestCase's scripted stages/frames forward one
 * scan at a time against the student's live GridProgram - the "physical
 * plant" the Interactive Process Panel visualizes. Mirrors
 * challenge-eval.ts's runChallengeTestCase exactly (same checkExpectation/
 * findSafetyViolation calls, same settle-then-tick order per frame, same
 * "a stage only runs if every earlier stage passed" and "a fault halts
 * immediately" rules) so the live walkthrough can never show a pass the
 * official Submit grading would disagree with - it just does it one
 * observable step at a time instead of all at once.
 */

export type StageStatus = "pending" | "active" | "passed" | "failed";

const AUTO_PLAY_INTERVAL_MS = 450;

type EngineState = {
  memory: SimMemory;
  flows: GridFlowResult[];
  inputs: Inputs;
  analogInputs: AnalogInputs;
  stageIndex: number;
  frameIndex: number;
  /** False = about to apply this frame's inputs and run its settle scan; true = settle scan done, remaining ticks (if any) are still due. */
  frameSettled: boolean;
  ticksRemaining: number;
  stageStatuses: StageStatus[];
  fault: SafetyFault | null;
  complete: boolean;
};

function initialState(stageCount: number): EngineState {
  return {
    memory: createEmptyMemory(),
    flows: [],
    inputs: {},
    analogInputs: {},
    stageIndex: 0,
    frameIndex: 0,
    frameSettled: false,
    ticksRemaining: 0,
    stageStatuses: Array.from({ length: stageCount }, (_, i) => (i === 0 ? "active" : "pending")),
    fault: null,
    complete: stageCount === 0,
  };
}

/** Stage's frames exhausted (or it had none) - check its checkpoint and either advance to the next stage or stop here, same as runChallengeTestCase's post-frame-loop check. */
function finishStage(testCase: ChallengeTestCase, state: EngineState): EngineState {
  const stage = testCase.stages[state.stageIndex];
  const passed = checkAll(stage.expect, state.inputs, state.memory, state.analogInputs);
  const stageStatuses = [...state.stageStatuses];
  stageStatuses[state.stageIndex] = passed ? "passed" : "failed";
  if (!passed) return { ...state, stageStatuses };

  const nextStageIndex = state.stageIndex + 1;
  if (nextStageIndex >= testCase.stages.length) return { ...state, stageStatuses, complete: true };
  stageStatuses[nextStageIndex] = "active";
  return { ...state, stageStatuses, stageIndex: nextStageIndex, frameIndex: 0, frameSettled: false };
}

function advance(program: GridProgram, testCase: ChallengeTestCase, state: EngineState): EngineState {
  if (state.fault || state.complete) return state;
  const stage = testCase.stages[state.stageIndex];
  const safetyConstraints = testCase.safetyConstraints ?? [];
  const frame = stage.frames[state.frameIndex];

  if (!frame) return finishStage(testCase, state);

  if (!state.frameSettled) {
    const inputs = frame.inputs;
    const analogInputs = frame.analogInputs ?? {};
    const { memory, flows } = runGridScan(program, inputs, state.memory, { tick: false }, analogInputs);
    const violated = findSafetyViolation(safetyConstraints, inputs, memory, analogInputs);
    if (violated) {
      return {
        ...state,
        inputs,
        analogInputs,
        memory,
        flows,
        fault: { constraintId: violated.id, description: violated.description, atStageId: stage.id },
      };
    }
    return { ...state, inputs, analogInputs, memory, flows, frameSettled: true, ticksRemaining: frame.ticks };
  }

  if (state.ticksRemaining > 0) {
    const { memory, flows } = runGridScan(program, state.inputs, state.memory, { tick: true }, state.analogInputs);
    const violated = findSafetyViolation(safetyConstraints, state.inputs, memory, state.analogInputs);
    if (violated) {
      return {
        ...state,
        memory,
        flows,
        fault: { constraintId: violated.id, description: violated.description, atStageId: stage.id },
      };
    }
    return { ...state, memory, flows, ticksRemaining: state.ticksRemaining - 1 };
  }

  if (state.frameIndex + 1 < stage.frames.length) {
    return { ...state, frameIndex: state.frameIndex + 1, frameSettled: false };
  }

  return finishStage(testCase, state);
}

export function useChallengePlcEngine(program: GridProgram, testCase: ChallengeTestCase | null) {
  const stageCount = testCase?.stages.length ?? 0;
  const [state, setState] = useState<EngineState>(() => initialState(stageCount));
  const [playing, setPlaying] = useState(false);

  const programRef = useRef(program);
  useEffect(() => {
    programRef.current = program;
  }, [program]);

  const testCaseRef = useRef(testCase);
  useEffect(() => {
    testCaseRef.current = testCase;
  }, [testCase]);

  const stepOnce = useCallback(() => {
    const tc = testCaseRef.current;
    if (!tc) return;
    setState((prev) => advance(programRef.current, tc, prev));
  }, []);

  const resetSim = useCallback(() => {
    setPlaying(false);
    setState(initialState(testCaseRef.current?.stages.length ?? 0));
  }, []);

  // Switching to a different challenge (new testCase identity) starts the walkthrough over from scratch.
  useEffect(() => {
    setPlaying(false);
    setState(initialState(testCase?.stages.length ?? 0));
  }, [testCase]);

  // Chained-timeout auto-play: reschedules after every state change, self-stopping on fault/completion. Avoids a stale-closure setInterval since each timeout reads the just-committed state.
  useEffect(() => {
    if (!playing) return;
    if (state.fault || state.complete) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(stepOnce, AUTO_PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, state, stepOnce]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);

  return {
    inputs: state.inputs,
    analogInputs: state.analogInputs,
    memory: state.memory,
    flows: state.flows,
    stageStatuses: state.stageStatuses,
    currentStageIndex: state.stageIndex,
    fault: state.fault,
    complete: state.complete,
    playing,
    play,
    pause,
    stepOnce,
    resetSim,
  };
}

export type ChallengePlcEngine = ReturnType<typeof useChallengePlcEngine>;
