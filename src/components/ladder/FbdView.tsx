import { Fragment } from "react";
import { evalCell, evalRungEnergized } from "@/lib/ladder/engine";
import { isComparisonBlock, type AnalogInputs, type BranchCell, type Inputs, type LadderProgram, type Output, type SimMemory } from "@/lib/ladder/types";

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

function ContactBox({ cell, energized }: { cell: BranchCell; energized: boolean }) {
  const color = cellIsUnassigned(cell)
    ? "border-red-400 text-red-500"
    : energized
      ? "border-green-500 text-green-600 dark:text-green-400"
      : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400";
  return (
    <div className={`rounded border px-2 py-1 text-center font-mono text-[11px] ${color}`}>
      {cellLabel(cell)}
    </div>
  );
}

export default function FbdView({
  program,
  inputs,
  memory,
  analogInputs = {},
}: {
  program: LadderProgram;
  inputs: Inputs;
  memory: SimMemory;
  analogInputs?: AnalogInputs;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Read-only view generated from the ladder program above. Series
        contacts feed an AND, parallel branches feed an OR, into the output
        block.
      </p>
      {program.rungs.map((rung, i) => {
        const energized = evalRungEnergized(rung.branches, inputs, memory, analogInputs);
        return (
          <div key={rung.id} className="flex items-center gap-3 overflow-x-auto pb-1">
            <span className="w-6 shrink-0 text-xs text-zinc-400">{i + 1}</span>

            <div className="flex flex-col gap-1">
              {rung.branches.map((branch, ri) => {
                const cells = branch.cells.filter((c): c is BranchCell => c !== null);
                return (
                  <div key={ri} className="flex items-center gap-1">
                    {cells.length === 0 && (
                      <span className="text-[11px] text-zinc-400">(empty)</span>
                    )}
                    {cells.map((c, ci) => (
                      <Fragment key={ci}>
                        {ci > 0 && <span className="text-[10px] text-zinc-400">AND</span>}
                        <ContactBox cell={c} energized={evalCell(c, inputs, memory, analogInputs)} />
                      </Fragment>
                    ))}
                  </div>
                );
              })}
            </div>

            {rung.branches.length > 1 && (
              <div className="flex h-10 shrink-0 items-center justify-center rounded-full border-2 border-zinc-400 px-2 text-[10px] font-semibold text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                OR
              </div>
            )}

            <span className="shrink-0 text-zinc-400">&rarr;</span>

            {rung.output ? (
              <div
                className={`shrink-0 rounded border-2 px-3 py-1.5 text-center font-mono text-[11px] ${
                  energized
                    ? "border-green-500 text-green-600 dark:text-green-400"
                    : "border-zinc-400 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                }`}
              >
                {KIND_LABEL[rung.output.kind]}
                <br />
                {rung.output.address ?? "?"}
              </div>
            ) : (
              <span className="text-[11px] text-zinc-400">(no output)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
