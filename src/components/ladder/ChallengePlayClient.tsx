"use client";

import { useState } from "react";
import { useLadderGrid, type LadderGridApi } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import ChallengeProcessPanel from "./ChallengeProcessPanel";
import ChallengeStageProgress from "./ChallengeStageProgress";
import SafetyFaultModal from "./SafetyFaultModal";
import { useChallengePlcEngine } from "@/lib/ladder/use-challenge-plc-engine";
import { collectProcessAddresses, type ChallengeSpec, type ProcessAddressGroups } from "@/lib/ladder/challenge-types";
import { submitChallengeAction, type SubmitChallengeResult } from "@/app/dashboard/challenges/[id]/actions";

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

  const grid: LadderGridApi = {
    ...baseGrid,
    inputs: engine.inputs,
    analogInputs: engine.analogInputs,
    memory: engine.memory,
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
      </div>

      <div className="flex flex-col gap-4">
        {activeTestCase && <ChallengeStageProgress stages={activeTestCase.stages} statuses={engine.stageStatuses} />}
        {activeTestCase && (
          <ChallengeProcessPanel groups={processGroups} inputs={engine.inputs} analogInputs={engine.analogInputs} memory={engine.memory} />
        )}
      </div>

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
