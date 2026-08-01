import { evalCell } from "@/lib/ladder/engine";
import { compileGridProgram, evalLogicNode, type CompiledRung, type LogicNode } from "@/lib/ladder/iec-compiler";
import type { LadderGrid } from "@/lib/ladder/grid-types";
import { isComparisonBlock, type AnalogInputs, type BranchCell, type Inputs, type Output, type SimMemory } from "@/lib/ladder/types";

const KIND_LABEL: Record<Output["kind"], string> = {
  COIL: "COIL",
  SET: "SET",
  RESET: "RESET",
  TIMER: "TMR",
  COUNTER: "CTR",
};

const OPERATOR_LABEL: Record<string, string> = { ">": ">", "<": "<", "==": "=", ">=": "≥", "<=": "≤" };

function cellLabel(cell: BranchCell): string {
  if (isComparisonBlock(cell)) {
    const b = cell.sourceB.kind === "constant" ? String(cell.sourceB.value) : cell.sourceB.address;
    return `${cell.sourceA ?? "?"} ${OPERATOR_LABEL[cell.operator]} ${b}`;
  }
  return `${cell.type === "NC" ? "NOT " : ""}${cell.address ?? "?"}`;
}

function cellIsUnassigned(cell: BranchCell): boolean {
  return isComparisonBlock(cell) ? !cell.sourceA : !cell.address;
}

/**
 * UX/UI refinement Task 4: recursively renders one node of the compiled
 * IEC 61131-3 AST (iec-compiler.ts) as a nested IEC logic gate - AND/OR
 * composites are bordered, labeled boxes containing their own child gates
 * (laid out horizontally for AND/series, vertically for OR/parallel,
 * mirroring how those two concepts already read on the ladder grid itself),
 * with NOT folded into the contact's own label (a "NOT X1" term) rather
 * than a separate gate shape, same convention the flat FbdView.tsx already
 * established. Every gate, not just leaf contacts, gets its own live
 * energized highlight (evalLogicNode), which the old flat renderer could
 * never show since it only evaluated the whole rung as a single boolean.
 */
function GateNode({
  node,
  inputs,
  memory,
  analogInputs,
}: {
  node: LogicNode;
  inputs: Inputs;
  memory: SimMemory;
  analogInputs: AnalogInputs;
}) {
  if (node.kind === "CONST") {
    return (
      <div className="rounded border border-zinc-300 px-2 py-1 text-center font-mono text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {node.value ? "TRUE" : "FALSE"}
      </div>
    );
  }

  if (node.kind === "TERM") {
    const cell = node.cell;
    const energized = evalCell(cell, inputs, memory, analogInputs);
    const color = cellIsUnassigned(cell)
      ? "border-red-400 text-red-500"
      : energized
        ? "border-green-500 text-green-600 dark:text-green-400"
        : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400";
    return <div className={`rounded border px-2 py-1 text-center font-mono text-[11px] ${color}`}>{cellLabel(cell)}</div>;
  }

  const isAnd = node.kind === "AND";
  const energized = evalLogicNode(node, inputs, memory, analogInputs);
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border-2 p-1.5 ${
        energized ? "border-green-500 bg-green-50/50 dark:bg-green-950/20" : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      <span
        className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-bold ${
          energized ? "bg-green-500 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        }`}
      >
        {isAnd ? "AND" : "OR"}
      </span>
      <div className={`flex gap-1.5 ${isAnd ? "flex-row items-center" : "flex-col"}`}>
        {node.terms.map((t, i) => (
          <GateNode key={i} node={t} inputs={inputs} memory={memory} analogInputs={analogInputs} />
        ))}
      </div>
    </div>
  );
}

function RungGates({
  rung,
  index,
  inputs,
  memory,
  analogInputs,
}: {
  rung: CompiledRung;
  index: number;
  inputs: Inputs;
  memory: SimMemory;
  analogInputs: AnalogInputs;
}) {
  const energized = evalLogicNode(rung.logic, inputs, memory, analogInputs);
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1">
      <span className="w-6 shrink-0 text-xs text-zinc-400">{index}</span>
      <GateNode node={rung.logic} inputs={inputs} memory={memory} analogInputs={analogInputs} />
      <span className="shrink-0 text-zinc-400">&rarr;</span>
      {rung.outputs.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {rung.outputs.map((output, oi) => (
            <div
              key={oi}
              className={`shrink-0 rounded border-2 px-3 py-1.5 text-center font-mono text-[11px] ${
                energized
                  ? "border-green-500 text-green-600 dark:text-green-400"
                  : "border-zinc-400 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
              }`}
            >
              {KIND_LABEL[output.kind]}
              <br />
              {output.address ?? "?"}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-[11px] text-zinc-400">(no output)</span>
      )}
    </div>
  );
}

/**
 * UX/UI refinement Task 4: the Grid Editor's own FBD view, compiled from the
 * grid's real wire topology (iec-compiler.ts) instead of the lossy flat
 * gridToRung conversion the rest of the app still uses for
 * grading/round-tripping - see iec-compiler.ts's own doc comment for why
 * that conversion silently breaks Self-Hold circuits. Kept as a separate
 * component from the shared FbdView.tsx rather than generalizing that one,
 * since FbdView's flat two-level layout has no way to render an arbitrarily
 * nested AST at all.
 */
export default function GridFbdView({
  grids,
  inputs,
  memory,
  analogInputs = {},
}: {
  grids: LadderGrid[];
  inputs: Inputs;
  memory: SimMemory;
  analogInputs?: AnalogInputs;
}) {
  const compiled = compileGridProgram(grids);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Read-only view compiled from the grid&apos;s actual wiring above. Series contacts feed an AND, parallel paths feed an
        OR, correctly nested even when a parallel group shares a later condition (e.g. Self-Hold) - each gate glows when it is
        itself conducting.
      </p>
      {compiled.map((rung, i) => (
        <RungGates key={rung.id} rung={rung} index={i} inputs={inputs} memory={memory} analogInputs={analogInputs} />
      ))}
    </div>
  );
}
