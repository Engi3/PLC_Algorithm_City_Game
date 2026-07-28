"use client";

import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { contactAddressOptions, isOutputAddressTaken, MAX_RUNGS } from "@/lib/ladder/types";
import { evalRungEnergized } from "@/lib/ladder/engine";
import { useLadderProgram } from "@/lib/ladder/use-ladder-program";
import { useLadderDnd } from "@/lib/ladder/use-ladder-dnd";
import LadderPalette from "./LadderPalette";
import RungRow from "./Rung";
import IoPanel from "./IoPanel";
import FbdView from "./FbdView";
import StView from "./StView";
import { getHintAction } from "@/app/dashboard/play/actions";
import {
  submitLevelAction,
  skipLevelAction,
  type SubmitLevelResult,
  type SkipLevelResult,
} from "@/app/dashboard/play/level-actions";

type ViewMode = "LD" | "FBD" | "ST";

export type LevelInfo = { id: string; description: string; skillLabel: string; hints?: string[] };

export default function LadderPlayground({ level }: { level?: LevelInfo } = {}) {
  const ladder = useLadderProgram();
  const { activeDrag, handleDragStart, handleDragEnd } = useLadderDnd(ladder);
  const [view, setView] = useState<ViewMode>("LD");
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitLevelResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipResult, setSkipResult] = useState<SkipLevelResult | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [hintCreditsRemaining, setHintCreditsRemaining] = useState<number | null>(null);

  const { program, inputs, memory, running, setRunning } = ladder;

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
        setHintCreditsRemaining(result.hintCreditsRemaining);
      }
    } catch (err) {
      console.error("askForHint failed:", err);
      setHintError("Something went wrong getting a hint.");
    } finally {
      setHintLoading(false);
    }
  }

  async function submitLevel() {
    if (!level) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitLevelAction(level.id, program);
      setSubmitResult(result);
    } catch (err) {
      console.error("submitLevel failed:", err);
      setSubmitResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function useSkipToken() {
    if (!level) return;
    setSkipping(true);
    setSkipResult(null);
    try {
      const result = await skipLevelAction(level.id);
      setSkipResult(result);
    } catch (err) {
      console.error("useSkipToken failed:", err);
      setSkipResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSkipping(false);
    }
  }

  const addressOptions = contactAddressOptions(program);

  return (
    <DndContext id="ladder-dnd" onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        {level && (
          <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <span className="w-fit rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {level.skillLabel}
            </span>
            <p className="text-sm text-blue-900 dark:text-blue-100">{level.description}</p>

            {level.hints && level.hints.length > 0 && (
              <div className="flex flex-col gap-1">
                {level.hints.slice(0, hintsRevealed).map((h, i) => (
                  <p key={i} className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    คำใบ้ {i + 1}: {h}
                  </p>
                ))}
                {hintsRevealed < level.hints.length && (
                  <button
                    type="button"
                    onClick={() => setHintsRevealed((n) => n + 1)}
                    className="w-fit text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
                  >
                    ดูคำใบ้ {hintsRevealed + 1}/{level.hints.length}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
                  onSetContactAddress={(r, c, addr) => ladder.setContactAddress(rung.id, r, c, addr)}
                  onRemoveContact={(r, c) => ladder.removeContact(rung.id, r, c)}
                  onSetOutputAddress={(addr) => ladder.setOutputAddress(rung.id, addr)}
                  onSetOutputVariant={(variant) => ladder.setOutputVariant(rung.id, variant)}
                  onSetOutputPreset={(preset) => ladder.setOutputPreset(rung.id, preset)}
                  onRemoveOutput={() => ladder.removeOutput(rung.id)}
                  onAddBranch={() => ladder.addBranch(rung.id)}
                  onRemoveBranch={(r) => ladder.removeBranch(rung.id, r)}
                  onRemoveRung={() => ladder.removeRung(rung.id)}
                />
              ))}
            </div>

            {program.rungs.length < MAX_RUNGS && (
              <button
                type="button"
                onClick={ladder.addRung}
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
            onClick={ladder.step}
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
            onClick={ladder.reset}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Reset
          </button>
          {level && (
            <>
              <button
                type="button"
                onClick={submitLevel}
                disabled={submitting}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {submitting ? "Checking..." : "Submit"}
              </button>
              <button
                type="button"
                onClick={useSkipToken}
                disabled={skipping}
                className="rounded-md border border-amber-400 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                {skipping ? "..." : "Use Skip Token"}
              </button>
            </>
          )}
        </div>

        {level && submitResult && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              "error" in submitResult
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                : submitResult.passed
                  ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-400"
                  : "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
            }`}
          >
            {"error" in submitResult
              ? submitResult.error
              : submitResult.passed
                ? `Passed! Score: ${submitResult.score} (best: ${submitResult.bestScore})${submitResult.coinsEarned > 0 ? ` - earned ${submitResult.coinsEarned} coins!` : ""}${submitResult.energyRemaining !== null ? ` Energy left: ${submitResult.energyRemaining}.` : ""}`
                : `Not quite - failed test case(s) ${submitResult.failedCases.map((i) => i + 1).join(", ")}. Try again.${submitResult.energyRemaining !== null ? ` Energy left: ${submitResult.energyRemaining}.` : ""}`}
          </div>
        )}

        {level && skipResult && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              "error" in skipResult
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-400"
            }`}
          >
            {"error" in skipResult
              ? skipResult.error
              : `Level skipped! Score: ${skipResult.score}. Skip Tokens left: ${skipResult.skipTokensRemaining}.`}
          </div>
        )}

        <IoPanel inputs={inputs} memory={memory} onToggleInput={ladder.toggleInput} />

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
              {hintCreditsRemaining !== null && (
                <span className="mt-1 block text-xs opacity-75">
                  Hint credits left: {hintCreditsRemaining}
                </span>
              )}
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
