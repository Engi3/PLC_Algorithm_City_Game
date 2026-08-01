import {
  COLS_PER_BRANCH,
  createEmptyBranch,
  isComparisonBlock,
  type Branch,
  type BranchCell,
  type LadderProgram,
  type Output,
  type Rung,
} from "./types";
import {
  COIL_COLUMN,
  GRID_COLUMNS,
  createEmptyCell,
  isCoilNode,
  type GridCell,
  type GridCoilNode,
  type GridNode,
  type GridProgram,
  type LadderGrid,
} from "./grid-types";

function branchCellToGridNode(cell: BranchCell | null): GridNode | null {
  if (!cell) return null;
  if (isComparisonBlock(cell)) {
    return { kind: "COMPARE", operator: cell.operator, sourceA: cell.sourceA, sourceB: cell.sourceB };
  }
  return { kind: "CONTACT", type: cell.type, address: cell.address };
}

function outputToGridNode(output: Output): GridCoilNode {
  switch (output.kind) {
    case "COIL":
      return { kind: "COIL", address: output.address };
    case "SET":
      return { kind: "SET", address: output.address };
    case "RESET":
      return { kind: "RESET", address: output.address };
    case "TIMER":
      return { kind: "TIMER", variant: output.variant, address: output.address, preset: output.preset };
    case "COUNTER":
      return { kind: "COUNTER", variant: output.variant, address: output.address, preset: output.preset };
  }
}

/**
 * Converts a legacy Rung into the new grid representation. Branch i maps to
 * row i's instruction columns (0..COLS_PER_BRANCH-1); output i maps to row
 * i's coil column (COIL_COLUMN) - extra rows are created if there are more
 * outputs than branches, matching how outputs already render stacked
 * vertically in the editor.
 *
 * Every populated row's coil-column cell is linked vertically
 * (connectTop/connectBottom) to every other populated row's coil-column
 * cell. This is required for fidelity, not cosmetic: in the legacy model
 * *every* output is driven by the OR of *all* branches (see
 * evalRungEnergized), not just the branch sharing its row number. Without
 * this vertical tie, a naive per-row graph read in Task 3 would wrongly
 * imply each coil only listens to its own row's contacts.
 */
export function rungToGrid(rung: Rung): LadderGrid {
  const rowCount = Math.max(rung.branches.length, rung.outputs.length, 1);
  const cells: GridCell[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < GRID_COLUMNS; c++) row.push(createEmptyCell(r, c));
    cells.push(row);
  }

  rung.branches.forEach((branch, r) => {
    let lastOccupiedCol = -1;
    let prevOccupied = false;
    branch.cells.forEach((cell, c) => {
      const node = branchCellToGridNode(cell);
      if (!node) return;
      const gridCell = cells[r][c];
      gridCell.node = node;
      gridCell.connectLeft = c === 0 || prevOccupied;
      gridCell.connectRight = true;
      prevOccupied = true;
      lastOccupiedCol = c;
    });
    // Extend the wire from the last placed contact through to the coil column.
    if (lastOccupiedCol >= 0) {
      for (let c = lastOccupiedCol + 1; c <= COIL_COLUMN; c++) {
        cells[r][c].connectLeft = true;
        cells[r][c].connectRight = c < COIL_COLUMN;
      }
    }
  });

  rung.outputs.forEach((output, r) => {
    cells[r][COIL_COLUMN].node = outputToGridNode(output);
    cells[r][COIL_COLUMN].connectLeft = true;
  });

  const populatedRows: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    const hasBranch = r < rung.branches.length && rung.branches[r].cells.some((c) => c !== null);
    const hasOutput = r < rung.outputs.length;
    if (hasBranch || hasOutput) populatedRows.push(r);
  }
  populatedRows.forEach((r, i) => {
    if (i > 0) cells[r][COIL_COLUMN].connectTop = true;
    if (i < populatedRows.length - 1) cells[r][COIL_COLUMN].connectBottom = true;
  });

  return { id: rung.id, rowCount, cells };
}

/** Old saved play_logs and level seed programs, converted so they render in the new grid workspace. */
export function programToGridProgram(program: LadderProgram): GridProgram {
  return { grids: program.rungs.map(rungToGrid) };
}

function gridNodeToBranchCell(node: GridNode | null): BranchCell | null {
  if (!node || isCoilNode(node)) return null;
  if (node.kind === "COMPARE") {
    return { kind: "COMPARE", operator: node.operator, sourceA: node.sourceA, sourceB: node.sourceB };
  }
  return { type: node.type, address: node.address };
}

export function gridNodeToOutput(node: GridCoilNode): Output {
  switch (node.kind) {
    case "COIL":
      return { kind: "COIL", address: node.address };
    case "SET":
      return { kind: "SET", address: node.address };
    case "RESET":
      return { kind: "RESET", address: node.address };
    case "TIMER":
      return { kind: "TIMER", variant: node.variant, address: node.address, preset: node.preset };
    case "COUNTER":
      return { kind: "COUNTER", variant: node.variant, address: node.address, preset: node.preset };
  }
}

/**
 * Converts a grid back into a legacy Rung, for grading/persistence until
 * Task 3 upgrades the engine to read grids natively. Faithful round-trip
 * for grids produced by `rungToGrid` (the only kind that exist until Task
 * 2 ships hand-drawn wiring). A row with more than COLS_PER_BRANCH
 * populated instruction cells can't fit the legacy Branch shape - that's a
 * real limitation of today's fixed-width engine, not a bug here, so it's
 * truncated with a loud warning rather than silently dropped.
 */
export function gridToRung(grid: LadderGrid): Rung {
  const branches: Branch[] = [];
  const outputs: Output[] = [];

  for (let r = 0; r < grid.rowCount; r++) {
    const row = grid.cells[r];
    const instructionNodes = row.slice(0, COIL_COLUMN).map((c) => c.node);
    const occupiedCols = instructionNodes
      .map((node, i) => (node ? i : -1))
      .filter((i) => i >= 0);

    if (occupiedCols.length > 0) {
      if (occupiedCols.length > COLS_PER_BRANCH || Math.max(...occupiedCols) >= COLS_PER_BRANCH) {
        console.warn(
          `gridToRung: row ${r} of grid ${grid.id} uses more than the legacy engine's ${COLS_PER_BRANCH} series columns - extra contacts will be dropped until Task 3's engine upgrade lands.`
        );
      }
      const branch = createEmptyBranch();
      for (let c = 0; c < COLS_PER_BRANCH; c++) {
        branch.cells[c] = gridNodeToBranchCell(row[c]?.node ?? null);
      }
      branches.push(branch);
    }

    const coilNode = row[COIL_COLUMN].node;
    if (coilNode && isCoilNode(coilNode)) {
      outputs.push(gridNodeToOutput(coilNode));
    }
  }

  return {
    id: grid.id,
    branches: branches.length > 0 ? branches : [createEmptyBranch()],
    outputs,
  };
}

export function gridProgramToProgram(gridProgram: GridProgram): LadderProgram {
  return { rungs: gridProgram.grids.map(gridToRung) };
}
