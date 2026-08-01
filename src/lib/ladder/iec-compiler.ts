import { evalCell } from "./engine";
import { cellExpr, outputStatement } from "./render-st";
import {
  COIL_COLUMN,
  GRID_COLUMNS,
  isCoilNode,
  type GridCell,
  type LadderGrid,
} from "./grid-types";
import { gridNodeToOutput } from "./grid-adapter";
import { isComparisonBlock, type AnalogInputs, type BranchCell, type Inputs, type Output, type SimMemory } from "./types";

/**
 * UX/UI refinement Task 4: the AST Compiler ("useIecCompiler" in the task
 * brief - a pure module rather than a hook, since compiling a grid into
 * logic has no state of its own). Fixes the real bug behind "converting
 * parallel branches (OR logic / Self-Holding) to FBD and ST produces
 * incorrect syntax": grid-adapter.ts's gridToRung (used everywhere else -
 * grading, round-tripping) reads each ROW as an independent AND-chain and
 * throws away the grid's actual wire topology, so a Self-Hold circuit built
 * with wrapWithSelfHold (use-ladder-grid.ts) - which deliberately shares one
 * trailing Stop contact across two parallel rows via a vertical tie - loses
 * that shared Stop contact entirely once flattened: the holding branch comes
 * out as bare `Y0` with no Stop condition at all, a real correctness bug,
 * not just a display quirk. This module reads the grid's real wire graph
 * directly instead, and factors the result into a proper nested AND/OR tree
 * (not just a flat sum-of-products), so `(X0 OR Y0) AND NOT X1` renders as
 * written instead of expanding to `(X0 AND NOT X1) OR (Y0 AND NOT X1)`.
 */

export type LogicNode =
  | { kind: "TERM"; cell: BranchCell }
  | { kind: "AND"; terms: LogicNode[] }
  | { kind: "OR"; terms: LogicNode[] }
  | { kind: "CONST"; value: boolean };

export function termNode(cell: BranchCell): LogicNode {
  return { kind: "TERM", cell };
}

function cellsEqual(a: BranchCell, b: BranchCell): boolean {
  const aCompare = isComparisonBlock(a);
  const bCompare = isComparisonBlock(b);
  if (aCompare !== bCompare) return false;
  if (aCompare && bCompare) {
    if (a.operator !== b.operator || a.sourceA !== b.sourceA || a.sourceB.kind !== b.sourceB.kind) return false;
    return a.sourceB.kind === "constant"
      ? a.sourceB.value === (b.sourceB as { kind: "constant"; value: number }).value
      : a.sourceB.address === (b.sourceB as { kind: "register"; address: string }).address;
  }
  return !aCompare && !bCompare && a.type === b.type && a.address === b.address;
}

/**
 * Step 1 of the AST reduction: enumerates every left-rail-to-coil-column
 * path through the grid's actual wire graph (mirrors grid-engine.ts's
 * evalGridFlow BFS, but collects the ordered contacts seen along each path
 * instead of evaluating them against live inputs - this is a structural,
 * symbolic walk, so a contact is always included as a term regardless of
 * its own live state). `visited` is per-path (reset for each new starting
 * row) purely to guard against revisiting the same cell within one path -
 * the coil-column's vertical ties between rows form a simple chain, not a
 * cycle, but the guard is cheap insurance against any hand-wired loop.
 */
function enumeratePaths(grid: LadderGrid): BranchCell[][] {
  const paths: BranchCell[][] = [];
  const rows = grid.rowCount;
  const cols = GRID_COLUMNS;

  function cellTerm(cell: GridCell): BranchCell | null {
    const node = cell.node;
    if (!node || isCoilNode(node)) return null;
    if (node.kind === "COMPARE") {
      return { kind: "COMPARE", operator: node.operator, sourceA: node.sourceA, sourceB: node.sourceB };
    }
    return { type: node.type, address: node.address };
  }

  function walk(r: number, c: number, visited: Set<string>, termsSoFar: BranchCell[]) {
    const key = `${r},${c}`;
    if (visited.has(key)) return;
    const nextVisited = new Set(visited);
    nextVisited.add(key);

    const cell = grid.cells[r][c];
    const term = cellTerm(cell);
    const nextTerms = term ? [...termsSoFar, term] : termsSoFar;

    if (c === COIL_COLUMN) {
      paths.push(nextTerms);
      return; // the coil column is the terminal sink - nothing meaningful continues past it
    }

    if (cell.connectRight && c + 1 < cols) walk(r, c + 1, nextVisited, nextTerms);
    if (cell.connectLeft && c - 1 >= 0) walk(r, c - 1, nextVisited, nextTerms);
    if (cell.connectBottom && r + 1 < rows) walk(r + 1, c, nextVisited, nextTerms);
    if (cell.connectTop && r - 1 >= 0) walk(r - 1, c, nextVisited, nextTerms);
  }

  for (let r = 0; r < rows; r++) {
    if (grid.cells[r][0]?.connectLeft) walk(r, 0, new Set(), []);
  }

  return paths;
}

function buildAndChain(terms: BranchCell[]): LogicNode {
  if (terms.length === 0) return { kind: "CONST", value: true }; // a bare wire with no contacts always conducts
  if (terms.length === 1) return termNode(terms[0]);
  return { kind: "AND", terms: terms.map(termNode) };
}

function mergeAnd(a: LogicNode, b: LogicNode): LogicNode {
  const terms: LogicNode[] = [];
  terms.push(...(a.kind === "AND" ? a.terms : [a]));
  terms.push(...(b.kind === "AND" ? b.terms : [b]));
  return terms.length === 1 ? terms[0] : { kind: "AND", terms };
}

/**
 * Step 2 of the AST reduction: recursively factors a flat list of AND-chain
 * paths into a nested tree - a common LEADING term across every path
 * factors out as `term AND (rest)`, a common TRAILING term factors out as
 * `(rest) AND term` (the shape a Self-Hold circuit needs - every path
 * shares its trailing Stop contact), and either check recurses until no
 * more common factor exists, at which point the remaining paths become a
 * flat `OR` of their own AND-chains. This is a practical, not exhaustive,
 * factoring: paths that share a factor with only SOME siblings (not all)
 * fall through to the flat OR fallback rather than attempting full
 * Quine-McCluskey-style optimal grouping - out of scope, and unnecessary
 * for the two cases this was written to fix (plain OR/parallel logic, and
 * Self-Holding), both of which have an all-paths-shared factor by
 * construction.
 */
export function factorPaths(paths: BranchCell[][]): LogicNode {
  if (paths.length === 0) return { kind: "CONST", value: false };
  if (paths.some((p) => p.length === 0)) return { kind: "CONST", value: true }; // an unconditional path makes the whole OR always true
  if (paths.length === 1) return buildAndChain(paths[0]);

  const first = paths[0][0];
  if (paths.every((p) => cellsEqual(p[0], first))) {
    return mergeAnd(termNode(first), factorPaths(paths.map((p) => p.slice(1))));
  }

  const last = paths[0][paths[0].length - 1];
  if (paths.every((p) => cellsEqual(p[p.length - 1], last))) {
    return mergeAnd(factorPaths(paths.map((p) => p.slice(0, -1))), termNode(last));
  }

  return { kind: "OR", terms: paths.map(buildAndChain) };
}

/** Compiles one rung's grid into a single boolean AST - the shared energization condition every output on that rung is driven by (matches the legacy model's own "every output listens to the OR of every branch" semantics, just correctly nested instead of flattened). */
export function compileGridToLogic(grid: LadderGrid): LogicNode {
  return factorPaths(enumeratePaths(grid));
}

/** True for any node that itself is (or reduces to) a disjunction - used by the ST/FBD renderers to decide when a child needs parentheses under AND, where precedence would otherwise silently change the meaning. */
function isOrLike(node: LogicNode): boolean {
  return node.kind === "OR";
}

/**
 * Renders the AST as an IEC 61131-3 boolean expression. An OR nested inside
 * an AND is always parenthesized - required for correctness, since ST (like
 * ordinary boolean algebra) binds AND tighter than OR, so `X0 OR M0 AND NOT
 * X1` would silently parse as `X0 OR (M0 AND NOT X1)`, not the intended
 * `(X0 OR M0) AND NOT X1`. An AND nested inside an OR is also parenthesized,
 * matching the existing flat renderer's convention (render-st.ts) even
 * though precedence alone wouldn't strictly require it, purely for
 * consistent readability between the two renderers.
 */
export function logicNodeToST(node: LogicNode): string {
  switch (node.kind) {
    case "CONST":
      return node.value ? "TRUE" : "FALSE";
    case "TERM":
      return cellExpr(node.cell);
    case "AND":
      return node.terms.map((t) => (isOrLike(t) ? `(${logicNodeToST(t)})` : logicNodeToST(t))).join(" AND ");
    case "OR":
      return node.terms.map((t) => (t.kind === "AND" ? `(${logicNodeToST(t)})` : logicNodeToST(t))).join(" OR ");
  }
}

/** Symbolic evaluator for the AST against live simulation state - mirrors evalCell/evalBranch/evalRungEnergized (engine.ts) but for the nested tree, so both leaf contacts AND intermediate AND/OR gates can be highlighted live in the FBD gate-tree view. */
export function evalLogicNode(node: LogicNode, inputs: Inputs, memory: SimMemory, analogInputs: AnalogInputs = {}): boolean {
  switch (node.kind) {
    case "CONST":
      return node.value;
    case "TERM":
      return evalCell(node.cell, inputs, memory, analogInputs);
    case "AND":
      return node.terms.every((t) => evalLogicNode(t, inputs, memory, analogInputs));
    case "OR":
      return node.terms.some((t) => evalLogicNode(t, inputs, memory, analogInputs));
  }
}

export type CompiledRung = { id: string; logic: LogicNode; outputs: Output[] };

/** One compiled rung per grid, each with its own AST and its own output list (read straight off the coil column, same as gridToRung, since output extraction isn't where the topology-loss bug lives). */
export function compileGridProgram(grids: LadderGrid[]): CompiledRung[] {
  return grids.map((grid) => {
    const outputs: Output[] = [];
    for (let r = 0; r < grid.rowCount; r++) {
      const node = grid.cells[r][COIL_COLUMN].node;
      if (node && isCoilNode(node)) outputs.push(gridNodeToOutput(node));
    }
    return { id: grid.id, logic: compileGridToLogic(grid), outputs };
  });
}

/** Renders every rung's compiled logic as approximate IEC 61131-3 Structured Text, reusing the exact same per-output statement formatting (SET/RESET/TIMER/COUNTER semantics) as the flat renderer so the two can never drift apart. */
export function compiledProgramToStructuredText(rungs: CompiledRung[]): string {
  if (rungs.length === 0) return "(* empty program *)";

  const lines = rungs.map((rung, i) => {
    const condition = logicNodeToST(rung.logic);
    const stmt =
      rung.outputs.length > 0
        ? rung.outputs.map((o) => outputStatement(o, condition)).join("\n")
        : `(* rung ${i + 1}: no output *)`;
    return `// Rung ${i + 1}\n${stmt}`;
  });

  return lines.join("\n\n");
}
