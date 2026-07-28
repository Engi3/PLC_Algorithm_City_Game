import { readBit, runScan } from "./engine";
import { createEmptyMemory, type LadderProgram } from "./types";
import type { LevelSpec, LevelTestCase } from "./level-spec";

export type TestCaseResult = { index: number; passed: boolean };
export type LevelEvalResult = { passed: boolean; results: TestCaseResult[] };

function runTestCase(program: LadderProgram, testCase: LevelTestCase) {
  let memory = createEmptyMemory();

  for (const frame of testCase.frames) {
    memory = runScan(program, frame.inputs, memory, { tick: false }).memory;
    for (let t = 0; t < frame.ticks; t++) {
      memory = runScan(program, frame.inputs, memory, { tick: true }).memory;
    }
  }

  return Object.entries(testCase.expect).every(
    ([address, expected]) => readBit(address, {}, memory) === expected
  );
}

/** Runs every test case fresh from an empty program state (deterministic, no leftover memory between cases). */
export function evaluateLevel(program: LadderProgram, level: LevelSpec): LevelEvalResult {
  const results = level.testCases.map((tc, index) => ({
    index,
    passed: runTestCase(program, tc),
  }));
  return { passed: results.every((r) => r.passed), results };
}

/** Total placed contacts + outputs, used for the efficiency component of scoring. */
export function countBlocks(program: LadderProgram): number {
  let count = 0;
  for (const rung of program.rungs) {
    for (const branch of rung.branches) {
      count += branch.cells.filter((c) => c !== null).length;
    }
    if (rung.output) count += 1;
  }
  return count;
}

const MIN_SCORE = 20;
const MAX_SCORE = 100;
const PENALTY_PER_EXTRA_BLOCK = 10;

/** More blocks than the level's optimal count costs points; never scores below MIN_SCORE for a passing solution. */
export function computeScore(blocksUsed: number, optimalBlocksCount: number | null): number {
  if (!optimalBlocksCount || optimalBlocksCount <= 0) return MAX_SCORE;
  const extra = Math.max(0, blocksUsed - optimalBlocksCount);
  return Math.max(MIN_SCORE, MAX_SCORE - extra * PENALTY_PER_EXTRA_BLOCK);
}
