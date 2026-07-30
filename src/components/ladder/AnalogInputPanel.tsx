"use client";

import { MAX_ANALOG_VALUE, MIN_ANALOG_VALUE, type AnalogInputs } from "@/lib/ladder/types";

/** Sliders (+ precise number entry) for whichever AI addresses have been declared - only renders when at least one exists. */
export default function AnalogInputPanel({
  addresses,
  values,
  onChange,
}: {
  addresses: string[];
  values: AnalogInputs;
  onChange: (address: string, value: number) => void;
}) {
  if (addresses.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Analog Inputs ({MIN_ANALOG_VALUE}-{MAX_ANALOG_VALUE})
      </p>
      <div className="flex flex-col gap-3">
        {addresses.map((addr) => {
          const value = values[addr] ?? 0;
          return (
            <div key={addr} className="flex items-center gap-3">
              <span className="w-10 shrink-0 font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {addr}
              </span>
              <input
                type="range"
                aria-label={`${addr} slider`}
                min={MIN_ANALOG_VALUE}
                max={MAX_ANALOG_VALUE}
                value={value}
                onChange={(e) => onChange(addr, Number(e.target.value))}
                className="h-2 flex-1 accent-blue-600"
              />
              <input
                type="number"
                aria-label={`${addr} value`}
                min={MIN_ANALOG_VALUE}
                max={MAX_ANALOG_VALUE}
                value={value}
                onChange={(e) => onChange(addr, Number(e.target.value) || 0)}
                className="w-20 shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
