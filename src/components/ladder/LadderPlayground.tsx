"use client";

import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  contactAddressOptions,
  isOutputAddressTaken,
  MAX_ANALOG_VARIABLE_NUMBER,
  MAX_RUNGS,
  numericAddressOptions,
} from "@/lib/ladder/types";
import { evalRungEnergized } from "@/lib/ladder/engine";
import { useLadderProgram } from "@/lib/ladder/use-ladder-program";
import { useLadderDnd } from "@/lib/ladder/use-ladder-dnd";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import LadderPalette from "./LadderPalette";
import RungRow from "./Rung";
import IoPanel from "./IoPanel";
import AnalogInputPanel from "./AnalogInputPanel";
import AiReviewModal from "./AiReviewModal";
import FbdView from "./FbdView";
import StView from "./StView";
import VariablePoolDrawer from "./VariablePoolDrawer";
import { getHintAction } from "@/app/dashboard/play/actions";
import {
  submitLevelAction,
  skipLevelAction,
  type SubmitLevelResult,
  type SkipLevelResult,
} from "@/app/dashboard/play/level-actions";
import { SKILL_BADGE_CLASSES, SKILL_LABELS, type SkillCategory } from "@/lib/ladder/level-spec";

type ViewMode = "LD" | "FBD" | "ST";

export type LevelInfo = { id: string; description: string; skill: SkillCategory | null; hints?: string[] };

export default function LadderPlayground({ level }: { level?: LevelInfo } = {}) {
  const ladder = useLadderProgram();
  const { activeDrag, handleDragStart, handleDragEnd } = useLadderDnd(ladder);
  const pool = useVariablePool();
  // Custom X/Y/M/AI variables are available everywhere, including graded
  // levels - students may need auxiliary relays or analog thresholds
  // beyond a level's predefined I/Q set to build a working solution. The
  // level's own test cases only ever drive I0-I7/Q0-Q3, so declaring extra
  // variables never changes what's required to pass.
  const customVariables = pool.customVariables;
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
  const [showAiReview, setShowAiReview] = useState(false);

  const { program, inputs, analogInputs, memory, running } = ladder;
  const analogAddresses = customVariables.filter((v) => v.kind === "analog_input").map((v) => v.address);

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

  const addressOptions = contactAddressOptions(program, customVariables);
  const numericOptions = numericAddressOptions(program, customVariables);

  // One-click declare of the next free AI address (AI0, AI1, ...) - unlike
  // a preset/example loader, this never touches the student's existing
  // rungs, so it's safe to offer inside a graded level too.
  function addNextAnalogVariable() {
    const taken = new Set(pool.customVariables.filter((v) => v.kind === "analog_input").map((v) => v.address));
    for (let n = 0; n <= MAX_ANALOG_VARIABLE_NUMBER; n++) {
      const address = `AI${n}`;
      if (!taken.has(address)) {
        pool.addVariable("analog_input", n);
        return;
      }
    }
  }
  const analogPoolFull =
    customVariables.filter((v) => v.kind === "analog_input").length > MAX_ANALOG_VARIABLE_NUMBER;

  return (
    <DndContext id="ladder-dnd" onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        {level && (
          <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            {level.skill && (
              <span
                className={`w-fit rounded px-2 py-0.5 text-[11px] font-medium ${SKILL_BADGE_CLASSES[level.skill]}`}
              >
                {SKILL_LABELS[level.skill]}
              </span>
            )}
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
            <div className="flex flex-wrap items-center gap-2">
              <VariablePoolDrawer pool={pool} />
              <button
                type="button"
                onClick={addNextAnalogVariable}
                disabled={analogPoolFull}
                title="ประกาศตัวแปรอินพุตอนาล็อกตัวถัดไป (AI) เช่น ค่าจากเซนเซอร์หรือค่าธรณีขั้น เพื่อใช้กับบล็อกเปรียบเทียบ (CMP)"
                className="w-fit rounded-md border border-dashed border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-700 hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                + Analog Value
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {program.rungs.map((rung, index) => (
                <RungRow
                  key={rung.id}
                  rung={rung}
                  index={index}
                  inputs={inputs}
                  memory={memory}
                  rungEnergized={evalRungEnergized(rung.branches, inputs, memory, analogInputs)}
                  addressOptions={addressOptions}
                  numericOptions={numericOptions}
                  analogInputs={analogInputs}
                  customVariables={customVariables}
                  addressTaken={(addr, outputIndex) =>
                    isOutputAddressTaken(program, rung.outputs[outputIndex].kind, addr, rung.id, outputIndex)
                  }
                  onSetContactAddress={(r, c, addr) => ladder.setContactAddress(rung.id, r, c, addr)}
                  onRemoveContact={(r, c) => ladder.removeContact(rung.id, r, c)}
                  onUpdateComparison={(r, c, patch) => ladder.updateComparison(rung.id, r, c, patch)}
                  onSetOutputAddress={(i, addr) => ladder.setOutputAddress(rung.id, i, addr)}
                  onSetOutputVariant={(i, variant) => ladder.setOutputVariant(rung.id, i, variant)}
                  onSetOutputPreset={(i, preset) => ladder.setOutputPreset(rung.id, i, preset)}
                  onRemoveOutput={(i) => ladder.removeOutput(rung.id, i)}
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

        {view === "FBD" && (
          <FbdView program={program} inputs={inputs} memory={memory} analogInputs={analogInputs} />
        )}
        {view === "ST" && <StView program={program} />}

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={ladder.step}
            title="ประมวลผล PLC หนึ่งรอบสแกน (1 scan cycle) เท่านั้นแล้วหยุด เหมาะสำหรับตรวจสอบไทม์เมอร์/เคาน์เตอร์หรือวงจร Latch ทีละขั้นตอน"
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            Step
          </button>
          <button
            type="button"
            onClick={ladder.toggleRunning}
            title={
              running
                ? "หยุดการสแกนอัตโนมัติ เอาต์พุตที่ไม่ได้ล็อค (Coil ธรรมดา) จะดับทันที ส่วนที่ Set/Latch ไว้จะยังค้างอยู่ ต้องกด Step หรือ Run อีกครั้งเพื่อประมวลผลอินพุตใหม่"
                : "เริ่มสแกนอัตโนมัติต่อเนื่อง (10 ครั้ง/วินาที) อ่านอินพุต ประมวลผลลอจิก และอัปเดตเอาต์พุตตลอดเวลา จนกว่าจะกด Stop"
            }
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              running ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {running ? "Stop" : "Run"}
          </button>
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span
              className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-green-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
            />
            {running ? "กำลังสแกน (Running)" : "หยุด (Stopped)"}
          </span>
          <button
            type="button"
            onClick={ladder.reset}
            title="ล้างค่าทั้งหมดกลับสู่สถานะเริ่มต้น: อินพุต, เอาต์พุต, ไทม์เมอร์ และเคาน์เตอร์"
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

        {level && submitResult && !("error" in submitResult) && submitResult.passed && (
          <button
            type="button"
            onClick={() => setShowAiReview(true)}
            className="w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            ขอรีวิวโค้ดจาก AI (Request AI Review)
          </button>
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

        <IoPanel
          inputs={inputs}
          memory={memory}
          onToggleInput={ladder.toggleInput}
          onSetInputValue={ladder.setInputValue}
          customVariables={customVariables}
          getSwitchType={pool.getSwitchType}
        />

        <AnalogInputPanel addresses={analogAddresses} values={analogInputs} onChange={ladder.setAnalogInput} />

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
            {activeDrag.kind === "contact"
              ? activeDrag.contactType
              : activeDrag.kind === "comparison"
                ? "CMP"
                : activeDrag.outputKind}
          </div>
        )}
      </DragOverlay>

      {showAiReview && level && (
        <AiReviewModal levelId={level.id} program={program} onClose={() => setShowAiReview(false)} />
      )}
    </DndContext>
  );
}
