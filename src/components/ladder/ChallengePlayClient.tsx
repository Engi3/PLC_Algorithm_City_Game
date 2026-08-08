"use client";

import { useEffect, useRef, useState } from "react";
import { useLadderGrid, type LadderGridApi } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import ChallengeProcessPanel from "./ChallengeProcessPanel";
import ChallengeStageProgress from "./ChallengeStageProgress";
import SafetyFaultModal from "./SafetyFaultModal";
import AiReviewModal from "./AiReviewModal";
import { useChallengePlcEngine } from "@/lib/ladder/use-challenge-plc-engine";
import { collectProcessAddresses, type ChallengeSpec, type ProcessAddressGroups } from "@/lib/ladder/challenge-types";
import { submitChallengeAction, type SubmitChallengeResult } from "@/app/dashboard/challenges/[id]/actions";
import { saveDraftAction, loadDraftAction } from "@/lib/ladder/draft-actions";
import { getHintAction } from "@/app/dashboard/play/actions";
import { useAiCooldown } from "@/lib/ai/use-ai-cooldown";

const EMPTY_PROCESS_GROUPS: ProcessAddressGroups = { digitalInputs: [], analogInputs: [], actuators: [], timers: [], counters: [] };

/**
 * Task 5.2: the interactive Challenge Play page. Split-screen: the Grid
 * Editor (student's own ladder circuit, fully editable) on the left, the
 * live process status + stage progress on the right. The trick is that the
 * `grid` object handed to GridEditorSurface is NOT a plain useLadderGrid()
 * instance - its simulation-facing fields (inputs/analogInputs/memory/
 * running/step/toggleRunning/reset/toggleInput/setInputValue/
 * setAnalogInput) are all redirected to useChallengePlcEngine, which plays
 * the challenge's scripted test case forward one scan at a time. Editing
 * methods (placeNode, wireing, etc.) stay wired to the student's own
 * useLadderGrid() instance untouched - so the exact same Step/Run/Stop/
 * Reset buttons and live power-flow animation the Sandbox/Levels editor
 * already has now drive the scripted industrial scenario instead of free
 * manual toggling (Challenge Mode's inputs are the scenario, not something
 * the student clicks by hand - the built-in IoPanel's input buttons and the
 * AnalogInputPanel's sliders are consequently inert here, which the banner
 * below calls out so it doesn't read as broken).
 */
export default function ChallengePlayClient({
  challengeLevelId,
  spec,
}: {
  challengeLevelId: string;
  spec: ChallengeSpec;
}) {
  const baseGrid = useLadderGrid();
  const pool = useVariablePool();
  const activeTestCase = spec.testCases[0] ?? null;
  const engine = useChallengePlcEngine(baseGrid.gridProgram, activeTestCase);

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitChallengeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintCreditsRemaining, setHintCreditsRemaining] = useState<number | null>(null);
  const [showAiReview, setShowAiReview] = useState(false);
  const hintCooldown = useAiCooldown();

  const draftLoaded = useRef(false);
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    (async () => {
      const result = await loadDraftAction("challenge", challengeLevelId);
      if ("program" in result && result.program) baseGrid.loadGridProgram(result.program);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeLevelId]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await saveDraftAction("challenge", challengeLevelId, baseGrid.gridProgram);
      setSaveMessage("ok" in result ? "บันทึกวงจรแล้ว" : result.error);
    } catch (err) {
      console.error("saveDraftAction failed:", err);
      setSaveMessage("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  async function askForHint() {
    if (hintCooldown.active) return;
    setHintLoading(true);
    setHintError(null);
    setHint(null);
    try {
      const result = await getHintAction(baseGrid.gridProgram, engine.inputs, engine.memory);
      if ("error" in result && result.error) setHintError(result.error);
      else if ("hint" in result && result.hint) {
        setHint(result.hint);
        setHintCreditsRemaining(result.hintCreditsRemaining);
      }
    } catch (err) {
      console.error("askForHint failed:", err);
      setHintError("เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง");
    } finally {
      setHintLoading(false);
      hintCooldown.start();
    }
  }

  const grid: LadderGridApi = {
    ...baseGrid,
    inputs: engine.inputs,
    analogInputs: engine.analogInputs,
    memory: engine.memory,
    flows: engine.flows,
    running: engine.playing,
    toggleRunning: () => (engine.playing ? engine.pause() : engine.play()),
    step: engine.stepOnce,
    reset: engine.resetSim,
    toggleInput: () => {},
    setInputValue: () => {},
    setAnalogInput: () => {},
  };

  const processGroups = activeTestCase ? collectProcessAddresses(activeTestCase, baseGrid.gridProgram) : EMPTY_PROCESS_GROUPS;

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitChallengeAction(challengeLevelId, baseGrid.gridProgram);
      setSubmitResult(result);
    } catch (err) {
      console.error("submitChallengeAction failed:", err);
      setSubmitResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1fr_360px] xl:items-start xl:gap-5">
      <div className="min-w-0">
        <GridEditorSurface
          grid={grid}
          pool={pool}
          banner={
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <strong>โหมดจำลองอุตสาหกรรม:</strong> อินพุตของกระบวนการถูกควบคุมโดยสถานการณ์จำลองอัตโนมัติ (ดูสถานะสดที่แผง
              Process Panel ด้านข้าง) - กด Run เพื่อดูกระบวนการทำงานต่อเนื่อง หรือ Step เพื่อดูทีละรอบสแกน
            </div>
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {submitting ? "กำลังตรวจสอบ..." : "ส่งคำตอบ (Submit)"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {saving ? "กำลังบันทึก..." : "💾 บันทึกวงจร"}
          </button>
          {saveMessage && <span className="text-xs text-zinc-500 dark:text-zinc-400">{saveMessage}</span>}
          {engine.complete && !engine.fault && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              ✓ การจำลองสำเร็จทุกขั้นตอน - พร้อมส่งคำตอบ
            </span>
          )}
        </div>

        {submitResult && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
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
                ? `ผ่านภารกิจ! (ครั้งที่ ${submitResult.attempts})`
                : `ยังไม่ผ่าน (ครั้งที่ ${submitResult.attempts}) - ตรวจสอบผลแต่ละสถานการณ์ทดสอบด้านล่างแล้วลองใหม่`}
          </div>
        )}

        {submitResult && !("error" in submitResult) && (
          <div className="mt-3 flex flex-col gap-1.5">
            {submitResult.results.map((r, i) => (
              <div
                key={i}
                className={`rounded-md border px-3 py-2 text-xs ${
                  r.passed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                สถานการณ์ทดสอบ {i + 1}: {r.passed ? "ผ่าน" : r.fault ? `เกิดอุบัติเหตุ - ${r.fault.description}` : "ยังไม่ผ่านเงื่อนไขที่กำหนด"}
              </div>
            ))}
          </div>
        )}

        {submitResult && !("error" in submitResult) && submitResult.passed && (
          <button
            type="button"
            onClick={() => setShowAiReview(true)}
            className="mt-3 w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            ขอรีวิวโค้ดจาก AI (Request AI Review)
          </button>
        )}

        <div className="mt-4 flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={askForHint}
            disabled={hintLoading || hintCooldown.active}
            className="w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {hintLoading ? "กำลังคิด..." : hintCooldown.active ? `รออีก ${hintCooldown.secondsLeft} วิ` : "ขอคำใบ้จาก AI (Ask AI for a hint)"}
          </button>
          {hint && (
            <p className="rounded-md bg-purple-50 px-3 py-2 text-sm text-purple-900 dark:bg-purple-950 dark:text-purple-200">
              {hint}
              {hintCreditsRemaining !== null && <span className="mt-1 block text-xs opacity-75">คำใบ้ที่เหลือ: {hintCreditsRemaining}</span>}
            </p>
          )}
          {hintError && <p className="text-sm text-red-600 dark:text-red-400">{hintError}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {activeTestCase && <ChallengeStageProgress stages={activeTestCase.stages} statuses={engine.stageStatuses} />}
        {activeTestCase && (
          <ChallengeProcessPanel groups={processGroups} inputs={engine.inputs} analogInputs={engine.analogInputs} memory={engine.memory} />
        )}
      </div>

      {showAiReview && (
        <AiReviewModal
          contextKind="challenge"
          contextId={challengeLevelId}
          program={baseGrid.gridProgram}
          onClose={() => setShowAiReview(false)}
        />
      )}

      {engine.fault && activeTestCase && (
        <SafetyFaultModal
          fault={engine.fault}
          stageName={activeTestCase.stages.find((s) => s.id === engine.fault!.atStageId)?.name ?? "-"}
          onRetry={engine.resetSim}
        />
      )}
    </div>
  );
}
