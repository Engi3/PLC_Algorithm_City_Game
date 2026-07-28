"use client";

import { useDroppable } from "@dnd-kit/core";
import { COIL_ADDRESSES, TIMER_ADDRESSES, type Output } from "@/lib/ladder/types";

export default function OutputSlot({
  rungId,
  output,
  energized,
  addressTaken,
  onSetAddress,
  onSetPreset,
  onRemove,
}: {
  rungId: string;
  output: Output | null;
  energized: boolean;
  addressTaken: (address: string) => boolean;
  onSetAddress: (address: string) => void;
  onSetPreset: (preset: number) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `output-${rungId}`,
    data: { accepts: "output", rungId },
  });

  const options = output?.type === "TIMER" ? TIMER_ADDRESSES : COIL_ADDRESSES;

  if (!output) {
    return (
      <div
        ref={setNodeRef}
        className={`flex h-14 w-20 shrink-0 items-center justify-center border-t border-zinc-400 text-xs text-zinc-400 dark:border-zinc-600 ${
          isOver ? "bg-blue-100 dark:bg-blue-950" : ""
        }`}
      >
        drop output
      </div>
    );
  }

  const unassigned = !output.address;
  const color = unassigned
    ? "text-red-500"
    : energized
      ? "text-green-600 dark:text-green-400"
      : "text-zinc-500 dark:text-zinc-400";

  return (
    <div
      ref={setNodeRef}
      className="group relative flex h-14 w-24 shrink-0 flex-col items-center justify-center gap-0.5"
    >
      <div className="h-px w-full bg-zinc-400 dark:bg-zinc-600" />
      <div className={`flex h-8 w-10 items-center justify-center rounded-full border-2 border-current font-mono text-[10px] ${color}`}>
        {output.type === "COIL" ? "( )" : "TON"}
      </div>
      <div className="flex items-center gap-1">
        <select
          aria-label="Output address"
          value={output.address ?? ""}
          onChange={(e) => onSetAddress(e.target.value)}
          className={`w-14 rounded border border-zinc-300 bg-white text-center text-[10px] dark:border-zinc-700 dark:bg-zinc-900 ${color}`}
        >
          <option value="">?</option>
          {options.map((addr) => (
            <option key={addr} value={addr} disabled={addressTaken(addr)}>
              {addr}
              {addressTaken(addr) ? " (used)" : ""}
            </option>
          ))}
        </select>
      </div>
      {output.type === "TIMER" && (
        <input
          type="number"
          min={1}
          max={20}
          value={output.preset}
          onChange={(e) => onSetPreset(Number(e.target.value) || 1)}
          aria-label="Timer preset (ticks)"
          className="w-14 rounded border border-zinc-300 bg-white text-center text-[10px] dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove output"
        className="absolute -top-1 right-0 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
      >
        x
      </button>
    </div>
  );
}
