"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ContactType, OutputKind } from "@/lib/ladder/types";

export type PaletteDragData =
  | { kind: "contact"; contactType: ContactType }
  | { kind: "output"; outputKind: OutputKind }
  | { kind: "comparison" };

const PALETTE_ITEMS: { id: string; label: string; sub: string; data: PaletteDragData }[] = [
  {
    id: "palette-NO",
    label: "NO",
    sub: "Normally open contact",
    data: { kind: "contact", contactType: "NO" },
  },
  {
    id: "palette-NC",
    label: "NC",
    sub: "Normally closed contact",
    data: { kind: "contact", contactType: "NC" },
  },
  {
    id: "palette-COMPARE",
    label: "CMP",
    sub: "Comparison (>, <, =, ≥, ≤)",
    data: { kind: "comparison" },
  },
  {
    id: "palette-COIL",
    label: "( )",
    sub: "Coil",
    data: { kind: "output", outputKind: "COIL" },
  },
  {
    id: "palette-SET",
    label: "(S)",
    sub: "Set / latch coil",
    data: { kind: "output", outputKind: "SET" },
  },
  {
    id: "palette-RESET",
    label: "(R)",
    sub: "Reset coil/timer/counter",
    data: { kind: "output", outputKind: "RESET" },
  },
  {
    id: "palette-TIMER",
    label: "TMR",
    sub: "Timer (TON/TOF/RTO)",
    data: { kind: "output", outputKind: "TIMER" },
  },
  {
    id: "palette-COUNTER",
    label: "CTR",
    sub: "Counter (CTU/CTD)",
    data: { kind: "output", outputKind: "COUNTER" },
  },
];

function PaletteItem({
  id,
  label,
  sub,
  data,
}: {
  id: string;
  label: string;
  sub: string;
  data: PaletteDragData;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab flex-col items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-center active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-900 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <span className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {label}
      </span>
      <span className="text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
        {sub}
      </span>
    </div>
  );
}

export default function LadderPalette() {
  return (
    <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {PALETTE_ITEMS.map((item) => (
        <PaletteItem key={item.id} {...item} />
      ))}
    </div>
  );
}
