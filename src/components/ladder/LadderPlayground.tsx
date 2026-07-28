"use client";

import { useEffect, useState } from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import {
  contactAddressOptions,
  createEmptyBranch,
  createEmptyMemory,
  createEmptyProgram,
  createEmptyRung,
  defaultOutputForKind,
  isOutputAddressTaken,
  MAX_BRANCHES_PER_RUNG,
  MAX_RUNGS,
  type ContactType,
  type CounterVariant,
  type Inputs,
  type LadderProgram,
  type OutputKind,
  type SimMemory,
  type TimerVariant,
} from "@/lib/ladder/types";
import { evalRungEnergized, runScan } from "@/lib/ladder/engine";
import LadderPalette, { type PaletteDragData } from "./LadderPalette";
import RungRow from "./Rung";
import IoPanel from "./IoPanel";
import FbdView from "./FbdView";
import StView from "./StView";
import { getHintAction } from "@/app/dashboard/play/actions";

const TICK_MS = 600;
type ViewMode = "LD" | "FBD" | "ST";

export default function LadderPlayground() {
  const [program, setProgram] = useState<LadderProgram>(() => createEmptyProgram());
  const [inputs, setInputs] = useState<Inputs>({});
  const [memory, setMemory] = useState<SimMemory>(() => createEmptyMemory());
  const [running, setRunning] = useState(false);
  const [activeDrag, setActiveDrag] = useState<PaletteDragData | null>(null);
  const [view, setView] = useState<ViewMode>("LD");
  const [hint, setHint] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

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

  function toggleInput(address: string) {
    const nextInputs = { ...inputs, [address]: !inputs[address] };
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

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag((event.active.data.current as PaletteDragData) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current as PaletteDragData | undefined;
    const dropData = over.data.current as
      | { accepts: "contact" | "output"; rungId: string; rowIndex?: number; colIndex?: number }
      | undefined;
    if (!dragData || !dropData) return;

    if (
      dragData.kind === "contact" &&
      dropData.accepts === "contact" &&
      dropData.rowIndex !== undefined &&
      dropData.colIndex !== undefined
    ) {
      placeContact(dropData.rungId, dropData.rowIndex, dropData.colIndex, dragData.contactType);
    } else if (dragData.kind === "output" && dropData.accepts === "output") {
      placeOutput(dropData.rungId, dragData.outputKind);
    }
  }

  async function askForHint() {
    setHintLoading(true);
    setHintError(null);
    setHint(null);
    try {
      const result = await getHintAction(program, inputs, memory);
      if ("error" in result && result.error) {
        setHintError(result.error);
      } else if ("hint" in result && result.hint) {
        setHint(result.hint);
      }
    } catch (err) {
      console.error("askForHint failed:", err);
      setHintError("Something went wrong getting a hint.");
    } finally {
      setHintLoading(false);
    }
  }

  const addressOptions = contactAddressOptions(program);

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
          {(["LD", "FBD", "ST"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium ${
                view === v
                  ? "border border-b-0 border-zinc-200 bg-white text-blue-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-blue-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {v === "LD" ? "Ladder Diagram" : v === "FBD" ? "Function Block" : "Structured Text"}
            </button>
          ))}
        </div>

        {view === "LD" && (
          <>
            <LadderPalette />

            <div className="flex flex-col gap-3">
              {program.rungs.map((rung, index) => (
                <RungRow
                  key={rung.id}
                  rung={rung}
                  index={index}
                  inputs={inputs}
                  memory={memory}
                  rungEnergized={evalRungEnergized(rung.branches, inputs, memory)}
                  addressOptions={addressOptions}
                  addressTaken={(addr) =>
                    rung.output ? isOutputAddressTaken(program, rung.output.kind, addr, rung.id) : false
                  }
                  onSetContactAddress={(r, c, addr) => setContactAddress(rung.id, r, c, addr)}
                  onRemoveContact={(r, c) => removeContact(rung.id, r, c)}
                  onSetOutputAddress={(addr) => setOutputAddress(rung.id, addr)}
                  onSetOutputVariant={(variant) => setOutputVariant(rung.id, variant)}
                  onSetOutputPreset={(preset) => setOutputPreset(rung.id, preset)}
                  onRemoveOutput={() => removeOutput(rung.id)}
                  onAddBranch={() => addBranch(rung.id)}
                  onRemoveBranch={(r) => removeBranch(rung.id, r)}
                  onRemoveRung={() => removeRung(rung.id)}
                />
              ))}
            </div>

            {program.rungs.length < MAX_RUNGS && (
              <button
                type="button"
                onClick={addRung}
                className="w-fit rounded-md border border-dashed border-zinc-400 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:border-blue-500 hover:text-blue-600 dark:text-zinc-400"
              >
                + Add rung
              </button>
            )}
          </>
        )}

        {view === "FBD" && <FbdView program={program} inputs={inputs} memory={memory} />}
        {view === "ST" && <StView program={program} />}

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={step}
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            Step
          </button>
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              running ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {running ? "Stop" : "Run"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Reset
          </button>
        </div>

        <IoPanel inputs={inputs} memory={memory} onToggleInput={toggleInput} />

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={askForHint}
            disabled={hintLoading}
            className="w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {hintLoading ? "Thinking..." : "Ask AI for a hint"}
          </button>
          {hint && (
            <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-900 dark:bg-purple-950 dark:text-purple-200">
              {hint}
            </p>
          )}
          {hintError && (
            <p className="text-sm text-red-600 dark:text-red-400">{hintError}</p>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeDrag && (
          <div className="rounded-md border border-blue-500 bg-white px-3 py-2 text-center font-mono text-sm shadow-lg dark:bg-zinc-900">
            {activeDrag.kind === "contact" ? activeDrag.contactType : activeDrag.outputKind}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
