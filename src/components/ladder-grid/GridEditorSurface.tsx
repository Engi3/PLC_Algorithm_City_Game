"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  contactAddressOptions,
  isOutputAddressTaken,
  MAX_ANALOG_VARIABLE_NUMBER,
  numericAddressOptions,
} from "@/lib/ladder/types";
import { COIL_COLUMN, isCoilNode, type GridNode } from "@/lib/ladder/grid-types";
import { evalGridFlow } from "@/lib/ladder/grid-engine";
import { MAX_GRID_RUNGS, MAX_ROWS_PER_RUNG, type LadderGridApi } from "@/lib/ladder/use-ladder-grid";
import type { VariablePoolApi } from "@/lib/ladder/use-variable-pool";
import { gridProgramToProgram } from "@/lib/ladder/grid-adapter";
import GridToolbar from "./GridToolbar";
import GridRungEditor from "./GridRungEditor";
import GridCanvas from "./GridCanvas";
import GridFbdView from "./GridFbdView";
import GridStView from "./GridStView";
import GridWiringOverlay from "./GridWiringOverlay";
import VariablePoolDrawer from "@/components/ladder/VariablePoolDrawer";
import IoPanel from "@/components/ladder/IoPanel";
import AnalogInputPanel from "@/components/ladder/AnalogInputPanel";
import { defaultNodeForToolKind, type PlaceToolNodeKind } from "./GridCellView";
import type { GridTool } from "./types";

type SelectedCell = { rungIndex: number; row: number; col: number };

/** UX/UI refinement Task 4: which read-only representation of the same grid is currently shown - Ladder Diagram is the live editable canvas, Function Block and Structured Text are compiled views (see iec-compiler.ts). */
type ViewMode = "LD" | "FBD" | "ST";

/** GX Works UX overhaul Task 1: the port a drag-to-connect gesture started from, plus its screen position for the rubber-band preview line. */
type PortDragSource = { rungIndex: number; row: number; col: number; startX: number; startY: number };

/** UX/UI refinement Task 2: the cell a block drag-to-move gesture started from. */
type BlockDragSource = { rungIndex: number; row: number; col: number; startX: number; startY: number };

/** UX/UI refinement Task 2: movement under this, from pointerdown to pointerup, counts as a plain click (select/place) rather than a drag-to-move. */
const BLOCK_DRAG_THRESHOLD_PX = 6;

/** UX/UI refinement Task 5: movement under this, from pointerdown to pointerup on a PortDot, counts as a tap (arms/completes two-tap wiring) rather than a drag-to-connect - the touch-friendly alternative for devices where dragging a small dot precisely is unreliable. */
const PORT_TAP_THRESHOLD_PX = 6;

/** UX/UI refinement Task 5: right-click quick-delete (desktop mouse) - the cell to delete, plus screen position for the floating confirm button. */
type ContextMenuState = { rungIndex: number; row: number; col: number; x: number; y: number };

/** Task 4: GX Works3 has only one physical F8 key but five "applied instruction" kinds - each F8 press cycles to the next, with the toolbar highlight as feedback. */
const APPLIED_INSTRUCTION_CYCLE: PlaceToolNodeKind[] = ["SET", "RESET", "COMPARE", "TIMER", "COUNTER"];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** UX/UI fix: how close to GridCanvas's scroll container edge (in px) the pointer needs to be, during a port/block drag, before that edge starts auto-scrolling. */
const EDGE_SCROLL_THRESHOLD_PX = 40;
/** UX/UI fix: how far GridCanvas's container scrolls per pointermove tick once the pointer is within the edge threshold - a plain fixed step (not proportional to distance past the edge) since pointermove already fires frequently enough during a real drag for this to feel continuous. */
const EDGE_SCROLL_STEP_PX = 18;

/**
 * UX/UI fix: without this, connecting or moving something across a program
 * wider/taller than the viewport requires the pointer to be over a target
 * that's scrolled out of GridCanvas's view - physically impossible in one
 * continuous drag (e.g. dragging from a far-left contact down to the
 * right-most output column). Called from the port-drag and block-drag
 * pointermove handlers so both gestures benefit the same way.
 */
function autoScrollCanvasNearEdge(clientX: number, clientY: number) {
  const container = document.querySelector('[data-grid-canvas-scroll="true"]');
  if (!(container instanceof HTMLElement)) return;
  const rect = container.getBoundingClientRect();
  if (clientX < rect.left + EDGE_SCROLL_THRESHOLD_PX) container.scrollLeft -= EDGE_SCROLL_STEP_PX;
  else if (clientX > rect.right - EDGE_SCROLL_THRESHOLD_PX) container.scrollLeft += EDGE_SCROLL_STEP_PX;
  if (clientY < rect.top + EDGE_SCROLL_THRESHOLD_PX) container.scrollTop -= EDGE_SCROLL_STEP_PX;
  else if (clientY > rect.bottom - EDGE_SCROLL_THRESHOLD_PX) container.scrollTop += EDGE_SCROLL_STEP_PX;
}

/**
 * The full industrial ladder-editing surface: toolbar, wiring canvas, live
 * power-flow simulation, F5-F10 keyboard shortcuts, drag-to-connect/two-tap
 * wiring, mid-wire taps, click-to-delete connector lines. Extracted from
 * the original single-purpose `GridLadderEditor` (Sandbox only) so the
 * Levels authoring editor and student play page can share the exact same,
 * already-verified interaction logic instead of re-implementing it -
 * `grid`/`pool` are passed in (each caller owns its own `useLadderGrid()`/
 * `useVariablePool()` instance) and `banner` is the top callout, since the
 * right message differs by context (Sandbox's "no scoring" note doesn't
 * belong in a graded level).
 */
export default function GridEditorSurface({
  grid,
  pool,
  banner,
  onStep,
  onToggleInput,
  onSetInputValue,
  onSetAnalogInput,
  onReset,
}: {
  grid: LadderGridApi;
  pool: VariablePoolApi;
  banner: React.ReactNode;
  /**
   * Override the Step/input/reset controls' effect instead of calling
   * `grid`'s own methods directly - the Levels authoring editor needs this
   * to intercept every one of these interactions (wraps each in its own
   * frame/tick-tracking logic for the test-case recorder); Sandbox and
   * student Play don't pass these and get the plain `grid.*` behavior.
   */
  onStep?: () => void;
  onToggleInput?: (address: string) => void;
  onSetInputValue?: (address: string, value: boolean) => void;
  onSetAnalogInput?: (address: string, value: number) => void;
  onReset?: () => void;
}) {
  const step = onStep ?? grid.step;
  const toggleInput = onToggleInput ?? grid.toggleInput;
  const setInputValue = onSetInputValue ?? grid.setInputValue;
  const setAnalogInput = onSetAnalogInput ?? grid.setAnalogInput;
  const reset = onReset ?? grid.reset;
  const [view, setView] = useState<ViewMode>("LD");
  const [activeTool, setActiveTool] = useState<GridTool>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [portDragSource, setPortDragSource] = useState<PortDragSource | null>(null);
  const [portDragPointer, setPortDragPointer] = useState<{ x: number; y: number } | null>(null);
  /** UX/UI fix: the port dot currently under the cursor mid-drag, if it's a valid different-cell target - drives a green "magnetic snap" ring so it's obvious where a release will land before you let go. */
  const [dragHoverPoint, setDragHoverPoint] = useState<{ x: number; y: number } | null>(null);
  // UX/UI refinement Task 5: two-tap wiring - the port armed by a first tap, awaiting a second tap on a different port to complete the connection. hasDraggedPortRef distinguishes a real drag (existing drag-to-connect behavior) from a tap (arms/completes/cancels this instead) using the same movement-threshold pattern as the block-drag machinery below.
  const [pendingPortTap, setPendingPortTap] = useState<PortDragSource | null>(null);
  /** UX/UI fix: live cursor position while a tap is armed. A short mouse/trackpad drag that stays under PORT_TAP_THRESHOLD_PX reads as a tap, not a drag - without this, that case showed only the small pulsing dot and no line at all, which is what made a real connection attempt look like nothing had happened. */
  const [tapHoverPointer, setTapHoverPointer] = useState<{ x: number; y: number } | null>(null);
  /** UX/UI fix: a transient "Connected"/"Cannot connect" pill at the drop point after every connection attempt (drag release or second tap) - connectPorts succeeds or fails completely silently otherwise, so there was no way to tell whether a drag actually registered. */
  const [connectionFeedback, setConnectionFeedback] = useState<{ x: number; y: number; success: boolean } | null>(null);
  const hasDraggedPortRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [blockDragSource, setBlockDragSource] = useState<BlockDragSource | null>(null);
  const [blockDragPointer, setBlockDragPointer] = useState<{ x: number; y: number } | null>(null);
  // Whether the in-progress block drag has moved past BLOCK_DRAG_THRESHOLD_PX
  // yet - a plain click (no real movement) is left alone to fall through to
  // GridCellView's own onClick (select/place), only a genuine drag attempts
  // a move on release. Set true right after a real move completes/attempts,
  // so the drag's trailing click (if the release happened to land back on
  // the source cell) can be told apart from a fresh click - consumed once by
  // GridCellView's handleCellClick, with the setTimeout as a safety net in
  // case no click ever fires to consume it.
  const hasDraggedBlockRef = useRef(false);
  const justFinishedBlockDragRef = useRef(false);
  // connectPorts/moveNode are recreated every render (not memoized) - refs let the
  // pointermove/pointerup listeners below always call the latest version
  // without needing `grid` in their effect's deps, which would otherwise
  // force the listeners to be torn down and re-attached on every single
  // pointermove during a drag (grid's identity also changes every render).
  const connectPortsRef = useRef(grid.connectPorts);
  const moveNodeRef = useRef(grid.moveNode);
  useEffect(() => {
    moveNodeRef.current = grid.moveNode;
  });
  useEffect(() => {
    connectPortsRef.current = grid.connectPorts;
  });

  /** UX/UI fix: the connection feedback pill self-dismisses so it reads as a toast, not a persistent label. */
  useEffect(() => {
    if (!connectionFeedback) return;
    const timer = setTimeout(() => setConnectionFeedback(null), 900);
    return () => clearTimeout(timer);
  }, [connectionFeedback]);

  /** UX/UI fix: tracks the cursor while a two-tap connection is armed (mouse/trackpad only - touch has no hover), so the rubber-band preview line below also covers the "short drag that read as a tap" case, not just a genuine drag. */
  useEffect(() => {
    if (!pendingPortTap) {
      setTapHoverPointer(null);
      return;
    }
    function onMove(e: PointerEvent) {
      setTapHoverPointer({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [pendingPortTap]);

  const legacyProgram = useMemo(() => gridProgramToProgram(grid.gridProgram), [grid.gridProgram]);
  const addressOptions = useMemo(
    () => contactAddressOptions(legacyProgram, pool.customVariables),
    [legacyProgram, pool.customVariables]
  );
  const numericOptions = useMemo(
    () => numericAddressOptions(legacyProgram, pool.customVariables),
    [legacyProgram, pool.customVariables]
  );
  const analogAddresses = pool.customVariables.filter((v) => v.kind === "analog_input").map((v) => v.address);
  const analogPoolFull =
    pool.customVariables.filter((v) => v.kind === "analog_input").length > MAX_ANALOG_VARIABLE_NUMBER;

  /**
   * GX Works UX overhaul Task 3 "Smart Latching": the quick-shortcut button
   * only lights up when the current selection is a contact sitting at
   * column 0 (the classic Start-button position) - see wrapWithSelfHold in
   * use-ladder-grid.ts for why the shortcut is scoped to that position.
   */
  const canSmartLatch =
    !!selectedCell &&
    selectedCell.col === 0 &&
    grid.gridProgram.grids[selectedCell.rungIndex]?.cells[selectedCell.row]?.[0]?.node?.kind === "CONTACT" &&
    grid.gridProgram.grids[selectedCell.rungIndex].rowCount < MAX_ROWS_PER_RUNG;

  /** UX/UI refinement Task 2: the explicit Delete button only lights up when the current selection actually holds a block - a touch/no-keyboard equivalent to the Delete/Backspace shortcut. */
  const selectedBlockNode = selectedCell
    ? grid.gridProgram.grids[selectedCell.rungIndex]?.cells[selectedCell.row]?.[selectedCell.col]?.node ?? null
    : null;

  function addNextAnalogVariable() {
    const taken = new Set(analogAddresses);
    for (let n = 0; n <= MAX_ANALOG_VARIABLE_NUMBER; n++) {
      const address = `AI${n}`;
      if (!taken.has(address)) {
        pool.addVariable("analog_input", n);
        return;
      }
    }
  }

  /** How many coil-bearing rows precede `row` within this rung - matches gridToRung's output ordering, for isOutputAddressTaken's exclude-self index. */
  function outputIndexFor(rungIndex: number, row: number): number {
    const cells = grid.gridProgram.grids[rungIndex].cells;
    let count = 0;
    for (let r = 0; r < row; r++) {
      if (isCoilNode(cells[r][COIL_COLUMN].node)) count += 1;
    }
    return count;
  }

  function addressTakenFor(rungIndex: number, isCoilColumn: boolean) {
    return (address: string, row: number) => {
      if (!isCoilColumn) return false;
      const node = grid.gridProgram.grids[rungIndex].cells[row][COIL_COLUMN].node;
      if (!node || !isCoilNode(node)) return false;
      return isOutputAddressTaken(legacyProgram, node.kind, address, legacyProgram.rungs[rungIndex]?.id ?? "", outputIndexFor(rungIndex, row));
    };
  }

  /**
   * Task 4: activates `nodeKind`'s tool (so the toolbar highlight always
   * reflects the last-pressed key) and, if a selected cell is empty and in
   * the right column for this kind, places it there immediately - mirroring
   * "select a cell, press a key to drop the instruction" from GX Works3/TIA
   * Portal rather than requiring a follow-up mouse click every time.
   */
  function placeAtSelected(nodeKind: PlaceToolNodeKind) {
    setActiveTool({ kind: "PLACE", nodeKind });
    if (!selectedCell) return;
    const { rungIndex, row, col } = selectedCell;
    const existingCell = grid.gridProgram.grids[rungIndex]?.cells[row]?.[col];
    if (!existingCell || existingCell.node) return;
    const node = defaultNodeForToolKind(nodeKind);
    if (isCoilNode(node) !== (col === COIL_COLUMN)) return;
    grid.placeNode(rungIndex, row, col, node);
  }

  function cycleApplicationInstruction() {
    const currentIndex =
      activeTool?.kind === "PLACE" ? APPLIED_INSTRUCTION_CYCLE.indexOf(activeTool.nodeKind as PlaceToolNodeKind) : -1;
    const next = APPLIED_INSTRUCTION_CYCLE[(currentIndex + 1) % APPLIED_INSTRUCTION_CYCLE.length];
    placeAtSelected(next);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      switch (e.key) {
        case "F5":
          e.preventDefault();
          placeAtSelected("NO");
          break;
        case "F6":
          e.preventDefault();
          placeAtSelected("NC");
          break;
        case "F7":
          e.preventDefault();
          placeAtSelected("COIL");
          break;
        case "F8":
          e.preventDefault();
          cycleApplicationInstruction();
          break;
        case "F9":
          e.preventDefault();
          setActiveTool({ kind: "DRAW_LINE" });
          break;
        case "F10":
          e.preventDefault();
          setActiveTool({ kind: "DELETE_LINE" });
          break;
        case "Delete":
        case "Backspace":
          if (selectedCell) {
            e.preventDefault();
            grid.removeNode(selectedCell.rungIndex, selectedCell.row, selectedCell.col);
          }
          break;
        case "Escape":
          setActiveTool(null);
          setSelectedCell(null);
          setPendingPortTap(null);
          setContextMenu(null);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // `grid`'s functions close over its current inputs/memory/gridProgram and
    // are recreated every render (not memoized) - re-subscribing on every
    // render (rather than a narrower dep list) is what keeps handleKeyDown
    // from ever calling a stale closure.
  }, [activeTool, selectedCell, grid]);

  /** GX Works UX overhaul Task 1: begins a drag-to-connect gesture from a cell's port dot (see GridCellView's PortDot). */
  function handlePortDragStart(rungIndex: number, row: number, col: number, clientX: number, clientY: number) {
    hasDraggedPortRef.current = false;
    setPortDragSource({ rungIndex, row, col, startX: clientX, startY: clientY });
    setPortDragPointer({ x: clientX, y: clientY });
  }

  useEffect(() => {
    if (!portDragSource) return;

    function hoverTargetAt(clientX: number, clientY: number): { el: HTMLElement; row: number; col: number; rungIndex: number } | null {
      const target = document.elementFromPoint(clientX, clientY);
      const portEl = target instanceof HTMLElement ? target.closest('[data-grid-port="true"]') : null;
      if (!(portEl instanceof HTMLElement)) return null;
      const row = Number(portEl.getAttribute("data-row"));
      const col = Number(portEl.getAttribute("data-col"));
      const rungIndex = Number(portEl.getAttribute("data-rung-index"));
      // Don't highlight the port the drag started from - that's not a valid target (connectPorts rejects a same-cell connection).
      if (rungIndex === portDragSource!.rungIndex && row === portDragSource!.row && col === portDragSource!.col) return null;
      return { el: portEl, row, col, rungIndex };
    }

    function onMove(e: PointerEvent) {
      const moved = Math.hypot(e.clientX - portDragSource!.startX, e.clientY - portDragSource!.startY);
      if (moved > PORT_TAP_THRESHOLD_PX) hasDraggedPortRef.current = true;
      setPortDragPointer({ x: e.clientX, y: e.clientY });

      // UX/UI fix: highlight whatever port is currently under the cursor once this reads as a real drag, so it's clear where a release will connect to before you actually let go (the earlier version gave zero feedback until the drop itself).
      if (hasDraggedPortRef.current) {
        autoScrollCanvasNearEdge(e.clientX, e.clientY);
        const hover = hoverTargetAt(e.clientX, e.clientY);
        if (hover) {
          const r = hover.el.getBoundingClientRect();
          setDragHoverPoint({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
        } else {
          setDragHoverPoint(null);
        }
      }
    }

    function onUp(e: PointerEvent) {
      if (hasDraggedPortRef.current) {
        // A genuine drag: connect to whatever port is under the release point (unchanged from Task 1).
        const hover = hoverTargetAt(e.clientX, e.clientY);
        let success = false;
        if (hover && hover.rungIndex === portDragSource!.rungIndex) {
          success = connectPortsRef.current(portDragSource!.rungIndex, { row: portDragSource!.row, col: portDragSource!.col }, { row: hover.row, col: hover.col });
        }
        // UX/UI fix: previously silent either way - now always shows a "Connected"/"Cannot connect" pill at the drop point, so a failed drag (blocked path, missed the target) is as visible as a successful one.
        setConnectionFeedback({ x: e.clientX, y: e.clientY, success });
        setPendingPortTap(null); // a completed drag also clears any stale armed tap from an earlier, abandoned two-tap attempt
      } else {
        // UX/UI refinement Task 5: two-tap wiring - this pointerdown/up pair barely moved, so treat it as a tap rather than a drag.
        setPendingPortTap((pending) => {
          if (!pending || pending.rungIndex !== portDragSource!.rungIndex) {
            return { rungIndex: portDragSource!.rungIndex, row: portDragSource!.row, col: portDragSource!.col, startX: portDragSource!.startX, startY: portDragSource!.startY };
          }
          if (pending.row === portDragSource!.row && pending.col === portDragSource!.col) {
            return null; // tapped the same port again - cancel
          }
          const success = connectPortsRef.current(portDragSource!.rungIndex, { row: pending.row, col: pending.col }, { row: portDragSource!.row, col: portDragSource!.col });
          setConnectionFeedback({ x: e.clientX, y: e.clientY, success });
          return null;
        });
      }
      setPortDragSource(null);
      setPortDragPointer(null);
      setDragHoverPoint(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Only re-subscribes when a drag actually starts/ends (portDragSource is
    // stable in between) - pointer position updates go through the
    // dedicated portDragPointer state instead of being a dependency here.
  }, [portDragSource]);

  /** UX/UI refinement Task 5: right-click quick-delete (desktop mouse) - opens a small floating "Delete" confirm at the click position instead of deleting instantly, so a stray right-click can't silently destroy work. */
  function handleCellContextMenu(rungIndex: number, row: number, col: number, clientX: number, clientY: number) {
    setContextMenu({ rungIndex, row, col, x: clientX, y: clientY });
  }

  useEffect(() => {
    if (!contextMenu) return;
    function dismiss() {
      setContextMenu(null);
    }
    // Any subsequent click (including the one that picks the "Delete" button itself, which stops its own propagation - see the button below) or scroll dismisses the menu, matching how native context menus behave.
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [contextMenu]);

  /** UX/UI refinement Task 2: begins a drag-to-move gesture from an occupied cell's instruction symbol (see GridCellView). */
  function handleBlockDragStart(rungIndex: number, row: number, col: number, clientX: number, clientY: number) {
    hasDraggedBlockRef.current = false;
    setBlockDragSource({ rungIndex, row, col, startX: clientX, startY: clientY });
    setBlockDragPointer({ x: clientX, y: clientY });
  }

  /** Called from GridCellView's handleCellClick; true (once) right after a real drag just completed, so that click is treated as part of the drag instead of a fresh select/place. */
  function consumeDragSuppression(): boolean {
    if (!justFinishedBlockDragRef.current) return false;
    justFinishedBlockDragRef.current = false;
    return true;
  }

  useEffect(() => {
    if (!blockDragSource) return;

    function onMove(e: PointerEvent) {
      const moved = Math.hypot(e.clientX - blockDragSource!.startX, e.clientY - blockDragSource!.startY);
      if (moved > BLOCK_DRAG_THRESHOLD_PX) hasDraggedBlockRef.current = true;
      setBlockDragPointer({ x: e.clientX, y: e.clientY });
      if (hasDraggedBlockRef.current) autoScrollCanvasNearEdge(e.clientX, e.clientY);
    }

    function onUp(e: PointerEvent) {
      if (hasDraggedBlockRef.current) {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const cellEl = target instanceof HTMLElement ? target.closest('[data-grid-cell="true"]') : null;
        if (cellEl) {
          const targetRungIndex = Number(cellEl.getAttribute("data-rung-index"));
          const targetRow = Number(cellEl.getAttribute("data-row"));
          const targetCol = Number(cellEl.getAttribute("data-col"));
          moveNodeRef.current(
            blockDragSource!.rungIndex,
            { row: blockDragSource!.row, col: blockDragSource!.col },
            targetRungIndex,
            { row: targetRow, col: targetCol }
          );
        }
        justFinishedBlockDragRef.current = true;
        setTimeout(() => {
          justFinishedBlockDragRef.current = false;
        }, 0);
      }
      setBlockDragSource(null);
      setBlockDragPointer(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Only re-subscribes when a drag actually starts/ends, same reasoning as the port-drag effect above.
  }, [blockDragSource]);

  return (
    <div className="flex flex-col gap-4">
      {banner}

      {/* UX/UI refinement Task 4: LD is the live editable canvas; FBD/ST are read-only views compiled from the grid's actual wire topology (iec-compiler.ts), correctly handling parallel-branch/Self-Hold circuits that the flat legacy conversion used elsewhere in the app cannot. */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["LD", "FBD", "ST"] as const).map((v) => (
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

      {view === "FBD" && (
        <GridFbdView grids={grid.gridProgram.grids} inputs={grid.inputs} memory={grid.memory} analogInputs={grid.analogInputs} />
      )}
      {view === "ST" && <GridStView grids={grid.gridProgram.grids} />}

      {view === "LD" && (
        <>
      <GridToolbar activeTool={activeTool} onSelectTool={setActiveTool} />
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        คลิกเลือกช่องแล้วกด F5-F10 เพื่อวางบล็อก/วาดสายทันที หรือกด Delete หรือ Backspace เพื่อลบบล็อกที่เลือก - กด F8 ซ้ำเพื่อเลือกคำสั่งประยุกต์ถัดไป
        (Set/Reset/CMP/Timer/Counter)
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <VariablePoolDrawer pool={pool} />
        <button
          type="button"
          onClick={addNextAnalogVariable}
          disabled={analogPoolFull}
          title="ประกาศตัวแปรอินพุตอนาล็อกตัวถัดไป (AI) เช่น ค่าจากเซนเซอร์หรือค่าธรณีขั้น เพื่อใช้กับบล็อกเปรียบเทียบ (CMP)"
          className="h-10 w-fit rounded-md border border-dashed border-amber-400 px-3 text-sm font-medium text-amber-700 hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          + Analog Value
        </button>
        <button
          type="button"
          onClick={() => selectedCell && grid.wrapWithSelfHold(selectedCell.rungIndex, selectedCell.row)}
          disabled={!canSmartLatch}
          title="ห่อหุ้มหน้าสัมผัสที่เลือกด้วยแขนงล็อคตัวเอง (Self-Hold / Interlock) - เลือกหน้าสัมผัสตัวแรกสุดของแถว (คอลัมน์ซ้ายสุด) ก่อน แล้วระบบจะเพิ่มแถวขนานพร้อมหน้าสัมผัสของคอยล์เองให้อัตโนมัติ"
          className="h-10 w-fit rounded-md border border-dashed border-purple-400 px-3 text-sm font-medium text-purple-700 hover:border-purple-500 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-purple-400 dark:hover:bg-purple-950"
        >
          🔒 Self-Hold
        </button>
        <button
          type="button"
          onClick={() => selectedCell && grid.removeNode(selectedCell.rungIndex, selectedCell.row, selectedCell.col)}
          disabled={!selectedBlockNode}
          title="ลบบล็อกที่เลือกอยู่ (เทียบเท่ากับกด Delete หรือ Backspace)"
          className="h-10 w-fit rounded-md border border-dashed border-red-400 px-3 text-sm font-medium text-red-700 hover:border-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          🗑 Delete
        </button>
      </div>

      <GridCanvas>
        <div className="flex flex-col gap-3">
          {grid.gridProgram.grids.map((g, i) => (
            <GridRungEditor
              key={g.id}
              index={i}
              grid={g}
              activeTool={activeTool}
              addressOptions={addressOptions}
              numericOptions={numericOptions}
              addressTaken={(address, row, col) => addressTakenFor(i, col === COIL_COLUMN)(address, row)}
              customVariables={pool.customVariables}
              flow={evalGridFlow(g, grid.inputs, grid.memory, grid.analogInputs)}
              selectedCell={selectedCell && selectedCell.rungIndex === i ? selectedCell : null}
              onSelectCell={(row, col) => setSelectedCell({ rungIndex: i, row, col })}
              onPlaceNode={(row, col, node: GridNode) => {
                grid.placeNode(i, row, col, node);
                // UX/UI refinement Task 2 "No-Spam Drop": a click-placed block reverts the cursor to Select/Pointer mode immediately (same as pressing Escape), so the very next click can't accidentally drop a second block. F5-F10's own placeAtSelected deliberately does NOT do this - a keyboard user pressing the same key repeatedly to fill several selected cells in a row is intentional, unlike mouse/touch click-spam.
                setActiveTool(null);
              }}
              onRemoveNode={(row, col) => grid.removeNode(i, row, col)}
              onUpdateAddress={(row, col, address) => grid.updateNode(i, row, col, { address: address || null })}
              onUpdateVariant={(row, col, variant) => grid.updateNode(i, row, col, { variant })}
              onUpdatePreset={(row, col, preset) => grid.updateNode(i, row, col, { preset })}
              onUpdateComparison={(row, col, patch) => grid.updateNode(i, row, col, patch)}
              onToggleHorizontalWire={(row, col) => grid.toggleHorizontalWire(i, row, col)}
              onToggleVerticalWire={(row, col) => grid.toggleVerticalWire(i, row, col)}
              onPortDragStart={(row, col, x, y) => handlePortDragStart(i, row, col, x, y)}
              onBlockDragStart={(row, col, x, y) => handleBlockDragStart(i, row, col, x, y)}
              consumeDragSuppression={consumeDragSuppression}
              pendingTapPort={pendingPortTap}
              onCellContextMenu={(row, col, x, y) => handleCellContextMenu(i, row, col, x, y)}
              onInsertRow={(afterRow) => grid.insertRow(i, afterRow)}
              onDeleteRow={(row) => grid.deleteRow(i, row)}
              onDeleteRung={() => grid.removeRung(i)}
            />
          ))}
        </div>
      </GridCanvas>

      {/*
        UX/UI fix: rendered AFTER GridCanvas in tree order, not before -
        GridCanvas's zoomed content div uses `transform`, which per spec
        implicitly creates its own z-index:0 stacking context even without
        an explicit `position`. Placed earlier in the DOM this overlay lost
        the z-index:0-vs-z-index:0 tiebreak (tree order) against that
        transformed content and painted invisibly underneath every cell -
        it was computing the correct line segments the whole time, they
        just never made it onto the screen. Explicit z-10 is a second,
        redundant safety margin on top of the tree-order fix.
      */}
      <GridWiringOverlay
        gridProgram={grid.gridProgram}
        onToggleHorizontalWire={(rungIndex, row, col) => grid.toggleHorizontalWire(rungIndex, row, col)}
        onToggleVerticalWire={(rungIndex, row, col) => grid.toggleVerticalWire(rungIndex, row, col)}
      />

      {grid.gridProgram.grids.length < MAX_GRID_RUNGS && (
        <button
          type="button"
          onClick={grid.addRung}
          className="h-10 w-fit rounded-md border border-dashed border-zinc-400 px-3 text-sm font-medium text-zinc-600 hover:border-blue-500 hover:text-blue-600 dark:text-zinc-400"
        >
          + Add Rung
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={step}
          title="ประมวลผล PLC หนึ่งรอบสแกน (1 scan cycle) เท่านั้นแล้วหยุด เหมาะสำหรับตรวจสอบไทม์เมอร์/เคาน์เตอร์หรือวงจร Latch ทีละขั้นตอน"
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          Step
        </button>
        <button
          type="button"
          onClick={grid.toggleRunning}
          title={
            grid.running
              ? "หยุดการสแกนอัตโนมัติ เอาต์พุตที่ไม่ได้ล็อค (Coil ธรรมดา) จะดับทันที ส่วนที่ Set/Latch ไว้จะยังค้างอยู่"
              : "เริ่มสแกนอัตโนมัติต่อเนื่อง (10 ครั้ง/วินาที) จนกว่าจะกด Stop"
          }
          className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
            grid.running ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {grid.running ? "Stop" : "Run"}
        </button>
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span
            className={`h-2 w-2 rounded-full ${grid.running ? "animate-pulse bg-green-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
          />
          {grid.running ? "กำลังสแกน (Running)" : "หยุด (Stopped)"}
        </span>
        <button
          type="button"
          onClick={reset}
          title="ล้างค่าทั้งหมดกลับสู่สถานะเริ่มต้น: อินพุต, เอาต์พุต, ไทม์เมอร์ และเคาน์เตอร์"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Reset
        </button>
      </div>

      <IoPanel
        inputs={grid.inputs}
        memory={grid.memory}
        onToggleInput={toggleInput}
        onSetInputValue={setInputValue}
        customVariables={pool.customVariables}
        getSwitchType={pool.getSwitchType}
        onSetSwitchType={pool.setSwitchType}
      />

      <AnalogInputPanel addresses={analogAddresses} values={grid.analogInputs} onChange={setAnalogInput} />
        </>
      )}

      {/*
        GX Works UX overhaul Task 1: the drag-to-connect rubber-band preview.
        Rendered `fixed` at the viewport level (outside GridCanvas's
        zoomed/panned subtree) and driven purely by client coordinates from
        the pointer events, so it stays correct regardless of the canvas's
        current zoom/scroll - no transform math needed here at all. The
        actual wire is auto-routed as an orthogonal Manhattan path only once
        the drag is dropped on a valid port (see connectPorts); this line is
        just a straight guide while dragging.
      */}
      {/*
        UX/UI fix: this now covers TWO cases with one shared line - an
        in-progress drag (portDragSource/portDragPointer) and an armed
        two-tap connection being hovered by a mouse/trackpad
        (pendingPortTap/tapHoverPointer). Without the second case, a short
        drag that stayed under PORT_TAP_THRESHOLD_PX and got read as a tap
        showed nothing but a small pulsing dot on the armed port - which is
        exactly what made a real connection attempt look like it had done
        nothing. The green ring marks whatever port is currently under the
        cursor as a valid drop target, so it's clear where a release will
        land before you actually let go.
      */}
      {((portDragSource && portDragPointer) || (pendingPortTap && tapHoverPointer)) && (() => {
        const origin = portDragSource ?? pendingPortTap!;
        const pointer = portDragSource ? portDragPointer! : tapHoverPointer!;
        return (
          <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full">
            <line x1={origin.startX} y1={origin.startY} x2={pointer.x} y2={pointer.y} stroke="#2563eb" strokeWidth={3} strokeLinecap="round" />
            <circle cx={origin.startX} cy={origin.startY} r={5} fill="#2563eb" />
            <circle cx={pointer.x} cy={pointer.y} r={5} fill="#2563eb" />
            {dragHoverPoint && <circle cx={dragHoverPoint.x} cy={dragHoverPoint.y} r={13} fill="none" stroke="#22c55e" strokeWidth={3} className="animate-pulse" />}
          </svg>
        );
      })()}

      {/* UX/UI fix: a brief "Connected"/"Cannot connect" pill at the drop point after every connection attempt (drag release or completed two-tap) - connectPorts otherwise succeeds or fails in total silence, which is why it was impossible to tell whether a drag had actually registered. Self-dismisses after 900ms (see the connectionFeedback effect above). */}
      {connectionFeedback && (
        <div
          className={`pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-10 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-lg ${
            connectionFeedback.success ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ left: connectionFeedback.x, top: connectionFeedback.y }}
        >
          {connectionFeedback.success ? "✓ เชื่อมต่อแล้ว (Connected)" : "✗ เชื่อมต่อไม่ได้ (Cannot connect)"}
        </div>
      )}

      {/*
        UX/UI refinement Task 2: the drag-to-move preview - a small floating
        badge that follows the pointer once movement clears the threshold
        (see BLOCK_DRAG_THRESHOLD_PX), so it's visually obvious a move is in
        progress rather than a plain click. Purely cosmetic - moveNode
        itself silently no-ops on an invalid drop (occupied/wrong-column/out
        of range cell), same "fail quietly" contract as connectPorts.
      */}
      {blockDragSource && blockDragPointer && hasDraggedBlockRef.current && (
        <div
          className="pointer-events-none fixed z-50 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-100/90 text-xs font-medium text-blue-700 shadow-lg dark:bg-blue-950/90 dark:text-blue-300"
          style={{ left: blockDragPointer.x, top: blockDragPointer.y }}
        >
          ↕
        </div>
      )}

      {/* UX/UI refinement Task 5: the right-click quick-delete context menu (desktop mouse) - a small floating confirm button at the click position rather than an instant delete, so a stray right-click can't silently destroy work. */}
      {contextMenu && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            grid.removeNode(contextMenu.rungIndex, contextMenu.row, contextMenu.col);
            setContextMenu(null);
          }}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-red-700"
        >
          🗑 Delete
        </button>
      )}
    </div>
  );
}
