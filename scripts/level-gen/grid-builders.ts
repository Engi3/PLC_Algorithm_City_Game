/** Hand-building primitives for GridProgram fixtures - used by generate-efficiency.ts to construct and self-verify each level's reference solution against the real grading engine (evaluateGridLevel) before it's written to the output JSON. */
import { GRID_COLUMNS, COIL_COLUMN, type GridCell, type GridNode, type GridProgram, type LadderGrid } from "../../src/lib/ladder/grid-types";
import type { ComparisonOperand, ComparisonOperator } from "../../src/lib/ladder/types";

export function NO(address: string): GridNode {
  return { kind: "CONTACT", type: "NO", address };
}
export function NC(address: string): GridNode {
  return { kind: "CONTACT", type: "NC", address };
}
export function COIL(address: string): GridNode {
  return { kind: "COIL", address };
}
export function SET(address: string): GridNode {
  return { kind: "SET", address };
}
export function RESET(address: string): GridNode {
  return { kind: "RESET", address };
}
export function TON(address: string, preset: number): GridNode {
  return { kind: "TIMER", variant: "TON", address, preset };
}
export function TOF(address: string, preset: number): GridNode {
  return { kind: "TIMER", variant: "TOF", address, preset };
}
export function CTU(address: string, preset: number): GridNode {
  return { kind: "COUNTER", variant: "CTU", address, preset };
}
export function CTD(address: string, preset: number): GridNode {
  return { kind: "COUNTER", variant: "CTD", address, preset };
}
export function CMPCONST(operator: ComparisonOperator, sourceA: string, value: number): GridNode {
  const sourceB: ComparisonOperand = { kind: "constant", value };
  return { kind: "COMPARE", operator, sourceA, sourceB };
}
export function CMPREG(operator: ComparisonOperator, sourceA: string, address: string): GridNode {
  const sourceB: ComparisonOperand = { kind: "register", address };
  return { kind: "COMPARE", operator, sourceA, sourceB };
}

function emptyRow(rowIndex: number): GridCell[] {
  return Array.from({ length: GRID_COLUMNS }, (_, col) => ({
    row: rowIndex,
    col,
    node: null,
    connectLeft: false,
    connectRight: false,
    connectTop: false,
    connectBottom: false,
  }));
}

/** A bare multi-row grid with no nodes/wires - use place/wireH/feedLeftRail/tieVertical to build up any topology. */
export function grid(id: string, rowCount: number): LadderGrid {
  return { id, rowCount, cells: Array.from({ length: rowCount }, (_, r) => emptyRow(r)) };
}

export function place(g: LadderGrid, row: number, col: number, node: GridNode): void {
  g.cells[row][col].node = node;
}

/** Wires a continuous horizontal run from fromCol to toCol (inclusive) on one row. */
export function wireH(g: LadderGrid, row: number, fromCol: number, toCol: number): void {
  for (let c = fromCol; c < toCol; c++) {
    g.cells[row][c].connectRight = true;
    g.cells[row][c + 1].connectLeft = true;
  }
}

export function feedLeftRail(g: LadderGrid, row: number): void {
  g.cells[row][0].connectLeft = true;
}

/** Ties row `row` (top) to row `row + 1` (bottom) at column `col` - matches wrapWithSelfHold's real merge-tie pattern. */
export function tieVertical(g: LadderGrid, row: number, col: number): void {
  g.cells[row][col].connectBottom = true;
  g.cells[row + 1][col].connectTop = true;
}

/** Convenience: a single-row rung with instructions placed left-to-right from column 0, wired straight through to the coil column. */
export function seriesRung(id: string, instructions: GridNode[], coilNode: GridNode): LadderGrid {
  const g = grid(id, 1);
  instructions.forEach((node, i) => place(g, 0, i, node));
  place(g, 0, COIL_COLUMN, coilNode);
  feedLeftRail(g, 0);
  wireH(g, 0, 0, COIL_COLUMN);
  return g;
}

export function program(...grids: LadderGrid[]): GridProgram {
  return { grids };
}

let idCounter = 0;
export function nextId(): string {
  idCounter += 1;
  return `g${idCounter}`;
}
