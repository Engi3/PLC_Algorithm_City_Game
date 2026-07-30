"use client";

import { useEffect, useState } from "react";
import {
  clampAnalogValue,
  createEmptyBranch,
  createEmptyMemory,
  createEmptyProgram,
  createEmptyRung,
  defaultOutputForKind,
  isComparisonBlock,
  MAX_BRANCHES_PER_RUNG,
  MAX_OUTPUTS_PER_RUNG,
  MAX_RUNGS,
  type AnalogInputs,
  type ComparisonBlock,
  type ContactType,
  type CounterVariant,
  type Inputs,
  type LadderProgram,
  type OutputKind,
  type SimMemory,
  type TimerVariant,
} from "./types";
import { runScan } from "./engine";

/** Task 4: RUN advances the scan loop at 10Hz - fast enough to feel automatic and continuous. */
const TICK_MS = 100;

/**
 * Shared program-editing + simulation state for the ladder editor. Used by
 * both the student-facing playground and the teacher's level authoring
 * editor, so the two never drift in how a program is mutated or simulated.
 */
export function useLadderProgram(initial?: LadderProgram) {
  const [program, setProgram] = useState<LadderProgram>(() => initial ?? createEmptyProgram());
  const [inputs, setInputs] = useState<Inputs>({});
  const [analogInputs, setAnalogInputs] = useState<AnalogInputs>({});
  const [memory, setMemory] = useState<SimMemory>(() => createEmptyMemory());
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setMemory((prevMemory) => runScan(program, inputs, prevMemory, { tick: true }, analogInputs).memory);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [running, program, inputs, analogInputs]);

  function updateProgram(updater: (prev: LadderProgram) => LadderProgram) {
    const next = updater(program);
    const { memory: newMemory } = runScan(next, inputs, memory, { tick: false }, analogInputs);
    setProgram(next);
    setMemory(newMemory);
  }

  /** `initialAnalogInputs` lets a loaded preset (e.g. a temperature-sensor example) start its sliders at a meaningful value. */
  function loadProgram(next: LadderProgram, initialAnalogInputs?: AnalogInputs) {
    const nextAnalogInputs = initialAnalogInputs ?? analogInputs;
    const { memory: newMemory } = runScan(next, inputs, createEmptyMemory(), { tick: false }, nextAnalogInputs);
    setProgram(next);
    setMemory(newMemory);
    if (initialAnalogInputs) setAnalogInputs(initialAnalogInputs);
  }

  function toggleInput(address: string) {
    const nextInputs = { ...inputs, [address]: !inputs[address] };
    const { memory: newMemory } = runScan(program, nextInputs, memory, { tick: false }, analogInputs);
    setInputs(nextInputs);
    setMemory(newMemory);
  }

  /** Sets an input to an explicit value, e.g. press/release for a momentary button (vs toggleInput's click-to-flip). */
  function setInputValue(address: string, value: boolean) {
    const nextInputs = { ...inputs, [address]: value };
    const { memory: newMemory } = runScan(program, nextInputs, memory, { tick: false }, analogInputs);
    setInputs(nextInputs);
    setMemory(newMemory);
  }

  /** Sets an AI0-AI15 analog value (clamped 0-32767) and re-evaluates immediately, so a comparison block reacts live as the slider moves. */
  function setAnalogInput(address: string, value: number) {
    const nextAnalogInputs = { ...analogInputs, [address]: clampAnalogValue(value) };
    const { memory: newMemory } = runScan(program, inputs, memory, { tick: false }, nextAnalogInputs);
    setAnalogInputs(nextAnalogInputs);
    setMemory(newMemory);
  }

  function step() {
    setMemory((prev) => runScan(program, inputs, prev, { tick: true }, analogInputs).memory);
  }

  function reset() {
    setInputs({});
    setAnalogInputs({});
    setMemory(createEmptyMemory());
    setRunning(false);
  }

  /**
   * Task 4: the discrete, visible action behind clicking "Stop" - immediately
   * drops every plain COIL output and clears each TIMER's EN flag, without
   * touching timer/counter accumulators (frozen, not reset - that's what
   * Reset is for) or SET-latched coils (real latches stay latched even with
   * the scan halted). A direct memory mutation, not a re-scan, so it isn't
   * immediately undone by the live inputs still sitting there energized.
   */
  function haltOutputs() {
    setMemory((prev) => {
      const coils = { ...prev.coils };
      const timers = { ...prev.timers };
      for (const rung of program.rungs) {
        for (const output of rung.outputs) {
          if (!output.address) continue;
          if (output.kind === "COIL") {
            coils[output.address] = false;
          } else if (output.kind === "TIMER" && timers[output.address]) {
            timers[output.address] = { ...timers[output.address], en: false };
          }
        }
      }
      return { ...prev, coils, timers };
    });
  }

  /** RUN starts the scan loop; STOP halts it and de-energizes non-latched outputs (see haltOutputs). */
  function toggleRunning() {
    if (running) {
      haltOutputs();
      setRunning(false);
    } else {
      setRunning(true);
    }
  }

  function addRung() {
    if (program.rungs.length >= MAX_RUNGS) return;
    updateProgram((p) => ({ rungs: [...p.rungs, createEmptyRung(crypto.randomUUID())] }));
  }

  function removeRung(rungId: string) {
    updateProgram((p) => ({ rungs: p.rungs.filter((r) => r.id !== rungId) }));
  }

  function addBranch(rungId: string) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId && r.branches.length < MAX_BRANCHES_PER_RUNG
          ? { ...r, branches: [...r.branches, createEmptyBranch()] }
          : r
      ),
    }));
  }

  function removeBranch(rungId: string, rowIndex: number) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId && r.branches.length > 1
          ? { ...r, branches: r.branches.filter((_, i) => i !== rowIndex) }
          : r
      ),
    }));
  }

  function placeContact(rungId: string, rowIndex: number, colIndex: number, type: ContactType) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId) return r;
        const branches = r.branches.map((b, ri) => {
          if (ri !== rowIndex) return b;
          const cells = b.cells.map((c, ci) => (ci === colIndex ? { type, address: null } : c));
          return { cells };
        });
        return { ...r, branches };
      }),
    }));
  }

  function setContactAddress(rungId: string, rowIndex: number, colIndex: number, address: string) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId) return r;
        const branches = r.branches.map((b, ri) => {
          if (ri !== rowIndex) return b;
          const cells = b.cells.map((c, ci) =>
            ci === colIndex && c && !isComparisonBlock(c) ? { ...c, address: address || null } : c
          );
          return { cells };
        });
        return { ...r, branches };
      }),
    }));
  }

  function placeComparison(rungId: string, rowIndex: number, colIndex: number) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId) return r;
        const branches = r.branches.map((b, ri) => {
          if (ri !== rowIndex) return b;
          const cells = b.cells.map((c, ci) =>
            ci === colIndex
              ? ({ kind: "COMPARE", operator: ">", sourceA: null, sourceB: { kind: "constant", value: 0 } } as const)
              : c
          );
          return { cells };
        });
        return { ...r, branches };
      }),
    }));
  }

  function updateComparison(rungId: string, rowIndex: number, colIndex: number, patch: Partial<ComparisonBlock>) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId) return r;
        const branches = r.branches.map((b, ri) => {
          if (ri !== rowIndex) return b;
          const cells = b.cells.map((c, ci) =>
            ci === colIndex && c && isComparisonBlock(c) ? { ...c, ...patch } : c
          );
          return { cells };
        });
        return { ...r, branches };
      }),
    }));
  }

  function removeContact(rungId: string, rowIndex: number, colIndex: number) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId) return r;
        const branches = r.branches.map((b, ri) => {
          if (ri !== rowIndex) return b;
          const cells = b.cells.map((c, ci) => (ci === colIndex ? null : c));
          return { cells };
        });
        return { ...r, branches };
      }),
    }));
  }

  /** Task 3: appends a new output to the rung's stack (up to MAX_OUTPUTS_PER_RUNG) rather than replacing a single slot. */
  function placeOutput(rungId: string, kind: OutputKind) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId && r.outputs.length < MAX_OUTPUTS_PER_RUNG
          ? { ...r, outputs: [...r.outputs, defaultOutputForKind(kind)] }
          : r
      ),
    }));
  }

  function setOutputAddress(rungId: string, outputIndex: number, address: string) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId
          ? {
              ...r,
              outputs: r.outputs.map((o, i) => (i === outputIndex ? { ...o, address: address || null } : o)),
            }
          : r
      ),
    }));
  }

  function setOutputVariant(rungId: string, outputIndex: number, variant: TimerVariant | CounterVariant) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId) return r;
        return {
          ...r,
          outputs: r.outputs.map((o, i) => {
            if (i !== outputIndex) return o;
            if (o.kind === "TIMER") return { ...o, variant: variant as TimerVariant };
            if (o.kind === "COUNTER") return { ...o, variant: variant as CounterVariant };
            return o;
          }),
        };
      }),
    }));
  }

  function setOutputPreset(rungId: string, outputIndex: number, preset: number) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId
          ? {
              ...r,
              outputs: r.outputs.map((o, i) =>
                i === outputIndex && (o.kind === "TIMER" || o.kind === "COUNTER") ? { ...o, preset } : o
              ),
            }
          : r
      ),
    }));
  }

  function removeOutput(rungId: string, outputIndex: number) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId ? { ...r, outputs: r.outputs.filter((_, i) => i !== outputIndex) } : r
      ),
    }));
  }

  return {
    program,
    inputs,
    analogInputs,
    memory,
    running,
    toggleRunning,
    loadProgram,
    toggleInput,
    setInputValue,
    setAnalogInput,
    step,
    reset,
    addRung,
    removeRung,
    addBranch,
    removeBranch,
    placeContact,
    setContactAddress,
    placeComparison,
    updateComparison,
    removeContact,
    placeOutput,
    setOutputAddress,
    setOutputVariant,
    setOutputPreset,
    removeOutput,
  };
}

export type LadderProgramApi = ReturnType<typeof useLadderProgram>;
