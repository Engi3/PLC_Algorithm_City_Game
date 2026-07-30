"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ComparisonBlock, ComparisonOperator } from "@/lib/ladder/types";

const OPERATOR_LABEL: Record<ComparisonOperator, string> = {
  ">": ">",
  "<": "<",
  "==": "=",
  ">=": "≥",
  "<=": "≤",
};

export default function ComparisonCell({
  rungId,
  rowIndex,
  colIndex,
  block,
  energized,
  numericOptions,
  onUpdate,
  onRemove,
}: {
  rungId: string;
  rowIndex: number;
  colIndex: number;
  block: ComparisonBlock;
  energized: boolean;
  numericOptions: string[];
  onUpdate: (patch: Partial<ComparisonBlock>) => void;
  onRemove: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `cell-${rungId}-${rowIndex}-${colIndex}`,
    data: { accepts: "contact", rungId, rowIndex, colIndex },
  });

  const unassigned = !block.sourceA;
  const color = unassigned
    ? "text-red-500"
    : energized
      ? "text-green-600 dark:text-green-400"
      : "text-zinc-500 dark:text-zinc-400";

  return (
    <div
      ref={setNodeRef}
      className="group relative flex h-14 w-28 shrink-0 flex-col items-center justify-center gap-0.5"
    >
      <div className="h-px w-full bg-zinc-400 dark:bg-zinc-600" />
      <div className={`flex items-center gap-0.5 rounded border border-current px-1 ${color}`}>
        <select
          aria-label="Comparison source A"
          value={block.sourceA ?? ""}
          onChange={(e) => onUpdate({ sourceA: e.target.value || null })}
          className="w-11 rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">?</option>
          {numericOptions.map((addr) => (
            <option key={addr} value={addr}>
              {addr}
            </option>
          ))}
        </select>
        <select
          aria-label="Comparison operator"
          value={block.operator}
          onChange={(e) => onUpdate({ operator: e.target.value as ComparisonOperator })}
          className="rounded border border-zinc-300 bg-white text-center text-[10px] font-bold dark:border-zinc-700 dark:bg-zinc-900"
        >
          {(Object.keys(OPERATOR_LABEL) as ComparisonOperator[]).map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABEL[op]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-0.5">
        <select
          aria-label="Comparison source B kind"
          value={block.sourceB.kind}
          onChange={(e) =>
            onUpdate({
              sourceB:
                e.target.value === "constant"
                  ? { kind: "constant", value: 0 }
                  : { kind: "register", address: numericOptions[0] ?? "" },
            })
          }
          className="rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="constant">#</option>
          <option value="register">reg</option>
        </select>
        {block.sourceB.kind === "constant" ? (
          <input
            type="number"
            aria-label="Comparison constant value"
            value={block.sourceB.value}
            onChange={(e) => onUpdate({ sourceB: { kind: "constant", value: Number(e.target.value) || 0 } })}
            className="w-14 rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
          />
        ) : (
          <select
            aria-label="Comparison source B register"
            value={block.sourceB.address}
            onChange={(e) => onUpdate({ sourceB: { kind: "register", address: e.target.value } })}
            className="w-14 rounded border border-zinc-300 bg-white text-center text-[9px] dark:border-zinc-700 dark:bg-zinc-900"
          >
            {numericOptions.map((addr) => (
              <option key={addr} value={addr}>
                {addr}
              </option>
            ))}
          </select>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove comparison"
        className="absolute -top-1 right-0 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white group-hover:flex"
      >
        x
      </button>
    </div>
  );
}
