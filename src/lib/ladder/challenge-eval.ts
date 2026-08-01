import { readBit, readNumeric } from "./engine";
import { runGridScan } from "./grid-engine";
import type { GridProgram } from "./grid-types";
import { createEmptyMemory, type AnalogInputs, type Inputs, type SimMemory } from "./types";
import type { ChallengeSpec, ChallengeTestCase, StageExpectation } from "./challenge-types";

function checkExpectation(
  exp: StageExpectation,
  inputs: Inputs,
  memory: SimMemory,
  analogInputs: AnalogInputs
): boolean {
  if (exp.kind === "bit") return readBit(exp.address, inputs, memory) === exp.expected;
  const actual = readNumeric(exp.address, memory, analogInputs);
  switch (exp.operator) {
    case ">":
      return actual > exp.value;
    case "<":
      return actual < exp.value;
    case "==":
      return actual === exp.value;
    case ">=":
      return actual >= exp.value;
    case "<=":
      return actual <= exp.value;
  }
}

function checkAll(exps: StageExpectation[], inputs: Inputs, memory: SimMemory, analogInputs: AnalogInputs): boolean {
  return exps.every((exp) => checkExpectation(exp, inputs, memory, analogInputs));
}

export type StageResult = { stageId: string; stageName: string; passed: boolean };

export type SafetyFault = {
  constraintId: string;
  description: string;
  /** Which stage was active when the violation happened - identifies where in the sequence the student went wrong. */
  atStageId: string;
};

export type ChallengeTestCaseResult = {
  passed: boolean;
  /** Only the stages that actually got to run (a fault, or an earlier stage failing its checkpoint, stops the sequence - later stages are never attempted and don't appear here). */
  stageResults: StageResult[];
  /** Non-null exactly when a safety constraint was violated - takes priority over (and halts before) any stage checkpoint failure. */
  fault: SafetyFault | null;
};

/**
 * Plays back every stage's frames in order, checking every safety
 * constraint after each settle/tick and halting the instant one is
 * violated (Task 1's "immediately halt and fail" requirement) - a fault
 * short-circuits the whole test case, so stages after the violation point
 * never run and don't contribute a StageResult. Absent a fault, a stage
 * whose checkpoint fails also stops the sequence (you can't sensibly judge
 * stage 3 if stage 2 never actually completed), but this is a normal
 * failure, not a SafetyFault - distinguished so a failure message can say
 * "you never got %stage% to complete" versus "you caused an unsafe state".
 */
function runChallengeTestCase(program: GridProgram, testCase: ChallengeTestCase): ChallengeTestCaseResult {
  let memory = createEmptyMemory();
  let inputs: Inputs = {};
  let analogInputs: AnalogInputs = {};
  const stageResults: StageResult[] = [];
  let fault: SafetyFault | null = null;

  const safetyConstraints = testCase.safetyConstraints ?? [];

  function checkSafety(stageId: string): boolean {
    const violated = safetyConstraints.find((c) => checkAll(c.violatingWhen, inputs, memory, analogInputs));
    if (!violated) return false;
    fault = { constraintId: violated.id, description: violated.description, atStageId: stageId };
    return true;
  }

  stageLoop: for (const stage of testCase.stages) {
    for (const frame of stage.frames) {
      inputs = frame.inputs;
      analogInputs = frame.analogInputs ?? {};

      memory = runGridScan(program, inputs, memory, { tick: false }, analogInputs).memory;
      if (checkSafety(stage.id)) break stageLoop;

      for (let t = 0; t < frame.ticks; t++) {
        memory = runGridScan(program, inputs, memory, { tick: true }, analogInputs).memory;
        if (checkSafety(stage.id)) break stageLoop;
      }
    }

    const passed = checkAll(stage.expect, inputs, memory, analogInputs);
    stageResults.push({ stageId: stage.id, stageName: stage.name, passed });
    if (!passed) break;
  }

  const passed = fault === null && stageResults.length === testCase.stages.length && stageResults.every((r) => r.passed);
  return { passed, stageResults, fault };
}

export type ChallengeEvalResult = { passed: boolean; results: ChallengeTestCaseResult[] };

/** Runs every test case fresh from an empty program state (deterministic, no leftover memory between cases) - same top-level shape as evaluateGridLevel. */
export function evaluateChallenge(program: GridProgram, spec: ChallengeSpec): ChallengeEvalResult {
  const results = spec.testCases.map((tc) => runChallengeTestCase(program, tc));
  return { passed: results.every((r) => r.passed), results };
}
