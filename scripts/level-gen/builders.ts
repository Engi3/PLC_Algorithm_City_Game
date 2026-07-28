// Programmatic ladder-program builders + test-case derivation for the
// generated level dataset. Every test case's `expect` value is computed by
// actually running the real engine (runScan) against a real reference
// program - never hand-typed - so correctness is guaranteed by
// construction, not by manual arithmetic that could be wrong at this scale.

import { runScan, readBit } from "../../src/lib/ladder/engine";
import {
  createEmptyMemory,
  type Branch,
  type Contact,
  type ContactType,
  type Inputs,
  type LadderProgram,
  type Output,
  type Rung,
  type TimerVariant,
  type CounterVariant,
} from "../../src/lib/ladder/types";
import type { LevelFrame, LevelTestCase } from "../../src/lib/ladder/level-spec";

export function contact(type: ContactType, address: string): Contact {
  return { type, address };
}

export function branch(...cells: (Contact | null)[]): Branch {
  const padded = [...cells];
  while (padded.length < 4) padded.push(null);
  if (padded.length > 4) throw new Error("branch: too many cells (max 4 per branch)");
  return { cells: padded };
}

export function rung(id: string, branches: Branch[], output: Output | null): Rung {
  if (branches.length > 3) throw new Error("rung: too many branches (max 3)");
  return { id, branches, output };
}

export function coilOutput(address: string): Output {
  return { kind: "COIL", address };
}
export function setOutput(address: string): Output {
  return { kind: "SET", address };
}
export function resetOutput(address: string): Output {
  return { kind: "RESET", address };
}
export function timerOutput(address: string, variant: TimerVariant, preset: number): Output {
  return { kind: "TIMER", address, variant, preset };
}
export function counterOutput(address: string, variant: CounterVariant, preset: number): Output {
  return { kind: "COUNTER", address, variant, preset };
}

export function program(...rungs: Rung[]): LadderProgram {
  if (rungs.length > 12) throw new Error("program: too many rungs (max 12)");
  return { rungs };
}

/** Runs `frames` through the real engine and reads back the actual resulting values for `expectAddresses`. */
export function deriveTestCase(
  prog: LadderProgram,
  frames: LevelFrame[],
  expectAddresses: string[]
): LevelTestCase {
  let memory = createEmptyMemory();
  for (const frame of frames) {
    memory = runScan(prog, frame.inputs, memory, { tick: false }).memory;
    for (let t = 0; t < frame.ticks; t++) {
      memory = runScan(prog, frame.inputs, memory, { tick: true }).memory;
    }
  }
  const expect: Record<string, boolean> = {};
  for (const addr of expectAddresses) {
    expect[addr] = readBit(addr, {}, memory);
  }
  return { frames, expect };
}

/** All 2^n boolean combinations, e.g. n=2 -> [[F,F],[T,F],[F,T],[T,T]]. Capped at n<=3 (8 cases) by callers. */
export function allBooleanCombos(n: number): boolean[][] {
  const results: boolean[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    results.push(Array.from({ length: n }, (_, i) => (mask & (1 << i)) !== 0));
  }
  return results;
}

/** A single-frame combinational test case for the given input addresses/values. */
export function combinationalCase(
  prog: LadderProgram,
  inputAddrs: string[],
  values: boolean[],
  expectAddresses: string[]
): LevelTestCase {
  const inputs: Inputs = {};
  inputAddrs.forEach((addr, i) => (inputs[addr] = values[i]));
  return deriveTestCase(prog, [{ inputs, ticks: 0 }], expectAddresses);
}

export function countBlocks(prog: LadderProgram): number {
  let count = 0;
  for (const r of prog.rungs) {
    for (const b of r.branches) {
      count += b.cells.filter((c) => c !== null).length;
    }
    if (r.output) count += 1;
  }
  return count;
}
