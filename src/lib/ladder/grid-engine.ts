import { applyOutputWrite, evalComparison, evalContact } from "./engine";
import { gridNodeToOutput } from "./grid-adapter";
import {
  COIL_COLUMN,
  GRID_COLUMNS,
  isCoilNode,
  type GridInstructionNode,
  type GridProgram,
  type LadderGrid,
} from "./grid-types";
import type { AnalogInputs, Inputs, SimMemory } from "./types";

function evalGridInstructionNode(
  node: GridInstructionNode,
  inputs: Inputs,
  memory: SimMemory,
  analogInputs: AnalogInputs
): boolean {
  if (node.kind === "CONTACT") {
    return evalContact({ type: node.type, address: node.address }, inputs, memory);
  }
  return evalComparison(
    { kind: "COMPARE", operator: node.operator, sourceA: node.sourceA, sourceB: node.sourceB },
    memory,
    analogInputs
  );
}

export type GridCellFlow = {
  /** Power reaches this cell from the rail or some connected neighbor - true even if the cell's own contact then blocks it from going further. */
  powered: boolean;
  /** powered AND (no node, or the node's own state is true/coil) - whether current actually continues past this cell. */
  conducts: boolean;
};

export type GridFlowResult = GridCellFlow[][];

/**
 * Task 3: multi-path continuity scanner. Undirected BFS flood-fill seeded
 * from every left-rail-fed cell (col 0 with connectLeft=true), following
 * wired edges in any of the 4 directions, gated at each contact/comparison
 * node by its own live state. This is graph reachability, not a single
 * left-to-right sweep - "if any valid path of connected wires and
 * TRUE-state contacts reaches a coil, that coil must energize" only holds
 * in general (arbitrary hand-wired branches, not just the canonical
 * series/parallel shapes the legacy engine assumes) if traversal can move
 * in every direction a wire actually runs.
 *
 * Coil-column cells belonging to the same rung end up vertically tied
 * together by the grid adapter (see grid-adapter.ts), so a branch that
 * energizes its own row's coil cell also naturally floods into every other
 * coil on the shared right rail - reproducing "every output shares the OR
 * of all branches" without any special-case logic here.
 */
export function evalGridFlow(
  grid: LadderGrid,
  inputs: Inputs,
  memory: SimMemory,
  analogInputs: AnalogInputs = {}
): GridFlowResult {
  const rows = grid.rowCount;
  const cols = GRID_COLUMNS;
  const cells: GridCellFlow[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ powered: false, conducts: false }))
  );
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: [number, number][] = [];

  for (let r = 0; r < rows; r++) {
    if (grid.cells[r][0]?.connectLeft) queue.push([r, 0]);
  }

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (visited[r][c]) continue;
    visited[r][c] = true;

    const gridCell = grid.cells[r][c];
    cells[r][c].powered = true;

    let conducts = true;
    const node = gridCell.node;
    if (node && !isCoilNode(node)) {
      conducts = evalGridInstructionNode(node, inputs, memory, analogInputs);
    }
    cells[r][c].conducts = conducts;

    if (!conducts) continue;

    if (gridCell.connectRight && c + 1 < cols && !visited[r][c + 1]) queue.push([r, c + 1]);
    if (gridCell.connectLeft && c - 1 >= 0 && !visited[r][c - 1]) queue.push([r, c - 1]);
    if (gridCell.connectBottom && r + 1 < rows && !visited[r + 1][c]) queue.push([r + 1, c]);
    if (gridCell.connectTop && r - 1 >= 0 && !visited[r - 1][c]) queue.push([r - 1, c]);
  }

  return cells;
}

/**
 * Runs one PLC scan over every rung's grid, top to bottom, threading
 * updated memory through exactly like the legacy runScan (so a later rung
 * sees an earlier rung's coil writes in the same scan). Coil-column cells
 * write memory via the same applyOutputWrite the legacy engine uses, so
 * TIMER/COUNTER/SET/RESET semantics can never drift between the two
 * editors.
 */
export function runGridScan(
  gridProgram: GridProgram,
  inputs: Inputs,
  prevMemory: SimMemory,
  options: { tick: boolean },
  analogInputs: AnalogInputs = {}
): { memory: SimMemory; flows: GridFlowResult[] } {
  const memory: SimMemory = {
    coils: { ...prevMemory.coils },
    timers: { ...prevMemory.timers },
    counters: { ...prevMemory.counters },
  };
  const flows: GridFlowResult[] = [];

  for (const grid of gridProgram.grids) {
    const flow = evalGridFlow(grid, inputs, memory, analogInputs);
    flows.push(flow);

    for (let r = 0; r < grid.rowCount; r++) {
      const node = grid.cells[r][COIL_COLUMN].node;
      if (!node || !isCoilNode(node)) continue;
      const output = gridNodeToOutput(node);
      applyOutputWrite(memory, output, flow[r][COIL_COLUMN].conducts, options.tick);
    }
  }

  return { memory, flows };
}
