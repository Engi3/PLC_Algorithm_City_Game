"use client";

import { COIL_ADDRESSES, COUNTER_ADDRESSES, INPUT_ADDRESSES, TIMER_ADDRESSES, type Inputs, type SimMemory } from "@/lib/ladder/types";

export default function IoPanel({
  inputs,
  memory,
  onToggleInput,
}: {
  inputs: Inputs;
  memory: SimMemory;
  onToggleInput: (address: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Inputs (click to toggle)
        </p>
        <div className="flex flex-wrap gap-2">
          {INPUT_ADDRESSES.map((addr) => {
            const on = inputs[addr] ?? false;
            return (
              <button
                key={addr}
                type="button"
                onClick={() => onToggleInput(addr)}
                className={`h-10 w-12 rounded-md border font-mono text-xs font-semibold transition-colors ${
                  on
                    ? "border-green-600 bg-green-500 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {addr}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Coils
        </p>
        <div className="flex flex-wrap gap-2">
          {COIL_ADDRESSES.map((addr) => {
            const on = memory.coils[addr] ?? false;
            return (
              <div
                key={addr}
                className={`flex h-10 w-12 items-center justify-center rounded-md border font-mono text-xs font-semibold ${
                  on
                    ? "border-yellow-500 bg-yellow-300 text-yellow-900"
                    : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                {addr}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Timers
        </p>
        <div className="flex flex-wrap gap-2">
          {TIMER_ADDRESSES.map((addr) => {
            const t = memory.timers[addr];
            return (
              <div
                key={addr}
                className={`flex h-10 w-16 flex-col items-center justify-center rounded-md border text-[10px] font-semibold ${
                  t?.done
                    ? "border-yellow-500 bg-yellow-300 text-yellow-900"
                    : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                <span className="font-mono">{addr}</span>
                <span>{t ? `${t.acc}/${t.preset}` : "-"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Counters
        </p>
        <div className="flex flex-wrap gap-2">
          {COUNTER_ADDRESSES.map((addr) => {
            const c = memory.counters[addr];
            return (
              <div
                key={addr}
                className={`flex h-10 w-16 flex-col items-center justify-center rounded-md border text-[10px] font-semibold ${
                  c?.done
                    ? "border-yellow-500 bg-yellow-300 text-yellow-900"
                    : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                <span className="font-mono">{addr}</span>
                <span>{c ? `${c.cv}/${c.preset}` : "-"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
