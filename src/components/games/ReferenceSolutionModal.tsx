"use client";

import { useLadderGrid } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "@/components/ladder-grid/GridEditorSurface";
import type { GridProgram } from "@/lib/ladder/grid-types";

/**
 * Shows one worked-example circuit that solves the current level - not
 * necessarily THE optimal answer, just the reference GridProgram the level
 * generator itself self-verified against the real engine. Loaded into its
 * own throwaway useLadderGrid() instance (discarded on close), so a
 * student poking at it never touches their own in-progress circuit.
 */
export default function ReferenceSolutionModal({ program, onClose }: { program: GridProgram; onClose: () => void }) {
  const grid = useLadderGrid(program);
  const pool = useVariablePool();

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
          นี่คือตัวอย่างวงจรหนึ่งที่แก้โจทย์นี้ได้จริง (ไม่จำเป็นต้องเป็นวิธีที่ดีที่สุด) - ลองศึกษาแนวคิดแล้วกลับไปเขียนวงจรของคุณเองดูก่อน
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
      </div>
    </div>
  );
}
