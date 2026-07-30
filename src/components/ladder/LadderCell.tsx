"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Contact } from "@/lib/ladder/types";

export default function LadderCell({
  rungId,
  rowIndex,
  colIndex,
  contact,
  energized,
  wireEnergized = false,
  addressOptions,
  onSetAddress,
  onRemove,
}: {
  rungId: string;
  rowIndex: number;
  colIndex: number;
  contact: Contact | null;
  energized: boolean;
  /** Power-flow state of the incoming wire segment (Task 2), independent of this cell's own state. */
  wireEnergized?: boolean;
  addressOptions: string[];
  onSetAddress: (address: string) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${rungId}-${rowIndex}-${colIndex}`,
    data: { accepts: "contact", rungId, rowIndex, colIndex },
  });

  if (!contact) {
    return (
      <div
        ref={setNodeRef}
        className={`flex h-14 w-16 shrink-0 items-center justify-center border-t border-zinc-400 dark:border-zinc-600 ${
          isOver ? "bg-blue-100 dark:bg-blue-950" : ""
        }`}
        aria-label="Empty contact slot"
      >
        <div
          className={`h-px w-full transition-colors ${
            wireEnergized ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-zinc-400 dark:bg-zinc-600"
          }`}
        />
      </div>
    );
  }

  const unassigned = !contact.address;
  const color = unassigned
    ? "text-red-500"
    : energized
      ? "text-green-600 dark:text-green-400"
      : "text-zinc-500 dark:text-zinc-400";

  return (
    <div
      ref={setNodeRef}
      className="group relative flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-0.5"
    >
      <div
        className={`h-px w-full transition-colors ${
          wireEnergized ? "bg-green-500 shadow-[0_0_4px_#22c55e]" : "bg-zinc-400 dark:bg-zinc-600"
        }`}
      />
      <div className={`relative flex h-8 w-10 items-center justify-center transition-colors ${color}`}>
        <span className="absolute left-1.5 h-full w-px bg-current" />
        <span className="absolute right-1.5 h-full w-px bg-current" />
        {contact.type === "NC" && (
          <span className="absolute h-7 w-px rotate-45 bg-current" />
        )}
      </div>
      <select
        aria-label="Contact address"
        value={contact.address ?? ""}
        onChange={(e) => onSetAddress(e.target.value)}
        className={`w-14 rounded border border-zinc-300 bg-white text-center text-[10px] dark:border-zinc-700 dark:bg-zinc-900 ${color}`}
      >
        <option value="">?</option>
        {addressOptions.map((addr) => (
          <option key={addr} value={addr}>
            {addr}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove contact"
        className="absolute -top-1 right-0 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
      >
        x
      </button>
    </div>
  );
}
