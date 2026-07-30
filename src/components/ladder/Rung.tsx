"use client";

import type { CounterVariant, DeclaredVariable, Inputs, Rung as RungModel, SimMemory, TimerVariant } from "@/lib/ladder/types";
import { MAX_BRANCHES_PER_RUNG } from "@/lib/ladder/types";
import { evalContact } from "@/lib/ladder/engine";
import LadderCell from "./LadderCell";
import OutputSlot from "./OutputSlot";

export default function Rung({
  rung,
  index,
  inputs,
  memory,
  rungEnergized,
  addressOptions,
  addressTaken,
  customVariables,
  onSetContactAddress,
  onRemoveContact,
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
  rungEnergized: boolean;
  addressOptions: string[];
  addressTaken: (address: string) => boolean;
  customVariables?: DeclaredVariable[];
  onSetContactAddress: (rowIndex: number, colIndex: number, address: string) => void;
  onRemoveContact: (rowIndex: number, colIndex: number) => void;
  onSetOutputAddress: (address: string) => void;
  onSetOutputVariant: (variant: TimerVariant | CounterVariant) => void;
  onSetOutputPreset: (preset: number) => void;
  onRemoveOutput: () => void;
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
        {rung.branches.map((branch, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-1">
            <div
              className={`h-full w-2 shrink-0 self-stretch border-y-0 ${
                rowIndex === 0 ? "border-l-2" : "border-l"
              } ${rungEnergized ? "border-green-500" : "border-zinc-400 dark:border-zinc-600"}`}
            />
            <div className="flex">
              {branch.cells.map((contact, colIndex) => (
                <LadderCell
                  key={colIndex}
                  rungId={rung.id}
                  rowIndex={rowIndex}
                  colIndex={colIndex}
                  contact={contact}
                  energized={evalContact(contact, inputs, memory)}
                  addressOptions={addressOptions}
                  onSetAddress={(addr) => onSetContactAddress(rowIndex, colIndex, addr)}
                  onRemove={() => onRemoveContact(rowIndex, colIndex)}
                />
              ))}
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
        ))}

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
        output={rung.output}
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
