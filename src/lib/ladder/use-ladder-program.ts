"use client";

import { useEffect, useState } from "react";
import {
  createEmptyBranch,
  createEmptyMemory,
  createEmptyProgram,
  createEmptyRung,
  defaultOutputForKind,
  MAX_BRANCHES_PER_RUNG,
  MAX_RUNGS,
  type ContactType,
  type CounterVariant,
  type Inputs,
  type LadderProgram,
  type OutputKind,
  type SimMemory,
  type TimerVariant,
} from "./types";
import { runScan } from "./engine";

const TICK_MS = 600;

/**
 * Shared program-editing + simulation state for the ladder editor. Used by
 * both the student-facing playground and the teacher's level authoring
 * editor, so the two never drift in how a program is mutated or simulated.
 */
export function useLadderProgram(initial?: LadderProgram) {
  const [program, setProgram] = useState<LadderProgram>(() => initial ?? createEmptyProgram());
  const [inputs, setInputs] = useState<Inputs>({});
  const [memory, setMemory] = useState<SimMemory>(() => createEmptyMemory());
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setMemory((prevMemory) => runScan(program, inputs, prevMemory, { tick: true }).memory);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [running, program, inputs]);

  function updateProgram(updater: (prev: LadderProgram) => LadderProgram) {
    const next = updater(program);
    const { memory: newMemory } = runScan(next, inputs, memory, { tick: false });
    setProgram(next);
    setMemory(newMemory);
  }

  function loadProgram(next: LadderProgram) {
    const { memory: newMemory } = runScan(next, inputs, createEmptyMemory(), { tick: false });
    setProgram(next);
    setMemory(newMemory);
  }

  function toggleInput(address: string) {
    const nextInputs = { ...inputs, [address]: !inputs[address] };
    const { memory: newMemory } = runScan(program, nextInputs, memory, { tick: false });
    setInputs(nextInputs);
    setMemory(newMemory);
  }

  /** Sets an input to an explicit value, e.g. press/release for a momentary button (vs toggleInput's click-to-flip). */
  function setInputValue(address: string, value: boolean) {
    const nextInputs = { ...inputs, [address]: value };
    const { memory: newMemory } = runScan(program, nextInputs, memory, { tick: false });
    setInputs(nextInputs);
    setMemory(newMemory);
  }

  function step() {
    setMemory((prev) => runScan(program, inputs, prev, { tick: true }).memory);
  }

  function reset() {
    setInputs({});
    setMemory(createEmptyMemory());
    setRunning(false);
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
            ci === colIndex && c ? { ...c, address: address || null } : c
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

  function placeOutput(rungId: string, kind: OutputKind) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => (r.id === rungId ? { ...r, output: defaultOutputForKind(kind) } : r)),
    }));
  }

  function setOutputAddress(rungId: string, address: string) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId && r.output ? { ...r, output: { ...r.output, address: address || null } } : r
      ),
    }));
  }

  function setOutputVariant(rungId: string, variant: TimerVariant | CounterVariant) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => {
        if (r.id !== rungId || !r.output) return r;
        if (r.output.kind === "TIMER") {
          return { ...r, output: { ...r.output, variant: variant as TimerVariant } };
        }
        if (r.output.kind === "COUNTER") {
          return { ...r, output: { ...r.output, variant: variant as CounterVariant } };
        }
        return r;
      }),
    }));
  }

  function setOutputPreset(rungId: string, preset: number) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) =>
        r.id === rungId && r.output && (r.output.kind === "TIMER" || r.output.kind === "COUNTER")
          ? { ...r, output: { ...r.output, preset } }
          : r
      ),
    }));
  }

  function removeOutput(rungId: string) {
    updateProgram((p) => ({
      rungs: p.rungs.map((r) => (r.id === rungId ? { ...r, output: null } : r)),
    }));
  }

  return {
    program,
    inputs,
    memory,
    running,
    setRunning,
    loadProgram,
    toggleInput,
    setInputValue,
    step,
    reset,
    addRung,
    removeRung,
    addBranch,
    removeBranch,
    placeContact,
    setContactAddress,
    removeContact,
    placeOutput,
    setOutputAddress,
    setOutputVariant,
    setOutputPreset,
    removeOutput,
  };
}

export type LadderProgramApi = ReturnType<typeof useLadderProgram>;
