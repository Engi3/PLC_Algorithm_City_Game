"use client";

import { useLadderGrid } from "@/lib/ladder/use-ladder-grid";
import { useVariablePool } from "@/lib/ladder/use-variable-pool";
import GridEditorSurface from "./GridEditorSurface";

/**
 * Sandbox entry point: a free-form, ungraded instance of the shared grid
 * editing surface (see GridEditorSurface.tsx, extracted here so Levels
 * authoring and student play can reuse the exact same interaction logic).
 * Owns its own grid/pool state - Sandbox never persists to Supabase.
 */
export default function GridLadderEditor() {
  const grid = useLadderGrid();
  const pool = useVariablePool();

  return (
    <GridEditorSurface
      grid={grid}
      pool={pool}
      banner={
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
          <strong>Industrial Ladder Editor.</strong> วางบล็อก ต่อสาย และรัน Power Flow ได้ทันที (Run/Step/Stop) - โหมดนี้เป็นโหมดอิสระ
          ไม่มีเป้าหมายหรือการเก็บคะแนน หากต้องการเก็บคะแนนและประเมินผล ให้เข้าไปที่โหมดด่านทดสอบ (Levels)
        </div>
      }
    />
  );
}
