"use client";

import { useLadderGrid, type LadderGridApi } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import { useGameLevelPlay } from "@/lib/games/use-game-level-play";
import type { GridProgram } from "@/lib/ladder/grid-types";
import type { GameLevelSpec } from "@/lib/games/game-level-types";
import MazeEngine from "./MazeEngine";
import FactoryEngine from "./FactoryEngine";
import { mazeCellSize } from "./GamePlayClient";

/**
 * Shows one worked-example circuit that solves the current level - not
 * necessarily THE optimal answer, just the reference GridProgram the level
 * generator itself self-verified against the real engine. Runs it through
 * the exact same useGameLevelPlay bridge GamePlayClient uses for the
 * student's own circuit, so Run/Step/Stop/Reset drive a REAL simulation
 * (MazeEngine/FactoryEngine visuals included) instead of just showing the
 * static ladder diagram. Loaded into its own throwaway useLadderGrid()
 * instance (discarded on close), so a student poking at it never touches
 * their own in-progress circuit.
 */
export default function ReferenceSolutionModal({
  program,
  spec,
  onClose,
}: {
  program: GridProgram;
  spec: GameLevelSpec;
  onClose: () => void;
}) {
  const baseGrid = useLadderGrid(program);
  const pool = useVariablePool();
  const play = useGameLevelPlay(program, spec);

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

  const outcomeLabel =
    play.outcome.status === "won"
      ? "ผ่านด่านแล้ว!"
      : play.outcome.status === "failed"
        ? `ล้มเหลว - ${play.outcome.reason}`
        : "กำลังเล่น...";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">เฉลยตัวอย่าง (Example Solution)</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            x
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          นี่คือตัวอย่างวงจรหนึ่งที่แก้โจทย์นี้ได้จริง (ไม่จำเป็นต้องเป็นวิธีที่ดีที่สุด) - กด Run หรือ Step
          ด้านล่างเพื่อดูการจำลองจริงว่าหุ่นยนต์/สายพานตอบสนองต่อวงจรนี้อย่างไร แล้วลองศึกษาแนวคิดกลับไปเขียนวงจรของคุณเองดูก่อน
          จะได้ฝึกคิดเอง ไม่ใช่แค่คัดลอก
        </p>
        <GridEditorSurface
          grid={grid}
          pool={pool}
          banner={
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
              นี่คือวงจรตัวอย่าง - แก้ไขได้อิสระเพื่อทดลอง แต่การแก้ไขที่นี่จะไม่ถูกบันทึกหรือส่งเป็นคำตอบของคุณ
            </div>
          }
        />

        <div className={`grid min-w-0 gap-4 ${spec.gameType === "HYBRID" ? "sm:grid-cols-2" : ""}`}>
          {(spec.gameType === "MAZE" || spec.gameType === "HYBRID") && play.bridge.gameState.maze && (
            <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                หุ่นยนต์ AGV (Maze)
              </h4>
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
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                สายการผลิต (Factory)
              </h4>
              <FactoryEngine state={play.bridge.gameState.factory} />
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                ประมวลผลแล้ว: {play.bridge.gameState.factory.processedCount} | คัดออก: {play.bridge.gameState.factory.rejectedCount}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
      </div>
    </div>
  );
}
