import type { ComparisonOperand, ComparisonOperator, ContactType, CounterVariant, TimerVariant } from "./types";

/**
 * Industrial-grade grid editor (GX Works3 / TIA Portal style) data model.
 * Lives alongside the existing Rung/Branch/Output model in types.ts - this
 * task only introduces the schema and lossless converters to/from the
 * legacy shape (see grid-adapter.ts). Nothing in the live editor, engine,
 * or grading path reads this yet; that's Tasks 2 and 3.
 */

/** An instruction-column node - a contact or comparison block. Never appears in the coil column. */
export type GridInstructionNode =
  | { kind: "CONTACT"; type: ContactType; address: string | null }
  | { kind: "COMPARE"; operator: ComparisonOperator; sourceA: string | null; sourceB: ComparisonOperand };

/** A coil-column node - mirrors the legacy Output union exactly, one-to-one. */
export type GridCoilNode =
  | { kind: "COIL"; address: string | null }
  | { kind: "SET"; address: string | null }
  | { kind: "RESET"; address: string | null }
  | { kind: "TIMER"; variant: TimerVariant; address: string | null; preset: number }
  | { kind: "COUNTER"; variant: CounterVariant; address: string | null; preset: number };

export type GridNode = GridInstructionNode | GridCoilNode;

const COIL_NODE_KINDS = new Set(["COIL", "SET", "RESET", "TIMER", "COUNTER"]);

export function isCoilNode(node: GridNode | null): node is GridCoilNode {
  return node !== null && COIL_NODE_KINDS.has(node.kind);
}

export function isGridInstructionNode(node: GridNode | null): node is GridInstructionNode {
  return node !== null && (node.kind === "CONTACT" || node.kind === "COMPARE");
}

/** GX Works3-style standard grid width: 10 instruction columns (0-9) + 1 coil column (10), always the rightmost. */
export const GRID_COLUMNS = 11;
export const COIL_COLUMN = GRID_COLUMNS - 1;

export type GridCell = {
  row: number;
  col: number;
  node: GridNode | null;
  /**
   * Wire segment state on each side of the cell - independent of `node`, so
   * a bare wire (no instruction) can still carry power through a cell, and
   * an instruction can sit in a cell with a broken/missing connection on one
   * side (open-circuit state, surfaced visually in Task 3).
   */
  connectLeft: boolean;
  connectRight: boolean;
  /** Vertical branch links to the row above/below - how OR/parallel branches and the shared right rail are represented. */
  connectTop: boolean;
  connectBottom: boolean;
};

export function createEmptyCell(row: number, col: number): GridCell {
  return { row, col, node: null, connectLeft: false, connectRight: false, connectTop: false, connectBottom: false };
}

/**
 * UX/UI fix: true for a cell that carries a wire through it - occupied or
 * not. Used to let an otherwise-empty pass-through cell act as a mid-wire
 * tap/junction point for a new connection (see GridCellView's center
 * PortDot and connectPorts's relaxed endpoint check in use-ladder-grid.ts) -
 * previously a connection could only start or end on a placed instruction,
 * so branching a new wire off an existing run required first placing (and
 * later removing) a dummy contact just to get a port to grab.
 */
export function cellHasWire(cell: GridCell): boolean {
  return cell.connectLeft || cell.connectRight || cell.connectTop || cell.connectBottom;
}

export type LadderGrid = {
  id: string;
  rowCount: number;
  /** cells[row][col] - always a full rowCount x GRID_COLUMNS dense matrix, never sparse. */
  cells: GridCell[][];
};

export function createEmptyGridRows(rowCount: number): GridCell[][] {
  const cells: GridCell[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < GRID_COLUMNS; c++) row.push(createEmptyCell(r, c));
    cells.push(row);
  }
  return cells;
}

export function createEmptyGrid(id: string, rowCount = 1): LadderGrid {
  return { id, rowCount, cells: createEmptyGridRows(rowCount) };
}

export type GridProgram = {
  grids: LadderGrid[];
};

export function createEmptyGridProgram(): GridProgram {
  return { grids: [createEmptyGrid(crypto.randomUUID())] };
}
