"use client";

import { COIL_ADDRESSES, INPUT_ADDRESSES, type DeclaredVariable, type Inputs, type SimMemory, type SwitchType } from "@/lib/ladder/types";

/** Numeric-aware sort so T2 sorts before T10 (plain string sort would put T10 first). */
function sortByNumber(addrs: string[]): string[] {
  return [...addrs].sort((a, b) => {
    const na = parseInt(a.replace(/^\D+/, ""), 10);
    const nb = parseInt(b.replace(/^\D+/, ""), 10);
    return na - nb;
  });
}

function InputButton({
  addr,
  on,
  switchType,
  onToggle,
  onSetValue,
}: {
  addr: string;
  on: boolean;
  switchType: SwitchType;
  onToggle: (address: string) => void;
  onSetValue: (address: string, value: boolean) => void;
}) {
  const className = `h-10 w-12 rounded-md border font-mono text-xs font-semibold transition-colors select-none ${
    on
      ? "border-green-600 bg-green-500 text-white"
      : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
  }`;

  if (switchType === "momentary") {
    return (
      <button
        type="button"
        title="Momentary - held while pressed"
        onMouseDown={() => onSetValue(addr, true)}
        onMouseUp={() => onSetValue(addr, false)}
        onMouseLeave={() => onSetValue(addr, false)}
        onTouchStart={(e) => {
          e.preventDefault();
          onSetValue(addr, true);
        }}
        onTouchEnd={() => onSetValue(addr, false)}
        className={className}
      >
        {addr}
      </button>
    );
  }

  return (
    <button type="button" title="Toggle" onClick={() => onToggle(addr)} className={className}>
      {addr}
    </button>
  );
}

export default function IoPanel({
  inputs,
  memory,
  onToggleInput,
  onSetInputValue,
  customVariables = [],
  getSwitchType,
}: {
  inputs: Inputs;
  memory: SimMemory;
  onToggleInput: (address: string) => void;
  onSetInputValue?: (address: string, value: boolean) => void;
  customVariables?: DeclaredVariable[];
  getSwitchType?: (address: string) => SwitchType;
}) {
  const customInputs = customVariables.filter((v) => v.kind === "input").map((v) => v.address);
  const customOutputs = customVariables.filter((v) => v.kind === "output").map((v) => v.address);
  const customRelays = customVariables.filter((v) => v.kind === "relay").map((v) => v.address);

  const allInputAddresses = [...INPUT_ADDRESSES, ...customInputs];
  const allCoilAddresses = [...COIL_ADDRESSES, ...customOutputs];

  const setValue = onSetInputValue ?? ((addr: string, value: boolean) => {
    if (value !== (inputs[addr] ?? false)) onToggleInput(addr);
  });
  const switchTypeOf = getSwitchType ?? (() => "toggle" as SwitchType);

  const placedTimers = sortByNumber(Object.keys(memory.timers));
  const placedCounters = sortByNumber(Object.keys(memory.counters));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Inputs (click to toggle, hold for momentary)
        </p>
        <div className="flex flex-wrap gap-2">
          {allInputAddresses.map((addr) => (
            <InputButton
              key={addr}
              addr={addr}
              on={inputs[addr] ?? false}
              switchType={switchTypeOf(addr)}
              onToggle={onToggleInput}
              onSetValue={setValue}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Coils
        </p>
        <div className="flex flex-wrap gap-2">
          {allCoilAddresses.map((addr) => {
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

      {customRelays.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Internal Relays (M)
          </p>
          <div className="flex flex-wrap gap-2">
            {customRelays.map((addr) => {
              const on = memory.coils[addr] ?? false;
              return (
                <div
                  key={addr}
                  className={`flex h-10 w-12 items-center justify-center rounded-md border font-mono text-xs font-semibold ${
                    on
                      ? "border-purple-500 bg-purple-300 text-purple-900"
                      : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                  }`}
                >
                  {addr}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Timers {placedTimers.length === 0 && "(place one to see it here)"}
        </p>
        <div className="flex flex-wrap gap-2">
          {placedTimers.map((addr) => {
            const t = memory.timers[addr];
            return (
              <div
                key={addr}
                className={`relative flex h-11 w-16 flex-col items-center justify-center rounded-md border text-[10px] font-semibold ${
                  t?.done
                    ? "border-yellow-500 bg-yellow-300 text-yellow-900"
                    : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                {t?.en && (
                  <span
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-green-500"
                    title="EN (enabled)"
                  />
                )}
                <span className="font-mono">{addr}</span>
                <span>{t ? `${t.acc}/${t.preset}` : "-"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Counters {placedCounters.length === 0 && "(place one to see it here)"}
        </p>
        <div className="flex flex-wrap gap-2">
          {placedCounters.map((addr) => {
            const c = memory.counters[addr];
            return (
              <div
                key={addr}
                className={`relative flex h-11 w-16 flex-col items-center justify-center rounded-md border text-[10px] font-semibold ${
                  c?.done
                    ? "border-yellow-500 bg-yellow-300 text-yellow-900"
                    : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                {c?.en && (
                  <span
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-green-500"
                    title="EN (enabled)"
                  />
                )}
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
