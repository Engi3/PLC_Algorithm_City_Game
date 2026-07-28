"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ContactType, OutputType } from "@/lib/ladder/types";

export type PaletteDragData =
  | { kind: "contact"; contactType: ContactType }
  | { kind: "output"; outputType: OutputType };

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
    id: "palette-COIL",
    label: "( )",
    sub: "Coil",
    data: { kind: "output", outputType: "COIL" },
  },
  {
    id: "palette-TIMER",
    label: "TON",
    sub: "On-delay timer",
    data: { kind: "output", outputType: "TIMER" },
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
