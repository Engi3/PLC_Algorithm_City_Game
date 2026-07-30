"use client";

import type {
  AnalogInputs,
  ComparisonBlock,
  CounterVariant,
  DeclaredVariable,
  Inputs,
  Rung as RungModel,
  SimMemory,
  TimerVariant,
} from "@/lib/ladder/types";
import { isComparisonBlock, MAX_BRANCHES_PER_RUNG } from "@/lib/ladder/types";
import { evalBranchFlow, evalCell } from "@/lib/ladder/engine";
import LadderCell from "./LadderCell";
import ComparisonCell from "./ComparisonCell";
import OutputSlot from "./OutputSlot";

export default function Rung({
  rung,
  index,
  inputs,
  memory,
  analogInputs = {},
  rungEnergized,
  addressOptions,
  numericOptions = [],
  addressTaken,
  customVariables,
  onSetContactAddress,
  onRemoveContact,
  onUpdateComparison,
  onSetOutputAddress,
  onSetOutputVariant,
  onSetOutputPreset,
  onRemoveOutput,
  onAddBranch,
  onRemoveBranch,
  onRemoveRung,
}: {
  rung: RungModel;
  index: number;
  inputs: Inputs;
  memory: SimMemory;
  analogInputs?: AnalogInputs;
  rungEnergized: boolean;
  addressOptions: string[];
  numericOptions?: string[];
  addressTaken: (address: string, outputIndex: number) => boolean;
  customVariables?: DeclaredVariable[];
  onSetContactAddress: (rowIndex: number, colIndex: number, address: string) => void;
  onRemoveContact: (rowIndex: number, colIndex: number) => void;
  onUpdateComparison?: (rowIndex: number, colIndex: number, patch: Partial<ComparisonBlock>) => void;
  onSetOutputAddress: (outputIndex: number, address: string) => void;
  onSetOutputVariant: (outputIndex: number, variant: TimerVariant | CounterVariant) => void;
  onSetOutputPreset: (outputIndex: number, preset: number) => void;
  onRemoveOutput: (outputIndex: number) => void;
  onAddBranch: () => void;
  onRemoveBranch: (rowIndex: number) => void;
  onRemoveRung: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex w-6 shrink-0 items-start justify-center pt-4 text-xs font-medium text-zinc-400">
        {index + 1}
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-x-auto">
        {rung.branches.map((branch, rowIndex) => {
          const flow = evalBranchFlow(branch, inputs, memory, analogInputs);
          return (
          <div key={rowIndex} className="flex items-center gap-1">
            <div
              className={`h-full w-2 shrink-0 self-stretch border-y-0 transition-colors ${
                rowIndex === 0 ? "border-l-2" : "border-l"
              } ${flow[0] ? "border-green-500" : "border-zinc-400 dark:border-zinc-600"}`}
            />
            <div className="flex">
              {branch.cells.map((cell, colIndex) =>
                cell && isComparisonBlock(cell) ? (
                  <ComparisonCell
                    key={colIndex}
                    rungId={rung.id}
                    rowIndex={rowIndex}
                    colIndex={colIndex}
                    block={cell}
                    energized={flow[colIndex] && evalCell(cell, inputs, memory, analogInputs)}
                    wireEnergized={flow[colIndex]}
                    numericOptions={numericOptions}
                    onUpdate={(patch) => onUpdateComparison?.(rowIndex, colIndex, patch)}
                    onRemove={() => onRemoveContact(rowIndex, colIndex)}
                  />
                ) : (
                  <LadderCell
                    key={colIndex}
                    rungId={rung.id}
                    rowIndex={rowIndex}
                    colIndex={colIndex}
                    contact={cell}
                    energized={flow[colIndex] && evalCell(cell, inputs, memory, analogInputs)}
                    wireEnergized={flow[colIndex]}
                    addressOptions={addressOptions}
                    onSetAddress={(addr) => onSetContactAddress(rowIndex, colIndex, addr)}
                    onRemove={() => onRemoveContact(rowIndex, colIndex)}
                  />
                )
              )}
            </div>
            {rung.branches.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveBranch(rowIndex)}
                className="text-xs text-zinc-400 hover:text-red-500"
                aria-label="Remove branch"
              >
                x
              </button>
            )}
          </div>
          );
        })}

        {rung.branches.length < MAX_BRANCHES_PER_RUNG && (
          <button
            type="button"
            onClick={onAddBranch}
            className="w-fit text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add parallel branch (OR)
          </button>
        )}
      </div>

      <OutputSlot
        rungId={rung.id}
        outputs={rung.outputs}
        energized={rungEnergized}
        addressTaken={addressTaken}
        customVariables={customVariables}
        onSetAddress={onSetOutputAddress}
        onSetVariant={onSetOutputVariant}
        onSetPreset={onSetOutputPreset}
        onRemove={onRemoveOutput}
      />

      <button
        type="button"
        onClick={onRemoveRung}
        className="ml-1 self-start text-xs text-zinc-400 hover:text-red-500"
        aria-label="Delete rung"
      >
        Delete
      </button>
    </div>
  );
}
