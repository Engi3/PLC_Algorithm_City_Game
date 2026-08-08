"use client";

import { useEffect, useRef, useState } from "react";
import { useLadderGrid, type LadderGridApi } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import AiReviewModal from "@/components/ladder/AiReviewModal";
import ReferenceSolutionModal from "./ReferenceSolutionModal";
import { useGameLevelPlay } from "@/lib/games/use-game-level-play";
import type { GameLevelSpec } from "@/lib/games/game-level-types";
import MazeEngine from "./MazeEngine";
import FactoryEngine from "./FactoryEngine";
import { submitGameLevelAction, type SubmitGameLevelResult } from "@/app/dashboard/games/actions";
import { saveDraftAction, loadDraftAction } from "@/lib/ladder/draft-actions";
import { getHintAction } from "@/app/dashboard/play/actions";
import { useAiCooldown } from "@/lib/ai/use-ai-cooldown";

/**
 * The Game Mode play page: same split-screen trick ChallengePlayClient
 * uses (see that file's header comment) - the Grid Editor's simulation-
 * facing fields are redirected from the student's own useLadderGrid()
 * instance to useGameLevelPlay's live bridge, so Run/Step/Stop/Reset drive
 * the actual Maze/Factory world instead of manual input toggling. The
 * MazeEngine/FactoryEngine visualization takes the place of Challenge
 * Mode's Process Panel - both render for a HYBRID level, since the run
 * carries both a maze and a factory state throughout (only one binding is
 * ever live at a time, per the phase switch, but the OTHER domain's last
 * state stays visible - e.g. the packed factory line stays on screen
 * while the AGV makes its delivery run).
 */
/**
 * MazeEngine renders every cell at a fixed pixel size, so a 21x21 map
 * (840px+ at the old hardcoded 40px) blew out of its panel - shrink cells
 * as the map grows so the board's total width stays roughly constant
 * instead. `targetBoardWidth` should match however wide the panel actually
 * is: a Maze-only/Factory-only level gets the FULL width (no sibling panel
 * to share with), a HYBRID level's Maze panel only gets half.
 */
export function mazeCellSize(cols: number, targetBoardWidth: number): number {
  const safeCols = Number.isFinite(cols) && cols > 0 ? cols : 9;
  const raw = Math.floor(targetBoardWidth / safeCols);
  return Number.isFinite(raw) ? Math.max(16, Math.min(40, raw)) : 40;
}

export default function GamePlayClient({
  gameLevelId,
  spec,
  canViewSolution,
}: {
  gameLevelId: string;
  spec: GameLevelSpec;
  canViewSolution: boolean;
}) {
  const baseGrid = useLadderGrid();
  const pool = useVariablePool();
  const play = useGameLevelPlay(baseGrid.gridProgram, spec);

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitGameLevelResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintCreditsRemaining, setHintCreditsRemaining] = useState<number | null>(null);
  const [showAiReview, setShowAiReview] = useState(false);
  const [showReferenceSolution, setShowReferenceSolution] = useState(false);
  const hintCooldown = useAiCooldown();
  const [showGuide, setShowGuide] = useState(false);

  const draftLoaded = useRef(false);
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    (async () => {
      const result = await loadDraftAction("game", gameLevelId);
      if ("program" in result && result.program) baseGrid.loadGridProgram(result.program);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameLevelId]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await saveDraftAction("game", gameLevelId, baseGrid.gridProgram);
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
      const result = await getHintAction(baseGrid.gridProgram, play.bridge.inputs, play.bridge.memory);
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
    inputs: play.bridge.inputs,
    analogInputs: play.bridge.analogInputs,
    memory: play.bridge.memory,
    flows: play.bridge.flows,
    running: play.bridge.running,
    toggleRunning: play.bridge.toggleRunning,
    step: play.bridge.step,
    reset: () => play.resetLevel(),
    toggleInput: () => {},
    setInputValue: () => {},
    setAnalogInput: () => {},
  };

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitGameLevelAction(gameLevelId, baseGrid.gridProgram);
      setSubmitResult(result);
    } catch (err) {
      console.error("submitGameLevelAction failed:", err);
      setSubmitResult({ error: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const outcomeLabel =
    play.outcome.status === "won"
      ? "ผ่านด่านแล้ว!"
      : play.outcome.status === "failed"
        ? `ล้มเหลว - ${play.outcome.reason}`
        : "กำลังเล่น...";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GridEditorSurface
        grid={grid}
        pool={pool}
        banner={
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            <div className="flex items-center justify-between gap-2">
              <p>
                <strong>โหมดเกม:</strong> เขียนวงจรแลดเดอร์ควบคุมหุ่นยนต์/สายพานให้ทำภารกิจสำเร็จ - กด Run เพื่อให้ระบบทำงานต่อเนื่อง
                หรือ Step เพื่อดูทีละรอบสแกน (Reset จะเริ่มด่านใหม่ตั้งแต่ต้น)
              </p>
              <button
                type="button"
                onClick={() => setShowGuide((v) => !v)}
                className="shrink-0 rounded-md border border-blue-300 px-2 py-1 text-[11px] font-medium hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900"
              >
                {showGuide ? "ซ่อนวิธีเล่น" : "วิธีเล่นแบบละเอียด"}
              </button>
            </div>

            {showGuide && (
              <div className="mt-3 flex flex-col gap-3 border-t border-blue-200 pt-3 dark:border-blue-900">
                <div>
                  <p className="mb-1 font-semibold">ขั้นตอนการเล่น</p>
                  <ol className="list-inside list-decimal space-y-0.5">
                    <li>อ่านโจทย์สถานการณ์และคำใบ้ด้านล่างก่อนเริ่ม</li>
                    <li>วางสัญลักษณ์แลดเดอร์ในตาราง (คลิกเลือกช่อง แล้วกด F5-F10) แล้วต่อสายด้วย F9/F10 หรือลากเชื่อมจุดต่อ</li>
                    <li>กด Step เพื่อดูผลทีละรอบสแกน หรือ Run เพื่อให้ทำงานต่อเนื่องอัตโนมัติ</li>
                    <li>สังเกตภาพเกมด้านล่าง (หุ่นยนต์ AGV / สายการผลิต) ว่าตอบสนองตามวงจรที่เขียนถูกต้องหรือไม่</li>
                    <li>ถ้าติดขัด กด &quot;ขอคำใบ้จาก AI&quot;{canViewSolution ? ' หรือเปิดดู "เฉลยตัวอย่าง" เป็นแนวทาง (ไม่จำเป็นต้องคัดลอกตรงๆ)' : " เป็นแนวทาง"}</li>
                    <li>กด Reset เพื่อเริ่มด่านใหม่ตั้งแต่ต้น แล้ว Run/Step จนผ่านเงื่อนไข จึงกด Submit</li>
                    <li>ผ่านแล้วสามารถกด &quot;ขอรีวิวโค้ดจาก AI&quot; เพื่อรับคำแนะนำและเหรียญโบนัสได้</li>
                    <li>กด &quot;บันทึกวงจร&quot; ได้ทุกเมื่อเพื่อเก็บวงจรที่เขียนค้างไว้ กลับมาทำต่อภายหลังได้</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        }
      />

      {/*
        Game visualization sits below GridEditorSurface's own Run/Step/Stop/Reset
        row, not off to the side, so it's visually tied to the controls that
        drive it. Only a HYBRID level actually needs the 2-column split (it
        renders both panels); Maze-only/Factory-only levels get the full
        width instead of leaving half the row empty next to a cramped board.
      */}
      <div className={`grid min-w-0 gap-4 ${spec.gameType === "HYBRID" ? "sm:grid-cols-2" : ""}`}>
        {(spec.gameType === "MAZE" || spec.gameType === "HYBRID") && play.bridge.gameState.maze && (
          <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              หุ่นยนต์ AGV (Maze)
            </h3>
            {/* cellSize shrinks for bigger maps (e.g. 21x21) so the board fits its panel instead of forcing the whole page wider - overflow-x-auto is still the fallback for anything that doesn't fit even at the smallest cell size. */}
            <div className="flex justify-center overflow-x-auto">
              <MazeEngine
                map={play.bridge.gameState.maze.map}
                robot={play.bridge.gameState.maze.robot}
                cellSize={mazeCellSize(play.bridge.gameState.maze.map[0]?.length ?? 9, spec.gameType === "HYBRID" ? 320 : 600)}
              />
            </div>
          </div>
        )}
        {(spec.gameType === "FACTORY" || spec.gameType === "HYBRID") && play.bridge.gameState.factory && (
          <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              สายการผลิต (Factory)
            </h3>
            <FactoryEngine state={play.bridge.gameState.factory} />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              ประมวลผลแล้ว: {play.bridge.gameState.factory.processedCount} | คัดออก: {play.bridge.gameState.factory.rejectedCount}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || play.outcome.status === "playing"}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          title={play.outcome.status === "playing" ? "ต้อง Run ให้ด่านจบก่อน (ผ่านหรือล้มเหลว) จึงจะส่งคำตอบได้" : undefined}
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
        {spec.referenceGridProgram && canViewSolution && (
          <button
            type="button"
            onClick={() => setShowReferenceSolution(true)}
            className="rounded-md border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            📖 เฉลยตัวอย่าง
          </button>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            play.outcome.status === "won"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : play.outcome.status === "failed"
                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          {outcomeLabel}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Tick: {play.ticksElapsed}</span>
      </div>

      {submitResult && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            "error" in submitResult
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              : submitResult.passed
                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-400"
                : "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
          }`}
        >
          {"error" in submitResult ? submitResult.error : submitResult.passed ? "ผ่านภารกิจ! บันทึกผลแล้ว" : "ยังไม่ผ่าน - ลองแก้วงจรแล้วกด Reset เพื่อเริ่มใหม่"}
        </div>
      )}

      {submitResult && !("error" in submitResult) && submitResult.passed && (
        <button
          type="button"
          onClick={() => setShowAiReview(true)}
          className="w-fit rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          ขอรีวิวโค้ดจาก AI (Request AI Review)
        </button>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
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

      {showAiReview && (
        <AiReviewModal contextKind="game" contextId={gameLevelId} program={baseGrid.gridProgram} onClose={() => setShowAiReview(false)} />
      )}

      {showReferenceSolution && canViewSolution && spec.referenceGridProgram && (
        <ReferenceSolutionModal program={spec.referenceGridProgram} spec={spec} onClose={() => setShowReferenceSolution(false)} />
      )}
    </div>
  );
}
