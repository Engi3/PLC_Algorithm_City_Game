"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampAnalogValue,
  createEmptyMemory,
  type AnalogInputs,
  type Inputs,
  type SimMemory,
} from "./types";
import { evalGridFlow, runGridScan, type GridFlowResult } from "./grid-engine";
import {
  COIL_COLUMN,
  GRID_COLUMNS,
  cellHasWire,
  createEmptyGrid,
  createEmptyGridProgram,
  createEmptyGridRows,
  isCoilNode,
  type GridCell,
  type GridNode,
  type GridProgram,
} from "./grid-types";

export const MAX_GRID_RUNGS = 12;
export const MAX_ROWS_PER_RUNG = 6;

/** Task 4: RUN advances the scan loop at 10Hz, matching the classic editor's cadence. */
const TICK_MS = 100;

export type CellCoord = { row: number; col: number };

/**
 * GX Works-style UX overhaul, Task 1: the orthogonal (Manhattan) path a
 * drag-to-connect gesture routes between two ports - a single-elbow route,
 * same convention as most schematic/diagramming tools. `order` picks which
 * leg comes first: "h-first" runs horizontally along `from.row` then
 * vertically along `to.col`; "v-first" runs vertically along `from.col` then
 * horizontally along `to.row`. connectPorts tries both and uses whichever
 * one doesn't run through an already-occupied cell (see below) - a single
 * fixed order previously made OR-branch wiring direction-dependent: routing
 * horizontally through a row that already has other placed contacts on it
 * (e.g. dragging from a trunk row's coil back to a branch row's contact,
 * where the trunk row is fully occupied end to end) always collided with
 * one of them and silently failed to connect, even though the other
 * elbow order would have routed around it cleanly.
 */
export function computeManhattanPath(from: CellCoord, to: CellCoord, order: "h-first" | "v-first" = "h-first"): CellCoord[] {
  const path: CellCoord[] = [from];
  function stepCol(row: number, toCol: number, current: number) {
    const step = current < toCol ? 1 : -1;
    let c = current;
    while (c !== toCol) {
      c += step;
      path.push({ row, col: c });
    }
  }
  function stepRow(col: number, toRow: number, current: number) {
    const step = current < toRow ? 1 : -1;
    let r = current;
    while (r !== toRow) {
      r += step;
      path.push({ row: r, col });
    }
  }
  if (order === "h-first") {
    if (from.col !== to.col) stepCol(from.row, to.col, from.col);
    if (from.row !== to.row) stepRow(to.col, to.row, from.row);
  } else {
    if (from.row !== to.row) stepRow(from.col, to.row, from.row);
    if (from.col !== to.col) stepCol(to.row, to.col, from.col);
  }
  return path;
}

/**
 * GX Works UX overhaul, Task 2: fills every horizontal wire segment in
 * `row`, from the left power rail (col 0) through `uptoCol` inclusive, so a
 * freshly-placed instruction or coil is immediately live without a manual
 * wiring step. Only ever sets flags true (never clears any), so it's
 * additive and idempotent - safe to re-run on every placement regardless of
 * order, and it can never destroy a manual connection drawn via Task 1's
 * drag-to-connect or the Draw Line tool.
 *
 * Applies identically to every row, including OR-branch rows, matching the
 * legacy branch model already baked into rungToGrid: each branch
 * independently starts from an implicit power source at its own column 0,
 * not chained from the row above - the grid's vertical links exist only to
 * OR branches together and tie shared outputs, not to deliver horizontal
 * power, so this stays entirely in the "auto-HORIZONTAL-wiring" lane Task 2
 * owns, leaving vertical/branch semantics untouched for Task 3.
 */
export function autoWireRow(cells: GridCell[][], row: number, uptoCol: number): void {
  cells[row][0].connectLeft = true;
  for (let c = 0; c < uptoCol; c++) {
    cells[row][c].connectRight = true;
    cells[row][c + 1].connectLeft = true;
  }
}

/**
 * GX Works UX overhaul, Task 2: after a node is removed from `row`,
 * retracts only the horizontal wire tail that now dangles past the row's
 * last remaining occupied cell (nothing left there to power), or clears the
 * row's horizontal wiring entirely if it's now empty. Never touches
 * connectTop/connectBottom - vertical branch links are intentional topology
 * (Task 3's domain) and survive regardless of what happens to this row's
 * own horizontal span. A wire passing THROUGH an empty cell that still has
 * an occupied cell further along the row is left alone - removing a
 * contact doesn't sever power to whatever's still wired past it, only a
 * true dead end (nothing beyond it, anywhere) counts as orphaned.
 */
export function autoCleanupRow(cells: GridCell[][], row: number): void {
  let lastOccupied = -1;
  for (let c = 0; c < GRID_COLUMNS; c++) {
    if (cells[row][c].node) lastOccupied = c;
  }
  for (let c = lastOccupied + 1; c < GRID_COLUMNS; c++) {
    cells[row][c].connectLeft = false;
    cells[row][c].connectRight = false;
  }
  if (lastOccupied >= 0 && lastOccupied < GRID_COLUMNS - 1) {
    cells[row][lastOccupied].connectRight = false;
  }
}

/**
 * UX/UI fix: two placed instructions sitting directly next to each other in
 * the same row are always wired together, with no way to leave them
 * touching-but-disconnected. Without this, clicking GridWiringOverlay's "cut
 * this wire" hit-target on the segment between two already-placed blocks (or
 * toggling the same connectLeft/connectRight flag any other way) left two
 * blocks that visually sit side by side but have no power path between
 * them - and no straightforward way back short of a manual drag/two-tap
 * reconnect, easy to miss for anyone who didn't already know that gesture
 * existed. In a ladder rung, two adjacent occupied cells in the same row are
 * never meant to be independently severable anyway (that's not a
 * representable branch/interlock pattern, just a broken series contact), so
 * this is applied unconditionally on every edit rather than only at
 * placement time - it also self-heals any grid saved before this fix
 * existed the moment it's next touched.
 */
function forceAdjacentBlockWiring(cells: GridCell[][], rowCount: number): void {
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < GRID_COLUMNS - 1; c++) {
      if (cells[r][c].node && cells[r][c + 1].node) {
        cells[r][c].connectRight = true;
        cells[r][c + 1].connectLeft = true;
      }
    }
  }
}

function normalizeGridProgram(program: GridProgram): GridProgram {
  return {
    grids: program.grids.map((grid) => {
      const cells = grid.cells.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
      forceAdjacentBlockWiring(cells, grid.rowCount);
      return { ...grid, cells };
    }),
  };
}

/**
 * State management for the industrial grid editor (Task 2/3), mirroring
 * use-ladder-program.ts's shape but operating on the row/column grid model
 * from Task 1 instead of the fixed 4-cell branch model. Kept as a fully
 * separate hook rather than extending the legacy one, since the two data
 * shapes (and their edit operations - inserting a branch row has no
 * equivalent in the old model) are genuinely different. Task 3 adds live
 * simulation state (inputs/analogInputs/memory/running), scanned with
 * runGridScan instead of the legacy runScan.
 *
 * Task 7 (perf): every function below is a stable (`useCallback([])`)
 * identity that reads its inputs from refs mirroring the latest
 * gridProgram/inputs/memory/analogInputs, instead of closing over those
 * state variables directly - the same "ref-mirror" pattern
 * use-game-plc-bridge.ts already used correctly. Without this, every one of
 * these ~20 functions was a brand-new closure on every render (since
 * `memory` alone changes every single scan tick), which meant every
 * consumer - GridEditorSurface, GridRungEditor, all ~132-792 GridCellView
 * instances - received new callback props every tick and could never
 * actually skip a re-render even with React.memo added, because "new
 * function reference" always fails a shallow prop-equality check regardless
 * of whether the function's *behavior* changed. `flows` (the per-cell
 * power/conduct result runGridScan already computes) is now kept in state
 * too, so GridEditorSurface can read it directly instead of re-running
 * evalGridFlow from scratch per rung per render.
 */
export function useLadderGrid(initial?: GridProgram) {
  const [gridProgram, setGridProgram] = useState<GridProgram>(() => normalizeGridProgram(initial ?? createEmptyGridProgram()));
  const [inputs, setInputs] = useState<Inputs>({});
  const [analogInputs, setAnalogInputs] = useState<AnalogInputs>({});
  const [memory, setMemory] = useState<SimMemory>(() => createEmptyMemory());
  // Computed eagerly (not []) so the very first render already shows correct
  // per-cell power state (e.g. an NC contact conducting by default) instead
  // of an empty flash until the first edit/tick - matches what the old
  // inline `evalGridFlow` call in GridEditorSurface used to produce on that
  // same first render.
  const [flows, setFlows] = useState<GridFlowResult[]>(() => gridProgram.grids.map((g) => evalGridFlow(g, {}, createEmptyMemory(), {})));
  const [running, setRunning] = useState(false);

  // Mirrors of the latest state, read by every stable callback below instead
  // of closing over the state variables directly - updated every render
  // (not in an effect), same pattern use-game-plc-bridge.ts's runOneTick
  // already relies on.
  const gridProgramRef = useRef(gridProgram);
  const inputsRef = useRef(inputs);
  const analogInputsRef = useRef(analogInputs);
  const memoryRef = useRef(memory);
  gridProgramRef.current = gridProgram;
  inputsRef.current = inputs;
  analogInputsRef.current = analogInputs;
  memoryRef.current = memory;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setMemory((prevMemory) => {
        const result = runGridScan(gridProgramRef.current, inputsRef.current, prevMemory, { tick: true }, analogInputsRef.current);
        setFlows(result.flows);
        return result.memory;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
    // Only `running` needs to resubscribe the interval - gridProgram/inputs/
    // analogInputs are read fresh from refs every tick, so an edit made
    // mid-RUN no longer tears down and recreates the interval.
  }, [running]);

  /** Applies a program edit and immediately re-evaluates memory (tick: false), same as use-ladder-program's updateProgram. */
  const updateGridProgram = useCallback((updater: (prev: GridProgram) => GridProgram) => {
    const next = normalizeGridProgram(updater(gridProgramRef.current));
    const result = runGridScan(next, inputsRef.current, memoryRef.current, { tick: false }, analogInputsRef.current);
    setGridProgram(next);
    setMemory(result.memory);
    setFlows(result.flows);
  }, []);

  const addRung = useCallback(() => {
    updateGridProgram((prev) => {
      if (prev.grids.length >= MAX_GRID_RUNGS) return prev;
      return { grids: [...prev.grids, createEmptyGrid(crypto.randomUUID())] };
    });
  }, [updateGridProgram]);

  const removeRung = useCallback(
    (rungIndex: number) => {
      updateGridProgram((prev) => ({ grids: prev.grids.filter((_, i) => i !== rungIndex) }));
    },
    [updateGridProgram]
  );

  /** Inserts a new empty branch row directly below `afterRow` within a rung, for wiring a parallel/OR path. */
  const insertRow = useCallback(
    (rungIndex: number, afterRow: number) => {
      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex || grid.rowCount >= MAX_ROWS_PER_RUNG) return grid;
          const newRows = createEmptyGridRows(grid.rowCount + 1);
          // Copy rows before and after the insertion point, renumbering as we go.
          for (let r = 0; r <= afterRow; r++) {
            newRows[r] = grid.cells[r].map((c) => ({ ...c, row: r }));
          }
          for (let r = afterRow + 1; r < grid.rowCount; r++) {
            newRows[r + 1] = grid.cells[r].map((c) => ({ ...c, row: r + 1 }));
          }
          return { ...grid, rowCount: grid.rowCount + 1, cells: newRows };
        }),
      }));
    },
    [updateGridProgram]
  );

  const deleteRow = useCallback(
    (rungIndex: number, row: number) => {
      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex || grid.rowCount <= 1) return grid;
          const remaining = grid.cells.filter((_, r) => r !== row).map((rowCells, newR) => rowCells.map((c) => ({ ...c, row: newR })));
          return { ...grid, rowCount: grid.rowCount - 1, cells: remaining };
        }),
      }));
    },
    [updateGridProgram]
  );

  /**
   * GX Works UX overhaul Task 3 "Smart Latching": wraps the contact at
   * (row, 0) - the leftmost cell in its row, the classic Start-button
   * position - with a parallel Self-Holding/Interlock branch. Inserts a new
   * row directly below holding a fresh NO contact auto-addressed to this
   * rung's coil (the first one found with an address, if any), then ties it
   * back into column 1 of the original row so it correctly rejoins the same
   * power path as an OR-alternative to the wrapped contact, rather than an
   * independent series chain - the same split/merge vertical-tie topology
   * proven in Task 1's diamond test (tie at the column immediately AFTER
   * the wrapped contact, not at the contact's own column, since a cell only
   * propagates to a neighbor when it itself conducts - tying directly under
   * the wrapped contact would mean the branch only ever fires when the
   * original ALSO conducts, defeating the point of an OR alternative).
   * Only offered for col 0 (see GridLadderEditor's canSmartLatch) - a merge
   * point further right would need to reconnect around whatever else is in
   * the row, which isn't a well-defined "quick shortcut" in general; for
   * that, Task 1's drag-to-connect ports and this task's border-click
   * vertical toggle already cover the fully manual case.
   */
  const wrapWithSelfHold = useCallback(
    (rungIndex: number, row: number): boolean => {
      const grid = gridProgramRef.current.grids[rungIndex];
      if (!grid) return false;
      if (!grid.cells[row]?.[0]?.node) return false;
      if (grid.rowCount >= MAX_ROWS_PER_RUNG) return false;

      let holdAddress: string | null = null;
      for (let r = 0; r < grid.rowCount; r++) {
        const coilNode = grid.cells[r][COIL_COLUMN].node;
        if (coilNode && isCoilNode(coilNode) && coilNode.address) {
          holdAddress = coilNode.address;
          break;
        }
      }

      updateGridProgram((prev) => ({
        grids: prev.grids.map((g, gi) => {
          if (gi !== rungIndex) return g;

          const newRows: GridCell[][] = [];
          for (let r = 0; r <= row; r++) {
            newRows.push(g.cells[r].map((c) => ({ ...c, row: r })));
          }
          newRows.push(createEmptyGridRows(1)[0].map((c) => ({ ...c, row: row + 1 })));
          for (let r = row + 1; r < g.rowCount; r++) {
            newRows.push(g.cells[r].map((c) => ({ ...c, row: r + 1 })));
          }

          const newRow = row + 1;
          newRows[newRow][0] = {
            ...newRows[newRow][0],
            node: { kind: "CONTACT", type: "NO", address: holdAddress },
            connectLeft: true,
            connectRight: true,
          };
          // Merge tie one column past the wrapped contact, rejoining whatever the original row already continues with (more contacts, or straight to the coil).
          newRows[row][1] = { ...newRows[row][1], connectBottom: true };
          newRows[newRow][1] = { ...newRows[newRow][1], connectTop: true, connectLeft: true };

          return { ...g, rowCount: g.rowCount + 1, cells: newRows };
        }),
      }));
      return true;
    },
    [updateGridProgram]
  );

  /** GX Works UX overhaul Task 2: placing a node auto-wires the row from the rail through it (see autoWireRow) - no manual wiring step needed for the common straight-series case. */
  const placeNode = useCallback(
    (rungIndex: number, row: number, col: number, node: GridNode) => {
      // Instruction nodes only belong left of the coil column; coil-kind nodes only belong in it.
      if (col === COIL_COLUMN && !isCoilNode(node)) return;
      if (col !== COIL_COLUMN && isCoilNode(node)) return;

      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex) return grid;
          const cells = grid.cells.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
          cells[row][col].node = node;
          autoWireRow(cells, row, col);
          return { ...grid, cells };
        }),
      }));
    },
    [updateGridProgram]
  );

  /** GX Works UX overhaul Task 2: removing a node auto-retracts any horizontal wire tail left dangling with nothing beyond it (see autoCleanupRow). */
  const removeNode = useCallback(
    (rungIndex: number, row: number, col: number) => {
      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex) return grid;
          const cells = grid.cells.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
          cells[row][col].node = null;
          autoCleanupRow(cells, row);
          return { ...grid, cells };
        }),
      }));
    },
    [updateGridProgram]
  );

  /**
   * UX/UI refinement, Task 2: relocates an already-placed block to a
   * different empty, column-compatible cell (drag-to-move) - one atomic
   * update rather than a separate removeNode + placeNode pair, since those
   * each read `gridProgram` from the render closure directly (not a
   * functional setState updater); calling them back-to-back in the same
   * function would have the second call still see the pre-removal grid.
   * Reuses the same auto-wire/auto-cleanup helpers placeNode/removeNode use,
   * applied to a single shared `cells` matrix so a same-rung move sees its
   * own removal before the placement wiring runs. Rejects (no state change,
   * returns false) for a same-cell "move", a missing source node, an
   * occupied or out-of-range destination, or a column-kind mismatch (an
   * instruction can't be dropped into the coil column and vice versa) -
   * callers are expected to have already checked these via a plain read of
   * gridProgram before calling, same as connectPorts's own contract.
   */
  const moveNode = useCallback(
    (fromRungIndex: number, from: CellCoord, toRungIndex: number, to: CellCoord): boolean => {
      if (fromRungIndex === toRungIndex && from.row === to.row && from.col === to.col) return false;
      const sourceGrid = gridProgramRef.current.grids[fromRungIndex];
      const targetGrid = gridProgramRef.current.grids[toRungIndex];
      if (!sourceGrid || !targetGrid) return false;
      const node = sourceGrid.cells[from.row]?.[from.col]?.node;
      if (!node) return false;
      if (to.row < 0 || to.row >= targetGrid.rowCount || to.col < 0 || to.col >= GRID_COLUMNS) return false;
      if (targetGrid.cells[to.row][to.col].node) return false;
      if (isCoilNode(node) !== (to.col === COIL_COLUMN)) return false;

      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== fromRungIndex && gi !== toRungIndex) return grid;
          const cells = grid.cells.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
          if (gi === fromRungIndex) {
            cells[from.row][from.col].node = null;
            autoCleanupRow(cells, from.row);
          }
          if (gi === toRungIndex) {
            cells[to.row][to.col].node = node;
            autoWireRow(cells, to.row, to.col);
          }
          return { ...grid, cells };
        }),
      }));
      return true;
    },
    [updateGridProgram]
  );

  const updateNode = useCallback(
    (rungIndex: number, row: number, col: number, patch: Record<string, unknown>) => {
      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex) return grid;
          const cells = grid.cells.map((rowCells, r) => {
            if (r !== row) return rowCells;
            return rowCells.map((cell, c) => {
              const node = cell.node;
              if (c !== col || !node) return cell;
              const updatedNode: GridNode = { ...node, ...patch };
              return { ...cell, node: updatedNode };
            });
          });
          return { ...grid, cells };
        }),
      }));
    },
    [updateGridProgram]
  );

  /**
   * Toggles the horizontal wire segment feeding INTO (row, col) from its
   * left neighbor - `col` is the cell whose own connectLeft button was
   * clicked, matching how GridCellView/GridRungEditor invoke this (each
   * cell owns the wire segment rendered on its own left edge). col=0 has no
   * left neighbor to pair with, so it only ever toggles its own connectLeft.
   */
  const toggleHorizontalWire = useCallback(
    (rungIndex: number, row: number, col: number) => {
      if (col < 0 || col >= GRID_COLUMNS) return;
      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex) return grid;
          const next = !grid.cells[row][col].connectLeft;
          const cells = grid.cells.map((rowCells, r) => {
            if (r !== row) return rowCells;
            return rowCells.map((cell, c) => {
              if (c === col) return { ...cell, connectLeft: next };
              if (c === col - 1) return { ...cell, connectRight: next };
              return cell;
            });
          });
          return { ...grid, cells };
        }),
      }));
    },
    [updateGridProgram]
  );

  /** Toggles the vertical wire segment between (row, col) and (row+1, col) - how parallel/OR branch links are drawn. */
  const toggleVerticalWire = useCallback(
    (rungIndex: number, row: number, col: number) => {
      updateGridProgram((prev) => ({
        grids: prev.grids.map((grid, gi) => {
          if (gi !== rungIndex || row >= grid.rowCount - 1) return grid;
          const next = !grid.cells[row][col].connectBottom;
          const cells = grid.cells.map((rowCells, r) => {
            if (r === row) return rowCells.map((cell, c) => (c === col ? { ...cell, connectBottom: next } : cell));
            if (r === row + 1) return rowCells.map((cell, c) => (c === col ? { ...cell, connectTop: next } : cell));
            return rowCells;
          });
          return { ...grid, cells };
        }),
      }));
    },
    [updateGridProgram]
  );

  /**
   * GX Works UX overhaul, Task 1: connects two cells' ports with an
   * auto-routed orthogonal wire, instead of the old "toggle one segment at a
   * time" model. Rejects (no state change) if either endpoint can't act as a
   * connection point (see below), the endpoints are the same cell, either
   * coordinate is out of range, or any cell strictly between the two
   * endpoints is already occupied - a wire can't silently overlap another
   * instruction, it can only route through empty space.
   *
   * UX/UI fix: an endpoint no longer has to be an occupied cell (a placed
   * instruction) - an empty cell that already carries a wire through it
   * (cellHasWire) also qualifies, so a new branch can be tapped directly off
   * an existing run without first placing a throwaway contact just to get a
   * port to grab. A genuinely empty, unwired cell still can't act as an
   * endpoint - there's nothing there to connect to or from.
   */
  const connectPorts = useCallback(
    (rungIndex: number, from: CellCoord, to: CellCoord): boolean => {
      if (from.row === to.row && from.col === to.col) return false;
      const grid = gridProgramRef.current.grids[rungIndex];
      if (!grid) return false;
      if (from.row < 0 || from.row >= grid.rowCount || to.row < 0 || to.row >= grid.rowCount) return false;
      if (from.col < 0 || from.col >= GRID_COLUMNS || to.col < 0 || to.col >= GRID_COLUMNS) return false;
      const fromCell = grid.cells[from.row][from.col];
      const toCell = grid.cells[to.row][to.col];
      if (!(fromCell.node || cellHasWire(fromCell)) || !(toCell.node || cellHasWire(toCell))) return false;

      function pathIsClear(candidate: CellCoord[]): boolean {
        for (let i = 1; i < candidate.length - 1; i++) {
          if (grid.cells[candidate[i].row][candidate[i].col].node) return false;
        }
        return true;
      }
      // Try both elbow orders and use whichever one doesn't collide with an
      // already-placed block - see computeManhattanPath's comment for why a
      // single fixed order made OR-branch wiring direction-dependent.
      const hFirst = computeManhattanPath(from, to, "h-first");
      const vFirst = computeManhattanPath(from, to, "v-first");
      const path = pathIsClear(hFirst) ? hFirst : pathIsClear(vFirst) ? vFirst : null;
      if (!path) return false;

      updateGridProgram((prev) => ({
        grids: prev.grids.map((g, gi) => {
          if (gi !== rungIndex) return g;
          const cells = g.cells.map((row) => row.map((cell) => ({ ...cell })));
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            if (a.row === b.row) {
              const left = a.col < b.col ? a : b;
              const right = a.col < b.col ? b : a;
              cells[left.row][left.col].connectRight = true;
              cells[right.row][right.col].connectLeft = true;
            } else {
              const top = a.row < b.row ? a : b;
              const bottom = a.row < b.row ? b : a;
              cells[top.row][top.col].connectBottom = true;
              cells[bottom.row][bottom.col].connectTop = true;
            }
          }
          return { ...g, cells };
        }),
      }));
      return true;
    },
    [updateGridProgram]
  );

  const toggleInput = useCallback((address: string) => {
    const nextInputs = { ...inputsRef.current, [address]: !inputsRef.current[address] };
    const result = runGridScan(gridProgramRef.current, nextInputs, memoryRef.current, { tick: false }, analogInputsRef.current);
    setInputs(nextInputs);
    setMemory(result.memory);
    setFlows(result.flows);
  }, []);

  /** Sets an input to an explicit value, e.g. press/release for a momentary button (vs toggleInput's click-to-flip). */
  const setInputValue = useCallback((address: string, value: boolean) => {
    const nextInputs = { ...inputsRef.current, [address]: value };
    const result = runGridScan(gridProgramRef.current, nextInputs, memoryRef.current, { tick: false }, analogInputsRef.current);
    setInputs(nextInputs);
    setMemory(result.memory);
    setFlows(result.flows);
  }, []);

  /** Sets an AI0-AI15 analog value (clamped 0-32767) and re-evaluates immediately. */
  const setAnalogInput = useCallback((address: string, value: number) => {
    const nextAnalogInputs = { ...analogInputsRef.current, [address]: clampAnalogValue(value) };
    const result = runGridScan(gridProgramRef.current, inputsRef.current, memoryRef.current, { tick: false }, nextAnalogInputs);
    setAnalogInputs(nextAnalogInputs);
    setMemory(result.memory);
    setFlows(result.flows);
  }, []);

  const step = useCallback(() => {
    setMemory((prev) => {
      const result = runGridScan(gridProgramRef.current, inputsRef.current, prev, { tick: true }, analogInputsRef.current);
      setFlows(result.flows);
      return result.memory;
    });
  }, []);

  /**
   * Task 4's Stop behavior, ported from use-ladder-program's haltOutputs:
   * immediately drops plain COIL outputs and clears each TIMER's EN flag,
   * leaving timer/counter accumulators and SET-latched coils untouched.
   */
  const haltOutputs = useCallback(() => {
    setMemory((prev) => {
      const coils = { ...prev.coils };
      const timers = { ...prev.timers };
      for (const grid of gridProgramRef.current.grids) {
        for (let r = 0; r < grid.rowCount; r++) {
          const node = grid.cells[r][COIL_COLUMN].node;
          if (!node || !isCoilNode(node) || !node.address) continue;
          if (node.kind === "COIL") {
            coils[node.address] = false;
          } else if (node.kind === "TIMER" && timers[node.address]) {
            timers[node.address] = { ...timers[node.address], en: false };
          }
        }
      }
      return { ...prev, coils, timers };
    });
  }, []);

  /** RUN starts the scan loop; STOP halts it and de-energizes non-latched outputs (see haltOutputs). */
  const toggleRunning = useCallback(() => {
    setRunning((prevRunning) => {
      if (prevRunning) {
        haltOutputs();
        return false;
      }
      return true;
    });
  }, [haltOutputs]);

  const loadGridProgram = useCallback((next: GridProgram) => {
    const result = runGridScan(next, inputsRef.current, createEmptyMemory(), { tick: false }, analogInputsRef.current);
    setGridProgram(next);
    setMemory(result.memory);
    setFlows(result.flows);
  }, []);

  const reset = useCallback(() => {
    setInputs({});
    setAnalogInputs({});
    setMemory(createEmptyMemory());
    setFlows([]);
    setRunning(false);
  }, []);

  return {
    gridProgram,
    inputs,
    analogInputs,
    memory,
    flows,
    running,
    toggleRunning,
    toggleInput,
    setInputValue,
    setAnalogInput,
    step,
    addRung,
    removeRung,
    insertRow,
    deleteRow,
    wrapWithSelfHold,
    placeNode,
    removeNode,
    moveNode,
    updateNode,
    toggleHorizontalWire,
    toggleVerticalWire,
    connectPorts,
    loadGridProgram,
    reset,
  };
}

export type LadderGridApi = ReturnType<typeof useLadderGrid>;
