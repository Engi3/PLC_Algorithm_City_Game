"use client";

import {
  DEFAULT_COUNTER_PRESET,
  DEFAULT_TIMER_PRESET,
  groupAddressOptions,
  type ComparisonOperator,
  type CounterVariant,
  type DeclaredVariable,
  type TimerVariant,
} from "@/lib/ladder/types";
import type { GridCell, GridCoilNode, GridInstructionNode, GridNode } from "@/lib/ladder/grid-types";
import { cellHasWire, isCoilNode } from "@/lib/ladder/grid-types";
import type { GridCellFlow } from "@/lib/ladder/grid-engine";
import type { GridTool } from "./types";

const COIL_KIND_LABEL: Record<GridCoilNode["kind"], string> = {
  COIL: "( )",
  SET: "(S)",
  RESET: "(R)",
  TIMER: "TMR",
  COUNTER: "CTR",
};

const OPERATOR_LABEL: Record<string, string> = { ">": ">", "<": "<", "==": "=", ">=": "≥", "<=": "≤" };

export type PlaceToolNodeKind = Extract<GridTool, { kind: "PLACE" }>["nodeKind"];

/** The freshly-placed default shape for each place-able tool kind - mirrors defaultOutputForKind for the legacy model. */
export function defaultNodeForToolKind(nodeKind: PlaceToolNodeKind): GridNode {
  switch (nodeKind) {
    case "NO":
      return { kind: "CONTACT", type: "NO", address: null };
    case "NC":
      return { kind: "CONTACT", type: "NC", address: null };
    case "COMPARE":
      return { kind: "COMPARE", operator: ">", sourceA: null, sourceB: { kind: "constant", value: 0 } };
    case "COIL":
      return { kind: "COIL", address: null };
    case "SET":
      return { kind: "SET", address: null };
    case "RESET":
      return { kind: "RESET", address: null };
    case "TIMER":
      return { kind: "TIMER", variant: "TON", address: null, preset: DEFAULT_TIMER_PRESET };
    case "COUNTER":
      return { kind: "COUNTER", variant: "CTU", address: null, preset: DEFAULT_COUNTER_PRESET };
  }
}

type PortEdge = "left" | "right" | "top" | "bottom" | "center";

const PORT_POSITION_CLASS: Record<PortEdge, string> = {
  left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
  right: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
  top: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
  bottom: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
  // UX/UI fix: the mid-wire tap point on an empty, wire-carrying cell (see cellHasWire) - centered since a bare wire junction has no instruction shape to sit at the edge of.
  center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
};

/**
 * GX Works UX overhaul, Task 1: a connection terminal on an occupied cell's
 * edge. `data-grid-port`/`data-rung-index`/`data-row`/`data-col` are how
 * GridLadderEditor's global pointerup handler finds a drop target via
 * `document.elementFromPoint` - see connectPorts in use-ladder-grid.ts for
 * how two ports get auto-routed into an orthogonal wire.
 */
function PortDot({
  rungIndex,
  row,
  col,
  edge,
  onDragStart,
  isPendingTap,
  title,
}: {
  rungIndex: number;
  row: number;
  col: number;
  edge: PortEdge;
  onDragStart: (row: number, col: number, clientX: number, clientY: number) => void;
  /** UX/UI refinement Task 5: true for the one port currently "armed" by a first tap, awaiting a second tap on another port to complete the connection (see GridLadderEditor's two-tap wiring state machine) - the touch-friendly alternative to drag-to-connect. */
  isPendingTap?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      data-grid-port="true"
      data-rung-index={rungIndex}
      data-row={row}
      data-col={col}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDragStart(row, col, e.clientX, e.clientY);
      }}
      onClick={(e) => e.stopPropagation()}
      title={title ?? "ลากจากจุดนี้ไปยังขั้วของบล็อกอื่นเพื่อต่อสายอัตโนมัติ หรือแตะแล้วแตะขั้วปลายทางอีกครั้ง (Drag to connect, or tap-then-tap on touch)"}
      // UX/UI refinement Task 5: 44px hitbox on touch-first widths (base/sm/md), the Apple/Android minimum touch target, shrinking to a tighter 20px at lg+ for mouse precision - the visible dot inside stays small at every size so the enlarged tap area doesn't look bulky.
      className={`touch-none absolute z-10 flex h-11 w-11 items-center justify-center rounded-full lg:h-5 lg:w-5 ${PORT_POSITION_CLASS[edge]}`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full border transition-transform hover:scale-125 hover:border-blue-500 hover:bg-blue-500 lg:h-2 lg:w-2 ${
          isPendingTap
            ? "animate-pulse border-blue-500 bg-blue-500"
            : "border-zinc-400 bg-white dark:border-zinc-600 dark:bg-zinc-900"
        }`}
      />
    </button>
  );
}

function ContactSymbol({ node, color }: { node: GridInstructionNode; color: string }) {
  if (node.kind === "COMPARE") {
    const b = node.sourceB.kind === "constant" ? String(node.sourceB.value) : node.sourceB.address;
    return (
      <div className={`rounded border border-current px-1 py-0.5 text-center font-mono text-[9px] ${color}`}>
        CMP
        <br />
        {node.sourceA ?? "?"} {OPERATOR_LABEL[node.operator]} {b || "?"}
      </div>
    );
  }
  return (
    <div className={`relative flex h-8 w-9 items-center justify-center ${color}`}>
      <span className="absolute left-1 h-full w-px bg-current" />
      <span className="absolute right-1 h-full w-px bg-current" />
      {node.type === "NC" && <span className="absolute h-6 w-px rotate-45 bg-current" />}
    </div>
  );
}

export default function GridCellView({
  rungIndex,
  cell,
  isCoilColumn,
  activeTool,
  addressOptions,
  numericOptions,
  addressTaken,
  customVariables,
  flow,
  isSelected,
  onSelect,
  onPlace,
  onRemove,
  onUpdateAddress,
  onUpdateVariant,
  onUpdatePreset,
  onUpdateComparison,
  onToggleLeftWire,
  onPortDragStart,
  onBlockDragStart,
  consumeDragSuppression,
  pendingTapPort,
  onCellContextMenu,
}: {
  /** GX Works UX overhaul Task 1: needed on the cell's ports so a global drop-target lookup can identify which rung a drag landed in. */
  rungIndex: number;
  cell: GridCell;
  isCoilColumn: boolean;
  activeTool: GridTool;
  addressOptions: string[];
  numericOptions: string[];
  addressTaken: (address: string) => boolean;
  /** UX/UI refinement Task 3: declared X/Y/M/AI variables with their optional descriptive labels, for the subtitle under the symbol and the grouped/labeled address dropdown. */
  customVariables: DeclaredVariable[];
  /** This scan's power-flow state for the cell (Task 3) - undefined before the engine has run once. */
  flow?: GridCellFlow;
  /** Task 4: whether this is the keyboard-shortcut target cell (see GridLadderEditor's selectedCell). */
  isSelected?: boolean;
  onSelect?: () => void;
  onPlace: (node: GridNode) => void;
  onRemove: () => void;
  onUpdateAddress: (address: string) => void;
  onUpdateVariant: (variant: TimerVariant | CounterVariant) => void;
  onUpdatePreset: (preset: number) => void;
  onUpdateComparison: (patch: Partial<GridInstructionNode>) => void;
  onToggleLeftWire: () => void;
  onPortDragStart: (row: number, col: number, clientX: number, clientY: number) => void;
  /** UX/UI refinement Task 2: begins a drag-to-move gesture from an occupied cell's own instruction symbol (not its ports, address fields, or empty cells). */
  onBlockDragStart: (row: number, col: number, clientX: number, clientY: number) => void;
  /** UX/UI refinement Task 2: true (and self-resetting) exactly once right after a real block drag completes - lets the click that (may) trail the drag's pointerup be ignored instead of re-selecting or re-placing into the now-different cell underneath. */
  consumeDragSuppression: () => boolean;
  /** UX/UI refinement Task 5: the (row, col) of the port currently armed by a first tap, if any and if it belongs to this cell - drives the pulsing highlight on the matching PortDot. */
  pendingTapPort?: { row: number; col: number } | null;
  /** UX/UI refinement Task 5: right-click quick-delete (desktop mouse) - fired with the pointer's screen position so the caller can place a small confirm/undo affordance there if desired; only meaningful on an occupied cell. */
  onCellContextMenu?: (row: number, col: number, clientX: number, clientY: number) => void;
}) {
  const { node } = cell;
  const wireToolActive = activeTool?.kind === "DRAW_LINE" || activeTool?.kind === "DELETE_LINE";

  /**
   * Clicking always selects the cell (so Delete/Backspace and F5-F8 have a
   * target), and additionally places when a PLACE tool is active over an
   * empty, column-compatible cell. Skipped entirely for the trailing click
   * of a just-completed block drag (see consumeDragSuppression) - without
   * this, releasing a drag back over the emptied source cell could
   * re-select it or, worse, re-place a fresh block into the gap a PLACE
   * tool left active would otherwise fill.
   */
  function handleCellClick() {
    if (consumeDragSuppression()) return;
    onSelect?.();
    if (node) return;
    if (activeTool?.kind !== "PLACE") return;
    const wantsCoil = ["COIL", "SET", "RESET", "TIMER", "COUNTER"].includes(activeTool.nodeKind);
    if (wantsCoil !== isCoilColumn) return; // coil tools only place in the coil column, instruction tools only left of it
    onPlace(defaultNodeForToolKind(activeTool.nodeKind));
  }

  const unassigned = node ? (node.kind === "COMPARE" ? !node.sourceA : !node.address) : false;
  const energized = !!flow?.conducts;
  // Task 4: a real "Active Monitoring Glow" on the instruction symbol itself, not just the color swap - so an energized contact/coil is unmistakable during RUN/STEP even at a glance.
  const color = unassigned ? "text-red-500" : energized ? "text-green-500 drop-shadow-[0_0_4px_rgba(34,197,94,0.9)]" : "text-zinc-500 dark:text-zinc-400";

  // UX/UI refinement Task 3: the currently-assigned address's declared description, shown as a subtitle under the symbol (e.g. "X0" / "เซ็นเซอร์หน้า") for educational clarity - undefined for built-in I/Q addresses (no DeclaredVariable exists for those) or when the student hasn't given this variable a label yet.
  const currentAddress = node ? (node.kind === "COMPARE" ? node.sourceA : node.address) : null;
  const currentLabel = currentAddress ? customVariables.find((v) => v.address === currentAddress)?.label : undefined;

  return (
    <div className="flex shrink-0 flex-col items-center" style={{ width: isCoilColumn ? 84 : 68 }}>
      {/* Horizontal wire segment coming in from the left. */}
      <button
        type="button"
        onClick={onToggleLeftWire}
        title={wireToolActive ? "คลิกเพื่อเชื่อม/ตัดเส้นไฟแนวนอน" : undefined}
        disabled={!wireToolActive}
        // UX/UI refinement Task 5: a taller hit strip on touch-first widths so this thin horizontal wire bar is reliably tappable with a finger, back to its original slim 8px at lg+ where mouse precision doesn't need the extra height.
        className={`h-3 w-full transition-colors lg:h-2 ${wireToolActive ? "cursor-pointer" : "cursor-default"} ${
          cell.connectLeft
            ? flow?.powered
              ? "bg-green-500 shadow-[0_0_5px_2px_rgba(34,197,94,0.7)]"
              : "bg-zinc-400 dark:bg-zinc-600"
            : wireToolActive
              ? "bg-zinc-300 hover:bg-blue-300 dark:bg-zinc-700 dark:hover:bg-blue-800"
              : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      />

      <div
        onClick={handleCellClick}
        onContextMenu={(e) => {
          if (!node || !onCellContextMenu) return;
          e.preventDefault(); // suppress the native browser menu - this IS the app's own quick-delete context menu
          onCellContextMenu(cell.row, cell.col, e.clientX, e.clientY);
        }}
        data-grid-cell="true"
        data-rung-index={rungIndex}
        data-row={cell.row}
        data-col={cell.col}
        // UX/UI fix: GridWiringOverlay reads this to color the connector line it draws through this cell's own center - reusing the same "is the wire feeding into this cell live" signal that already drives the horizontal bar's green/gray color above.
        data-energized={!!flow?.powered}
        // Task 4: a crisp border on every cell reads as an industrial gridline grid (GX Works2/3 look) rather than floating blocks, with a subtle blue/gray highlight on hover regardless of whether the cell is empty or occupied.
        // UX/UI refinement Task 3: every cell (occupied or empty) is uniformly taller than before (h-16 -> h-20) to always reserve a line for the optional description subtitle, so rows stay evenly aligned whether or not any given block has a label.
        className={`group relative flex h-20 w-full flex-col items-center justify-center gap-0.5 rounded border border-zinc-200 transition-colors hover:border-blue-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-blue-700 dark:hover:bg-zinc-900 ${
          !node && activeTool?.kind === "PLACE" ? "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950" : ""
        } ${isSelected ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-950" : ""}`}
      >
        {!node && !cellHasWire(cell) && <span className="text-zinc-300 dark:text-zinc-700">·</span>}

        {node && (() => {
          const isPending = pendingTapPort?.row === cell.row && pendingTapPort?.col === cell.col;
          return (
            <>
              <PortDot rungIndex={rungIndex} row={cell.row} col={cell.col} edge="left" onDragStart={onPortDragStart} isPendingTap={isPending} />
              <PortDot rungIndex={rungIndex} row={cell.row} col={cell.col} edge="right" onDragStart={onPortDragStart} isPendingTap={isPending} />
              <PortDot rungIndex={rungIndex} row={cell.row} col={cell.col} edge="top" onDragStart={onPortDragStart} isPendingTap={isPending} />
              <PortDot rungIndex={rungIndex} row={cell.row} col={cell.col} edge="bottom" onDragStart={onPortDragStart} isPendingTap={isPending} />
            </>
          );
        })()}

        {/*
          UX/UI fix: a mid-wire tap point - lets a new connection start or
          end on an empty cell that already carries a wire through it,
          instead of requiring a placed instruction to get a port. Only one
          center dot (not 4 edge dots) since a bare wire junction has no
          instruction shape with distinct sides to anchor to.
        */}
        {!node && cellHasWire(cell) && (() => {
          const isPending = pendingTapPort?.row === cell.row && pendingTapPort?.col === cell.col;
          return (
            <PortDot
              rungIndex={rungIndex}
              row={cell.row}
              col={cell.col}
              edge="center"
              onDragStart={onPortDragStart}
              isPendingTap={isPending}
              title="แตะจุดกลางสายนี้เพื่อแยกแขนงใหม่ - ลากไปยังขั้วของบล็อกอื่น หรือแตะแล้วแตะขั้วปลายทางอีกครั้ง (Tap into this wire to branch off a new connection)"
            />
          );
        })()}

        {/*
          UX/UI refinement Task 2: the instruction symbol itself is the
          drag-to-move handle - grabbing it and dropping over a different
          empty, column-compatible cell relocates the block instead of
          requiring delete-then-recreate. Kept as its own inner element
          (not the whole cell) so it never intercepts clicks meant for the
          ports, address dropdown, or empty-cell placement above/below it.
        */}
        {node && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onBlockDragStart(cell.row, cell.col, e.clientX, e.clientY);
            }}
            title="ลากเพื่อย้ายบล็อกนี้ไปยังช่องว่าง (Drag to move)"
            className="touch-none cursor-grab active:cursor-grabbing"
          >
            {isCoilNode(node) ? (
              <div
                className={`flex h-8 w-11 items-center justify-center rounded-full border-2 border-current font-mono text-[9px] ${color}`}
              >
                {COIL_KIND_LABEL[node.kind]}
              </div>
            ) : (
              <ContactSymbol node={node} color={color} />
            )}
          </div>
        )}

        {/* UX/UI refinement Task 3: the assigned variable's description, right under the symbol - only takes up space when one exists, since the cell's own fixed height already reserves the line either way. */}
        {node && (
          <span
            title={currentLabel}
            className="max-w-[76px] truncate text-center text-[8px] leading-tight text-zinc-500 dark:text-zinc-400"
          >
            {currentLabel ?? ""}
          </span>
        )}

        {node && (
          <select
            aria-label="Address"
            value={(node.kind === "COMPARE" ? node.sourceA : node.address) ?? ""}
            onChange={(e) =>
              node.kind === "COMPARE" ? onUpdateComparison({ sourceA: e.target.value || null }) : onUpdateAddress(e.target.value)
            }
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[76px] rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900 ${color}`}
          >
            <option value="">?</option>
            {/* UX/UI refinement Task 3: a no-typo picker grouped by variable kind (Inputs/Outputs/Relays/Timers/Counters/Analog), each option showing its declared description when one exists - a native <select> renders as the OS's own popover/dropdown menu on every platform, mobile included. */}
            {groupAddressOptions(node.kind === "COMPARE" ? numericOptions : addressOptions, customVariables).map((group) => (
              <optgroup key={group.groupLabel} label={group.groupLabel}>
                {group.options.map(({ address, label }) => (
                  <option key={address} value={address} disabled={addressTaken(address)}>
                    {address}
                    {label ? ` - ${label}` : ""}
                    {addressTaken(address) ? " (used)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {node && node.kind === "COMPARE" && (
          <select
            aria-label="Operator"
            value={node.operator}
            onChange={(e) => onUpdateComparison({ operator: e.target.value as ComparisonOperator })}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[76px] rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
          >
            {Object.keys(OPERATOR_LABEL).map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABEL[op]}
              </option>
            ))}
          </select>
        )}
        {node && node.kind === "COMPARE" && (
          <input
            type="number"
            aria-label="Compare value"
            value={node.sourceB.kind === "constant" ? node.sourceB.value : 0}
            onChange={(e) =>
              onUpdateComparison({ sourceB: { kind: "constant", value: Number(e.target.value) || 0 } })
            }
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[76px] rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}

        {node && (node.kind === "TIMER" || node.kind === "COUNTER") && (
          <>
            <select
              aria-label="Variant"
              value={node.variant}
              onChange={(e) => onUpdateVariant(e.target.value as TimerVariant | CounterVariant)}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[76px] rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
            >
              {node.kind === "TIMER"
                ? ["TON", "TOF", "RTO"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))
                : ["CTU", "CTD"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
            </select>
            <input
              type="number"
              min={1}
              max={20}
              value={node.preset}
              onChange={(e) => onUpdatePreset(Number(e.target.value) || 1)}
              onClick={(e) => e.stopPropagation()}
              aria-label="Preset"
              className="w-full max-w-[76px] rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
            />
          </>
        )}

        {node && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove"
            className="absolute -top-1 right-0 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none text-white group-hover:flex"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
