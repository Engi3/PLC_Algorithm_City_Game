import { readBit, runScan } from "./engine";
import { runGridScan } from "./grid-engine";
import type { GridProgram } from "./grid-types";
import { createEmptyMemory, type LadderProgram } from "./types";
import type { LevelSpec, LevelTestCase } from "./level-spec";

export type TestCaseResult = { index: number; passed: boolean };
export type LevelEvalResult = { passed: boolean; results: TestCaseResult[] };

function runTestCase(program: LadderProgram, testCase: LevelTestCase) {
  let memory = createEmptyMemory();

  for (const frame of testCase.frames) {
    const analogInputs = frame.analogInputs ?? {};
    memory = runScan(program, frame.inputs, memory, { tick: false }, analogInputs).memory;
    for (let t = 0; t < frame.ticks; t++) {
      memory = runScan(program, frame.inputs, memory, { tick: true }, analogInputs).memory;
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
    count += rung.outputs.length;
  }
  return count;
}

/**
 * Grid-native counterpart of runTestCase - identical scan-loop shape, just
 * against `runGridScan` (grid-engine.ts) instead of the legacy `runScan`.
 * Levels/Play migrated onto the grid editor natively rather than converting
 * through `gridProgramToProgram`, since that legacy-shape converter
 * silently truncates any row wired with more than 4 series instruction
 * cells (a real risk now that the grid editor supports mid-wire taps and
 * arbitrary branching) - grading a truncated copy of the student's actual
 * circuit would be a correctness bug, not just a display quirk.
 */
function runGridTestCase(program: GridProgram, testCase: LevelTestCase) {
  let memory = createEmptyMemory();

  for (const frame of testCase.frames) {
    const analogInputs = frame.analogInputs ?? {};
    memory = runGridScan(program, frame.inputs, memory, { tick: false }, analogInputs).memory;
    for (let t = 0; t < frame.ticks; t++) {
      memory = runGridScan(program, frame.inputs, memory, { tick: true }, analogInputs).memory;
    }
  }

  return Object.entries(testCase.expect).every(
    ([address, expected]) => readBit(address, {}, memory) === expected
  );
}

/** Grid-native counterpart of evaluateLevel - see runGridTestCase for why this exists alongside the legacy version rather than converting. */
export function evaluateGridLevel(program: GridProgram, level: LevelSpec): LevelEvalResult {
  const results = level.testCases.map((tc, index) => ({
    index,
    passed: runGridTestCase(program, tc),
  }));
  return { passed: results.every((r) => r.passed), results };
}

/** Grid-native counterpart of countBlocks - total placed nodes (contacts/comparisons/coils) across every rung's grid. */
export function countGridBlocks(program: GridProgram): number {
  let count = 0;
  for (const grid of program.grids) {
    for (const row of grid.cells) {
      for (const cell of row) {
        if (cell.node) count += 1;
      }
    }
  }
  return count;
}

export const MIN_SCORE = 20;
const MAX_SCORE = 100;
const PENALTY_PER_EXTRA_BLOCK = 10;

/** More blocks than the level's optimal count costs points; never scores below MIN_SCORE for a passing solution. */
export function computeScore(blocksUsed: number, optimalBlocksCount: number | null): number {
  if (!optimalBlocksCount || optimalBlocksCount <= 0) return MAX_SCORE;
  const extra = Math.max(0, blocksUsed - optimalBlocksCount);
  return Math.max(MIN_SCORE, MAX_SCORE - extra * PENALTY_PER_EXTRA_BLOCK);
}
