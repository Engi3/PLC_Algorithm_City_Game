"use client";

import { memo } from "react";
import { GRID_COLUMNS, COIL_COLUMN, type GridNode, type LadderGrid } from "@/lib/ladder/grid-types";
import { MAX_ROWS_PER_RUNG } from "@/lib/ladder/use-ladder-grid";
import type { CounterVariant, DeclaredVariable, TimerVariant } from "@/lib/ladder/types";
import type { GridFlowResult } from "@/lib/ladder/grid-engine";
import GridCellView from "./GridCellView";
import type { GridTool } from "./types";

/**
 * GX Works UX overhaul Task 3: the border between two adjacent rows -
 * clicking it always instantly toggles a parallel-branch vertical link, no
 * tool selection needed (the "clumsy drawing tool" this task explicitly
 * replaces for vertical wires - horizontal wire bars still use the Draw
 * Line/Delete Line tool, since Task 2's auto-wiring already covers the
 * common horizontal case and Task 3 only targets vertical/branching UX).
 * Hovering an unconnected border shows a dashed preview line as guidance.
 */
function VerticalWireToggle({ connected, energized, onToggle }: { connected: boolean; energized: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="คลิกเพื่อเชื่อม/ตัดเส้นไฟแนวตั้ง (แขนงขนาน) - One-click parallel branch"
      // Task 4: taller hit area on touch-first widths (base/sm/md) so this thin border is easy to tap with a finger, back to a slim 8px line at lg+ where mouse precision doesn't need the extra padding.
      className="group relative flex h-3 w-full cursor-pointer items-center transition-colors lg:h-2"
    >
      <span
        className={`h-2 w-full transition-colors lg:h-full ${
          connected ? (energized ? "bg-green-500 shadow-[0_0_5px_2px_rgba(34,197,94,0.7)]" : "bg-zinc-400 dark:bg-zinc-600") : "group-hover:bg-blue-50 dark:group-hover:bg-blue-950"
        }`}
      />
      {!connected && (
        <span className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 border-t-2 border-dashed border-blue-400 group-hover:block dark:border-blue-600" />
      )}
    </button>
  );
}

function GridRungEditor({
  index,
  grid,
  activeTool,
  addressOptions,
  numericOptions,
  addressTaken,
  customVariables,
  flow,
  selectedCell,
  onSelectCell,
  onPlaceNode,
  onRemoveNode,
  onUpdateAddress,
  onUpdateVariant,
  onUpdatePreset,
  onUpdateComparison,
  onToggleHorizontalWire,
  onToggleVerticalWire,
  onPortDragStart,
  onBlockDragStart,
  consumeDragSuppression,
  pendingTapPort,
  onCellContextMenu,
  onInsertRow,
  onDeleteRow,
  onDeleteRung,
}: {
  index: number;
  grid: LadderGrid;
  activeTool: GridTool;
  addressOptions: string[];
  numericOptions: string[];
  addressTaken: (address: string, row: number, col: number) => boolean;
  /** UX/UI refinement Task 3: declared X/Y/M/AI variables with their optional descriptive labels, forwarded to each GridCellView. */
  customVariables: DeclaredVariable[];
  /** This scan's power-flow state for every cell in this rung's grid (Task 3). */
  flow?: GridFlowResult;
  /** Task 4: the cell F5-F8/Delete/Backspace act on, if any is selected within this rung. */
  selectedCell?: { row: number; col: number } | null;
  onSelectCell?: (row: number, col: number) => void;
  onPlaceNode: (row: number, col: number, node: GridNode) => void;
  onRemoveNode: (row: number, col: number) => void;
  onUpdateAddress: (row: number, col: number, address: string) => void;
  onUpdateVariant: (row: number, col: number, variant: TimerVariant | CounterVariant) => void;
  onUpdatePreset: (row: number, col: number, preset: number) => void;
  onUpdateComparison: (row: number, col: number, patch: Record<string, unknown>) => void;
  onToggleHorizontalWire: (row: number, col: number) => void;
  onToggleVerticalWire: (row: number, col: number) => void;
  /** GX Works UX overhaul Task 1: fired on pointerdown over a cell's port dot, with the pointer's screen coordinates for the drag preview line. */
  onPortDragStart: (row: number, col: number, clientX: number, clientY: number) => void;
  /** UX/UI refinement Task 2: fired on pointerdown over an occupied cell's instruction symbol, starting a drag-to-move gesture. */
  onBlockDragStart: (row: number, col: number, clientX: number, clientY: number) => void;
  consumeDragSuppression: () => boolean;
  /** UX/UI refinement Task 5: the port currently armed for two-tap wiring, if it belongs to this rung. */
  pendingTapPort?: { rungIndex: number; row: number; col: number } | null;
  /** UX/UI refinement Task 5: right-click quick-delete (desktop mouse). */
  onCellContextMenu?: (row: number, col: number, clientX: number, clientY: number) => void;
  onInsertRow: (afterRow: number) => void;
  onDeleteRow: (row: number) => void;
  onDeleteRung: () => void;
}) {
  return (
    <div className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {/* GX Works UX overhaul Task 4: rung numbers are 0-indexed (0, 1, 2...), matching GX Works2/3's own convention. */}
      <div className="flex w-6 shrink-0 items-start justify-center pt-4 text-xs font-medium text-zinc-400">{index}</div>

      <div className="flex flex-1 flex-col">
        {grid.cells.map((row, r) => (
          <div key={r}>
            <div className="flex items-center gap-1">
              {row.map((cell, c) => (
                <GridCellView
                  key={c}
                  rungIndex={index}
                  cell={cell}
                  isCoilColumn={c === COIL_COLUMN}
                  activeTool={activeTool}
                  addressOptions={addressOptions}
                  numericOptions={numericOptions}
                  addressTaken={(addr) => addressTaken(addr, r, c)}
                  customVariables={customVariables}
                  flow={flow?.[r]?.[c]}
                  isSelected={selectedCell?.row === r && selectedCell?.col === c}
                  onSelect={() => onSelectCell?.(r, c)}
                  onPlace={(node) => onPlaceNode(r, c, node)}
                  onRemove={() => onRemoveNode(r, c)}
                  onUpdateAddress={(addr) => onUpdateAddress(r, c, addr)}
                  onUpdateVariant={(variant) => onUpdateVariant(r, c, variant)}
                  onUpdatePreset={(preset) => onUpdatePreset(r, c, preset)}
                  onUpdateComparison={(patch) => onUpdateComparison(r, c, patch)}
                  onToggleLeftWire={() => onToggleHorizontalWire(r, c)}
                  onPortDragStart={onPortDragStart}
                  onBlockDragStart={onBlockDragStart}
                  consumeDragSuppression={consumeDragSuppression}
                  pendingTapPort={pendingTapPort?.rungIndex === index ? pendingTapPort : null}
                  onCellContextMenu={onCellContextMenu}
                />
              ))}
              {grid.rowCount > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteRow(r)}
                  aria-label="Delete row"
                  title="ลบแถวนี้ (Delete branch row)"
                  className="ml-1 p-2.5 text-xs text-zinc-400 hover:text-red-500 lg:p-1"
                >
                  x
                </button>
              )}
            </div>
            {r < grid.rowCount - 1 && (
              <div className="flex items-center gap-1">
                {Array.from({ length: GRID_COLUMNS }, (_, c) => (
                  <div
                    key={c}
                    // UX/UI fix: same purpose as GridCellView's data-wire-h - lets GridWiringOverlay find and measure this exact toggle (only when cell.connectBottom is true) to draw an explicit persistent connector line over it.
                    data-wire-v="true"
                    data-rung-index={index}
                    data-row={r}
                    data-col={c}
                    data-energized={!!flow?.[r]?.[c]?.powered && !!flow?.[r + 1]?.[c]?.powered}
                    className="flex shrink-0 flex-col items-center"
                    style={{ width: c === COIL_COLUMN ? 84 : 68 }}
                  >
                    <VerticalWireToggle
                      connected={grid.cells[r][c].connectBottom}
                      energized={!!flow?.[r]?.[c]?.powered && !!flow?.[r + 1]?.[c]?.powered}
                      onToggle={() => onToggleVerticalWire(r, c)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {grid.rowCount < MAX_ROWS_PER_RUNG && (
            <button
              type="button"
              onClick={() => onInsertRow(grid.rowCount - 1)}
              className="w-fit text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              + Insert Branch Row (OR)
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onDeleteRung}
        className="ml-1 self-start p-2.5 text-xs text-zinc-400 hover:text-red-500 lg:p-1"
        aria-label="Delete rung"
      >
        Delete
      </button>
    </div>
  );
}

/** Task 7 (perf): value-compares two scans' flow results cell-by-cell (up to 6x11=66 booleans) - runGridScan/evalGridFlow allocates a brand-new GridFlowResult every scan regardless of whether anything in THIS rung actually changed, so a reference check would never bail. Cheap relative to the render + reconciliation work it lets React skip for the whole rung's ~11-66 GridCellView children. */
function flowsEqual(a?: GridFlowResult, b?: GridFlowResult): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    const rowA = a[r];
    const rowB = b[r];
    if (rowA.length !== rowB.length) return false;
    for (let c = 0; c < rowA.length; c++) {
      if (rowA[c].powered !== rowB[c].powered || rowA[c].conducts !== rowB[c].conducts) return false;
    }
  }
  return true;
}

/**
 * Deliberately excludes every callback prop from the comparison (same
 * reasoning as GridCellView's cellPropsEqual) - each is a pure positional
 * dispatcher closing over this rung's own stable `index` and a stable
 * underlying grid-mutation function, so identity churn from GridEditorSurface
 * recreating them inline every render doesn't reflect an actual behavior
 * change worth re-rendering ~11-66 child cells for.
 */
function rungPropsEqual(prev: Parameters<typeof GridRungEditor>[0], next: Parameters<typeof GridRungEditor>[0]): boolean {
  return (
    prev.grid === next.grid &&
    prev.activeTool === next.activeTool &&
    prev.addressOptions === next.addressOptions &&
    prev.numericOptions === next.numericOptions &&
    prev.customVariables === next.customVariables &&
    flowsEqual(prev.flow, next.flow) &&
    (prev.selectedCell?.row ?? -1) === (next.selectedCell?.row ?? -1) &&
    (prev.selectedCell?.col ?? -1) === (next.selectedCell?.col ?? -1) &&
    (prev.pendingTapPort?.rungIndex ?? -1) === (next.pendingTapPort?.rungIndex ?? -1) &&
    (prev.pendingTapPort?.row ?? -1) === (next.pendingTapPort?.row ?? -1) &&
    (prev.pendingTapPort?.col ?? -1) === (next.pendingTapPort?.col ?? -1)
  );
}

export default memo(GridRungEditor, rungPropsEqual);
