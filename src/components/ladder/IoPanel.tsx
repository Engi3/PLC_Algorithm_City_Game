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

/** UX/UI refinement Task 3: the address plus its declared description (if any) on a second line - kept inside the button so it works identically for the toggle and momentary variants below. */
function AddressLabel({ addr, label }: { addr: string; label?: string }) {
  return (
    <>
      <span className="font-mono">{addr}</span>
      {label && <span className="max-w-[50px] truncate text-[8px] font-normal leading-none opacity-80">{label}</span>}
    </>
  );
}

/**
 * UX/UI fix: the small corner badge that lets the switch-type mode itself
 * be changed directly on the input button - not just read. Previously the
 * only control for this (VariablePoolDrawer's Toggle/Momentary buttons)
 * only rendered for variables explicitly added to the custom pool, so the
 * built-in X0-X7 addresses everyone actually clicks in the simulator had no
 * way to change their switch type at all, even though the engine already
 * fully supported it. "L" for Latching (the SwitchType value is still
 * "toggle" internally - unchanged to avoid touching every call site - but
 * "Latching Switch" is the term GX Works/TIA Portal and this app's users
 * actually use for "stays in the set state until switched again").
 */
function SwitchTypeBadge({ addr, switchType, onSetSwitchType }: { addr: string; switchType: SwitchType; onSetSwitchType: (address: string, type: SwitchType) => void }) {
  const isMomentary = switchType === "momentary";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSetSwitchType(addr, isMomentary ? "toggle" : "momentary");
      }}
      title={
        isMomentary
          ? "โหมดปัจจุบัน: กดค้าง (Momentary Switch) - คลิกเพื่อเปลี่ยนเป็นแบบค้างสถานะ (Latching Switch)"
          : "โหมดปัจจุบัน: ค้างสถานะ (Latching Switch) - คลิกเพื่อเปลี่ยนเป็นแบบกดค้าง (Momentary Switch)"
      }
      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-zinc-400 bg-white text-[8px] font-bold leading-none text-zinc-600 shadow-sm hover:border-blue-500 hover:text-blue-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
    >
      {isMomentary ? "M" : "L"}
    </button>
  );
}

function InputButton({
  addr,
  label,
  on,
  switchType,
  onToggle,
  onSetValue,
  onSetSwitchType,
}: {
  addr: string;
  label?: string;
  on: boolean;
  switchType: SwitchType;
  onToggle: (address: string) => void;
  onSetValue: (address: string, value: boolean) => void;
  /** UX/UI fix: only provided when the caller wants the switch-type badge shown - all real callers do, but this stays optional so a hypothetical read-only IoPanel usage doesn't need to wire it up. */
  onSetSwitchType?: (address: string, type: SwitchType) => void;
}) {
  const className = `flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border font-mono text-xs font-semibold transition-colors select-none ${
    on
      ? "border-green-600 bg-green-500 text-white"
      : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
  }`;

  const mainButton =
    switchType === "momentary" ? (
      <button
        type="button"
        title={label ? `${label} - Momentary (held while pressed)` : "Momentary - held while pressed"}
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
        <AddressLabel addr={addr} label={label} />
      </button>
    ) : (
      <button type="button" title={label ? `${label} - Toggle` : "Toggle"} onClick={() => onToggle(addr)} className={className}>
        <AddressLabel addr={addr} label={label} />
      </button>
    );

  if (!onSetSwitchType) return mainButton;

  return (
    <div className="relative">
      {mainButton}
      <SwitchTypeBadge addr={addr} switchType={switchType} onSetSwitchType={onSetSwitchType} />
    </div>
  );
}

export default function IoPanel({
  inputs,
  memory,
  onToggleInput,
  onSetInputValue,
  customVariables = [],
  getSwitchType,
  onSetSwitchType,
}: {
  inputs: Inputs;
  memory: SimMemory;
  onToggleInput: (address: string) => void;
  onSetInputValue?: (address: string, value: boolean) => void;
  customVariables?: DeclaredVariable[];
  getSwitchType?: (address: string) => SwitchType;
  /** UX/UI fix: when provided, every input button (built-in X0-X7 included, not just custom X/Y/M variables) gets a small corner badge to change its switch type directly - see SwitchTypeBadge. */
  onSetSwitchType?: (address: string, type: SwitchType) => void;
}) {
  const customInputs = customVariables.filter((v) => v.kind === "input").map((v) => v.address);
  const customOutputs = customVariables.filter((v) => v.kind === "output").map((v) => v.address);
  const customRelays = customVariables.filter((v) => v.kind === "relay").map((v) => v.address);
  // UX/UI refinement Task 3: only custom X/Y/M variables can carry a description - the built-in I/Q addresses have no DeclaredVariable entry at all, so they simply render with no subtitle.
  const labelByAddress = new Map(customVariables.filter((v) => v.label).map((v) => [v.address, v.label as string]));

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
              label={labelByAddress.get(addr)}
              on={inputs[addr] ?? false}
              switchType={switchTypeOf(addr)}
              onToggle={onToggleInput}
              onSetValue={setValue}
              onSetSwitchType={onSetSwitchType}
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
            const label = labelByAddress.get(addr);
            return (
              <div
                key={addr}
                title={label}
                className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border font-mono text-xs font-semibold ${
                  on
                    ? "border-yellow-500 bg-yellow-300 text-yellow-900"
                    : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                <AddressLabel addr={addr} label={label} />
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
              const label = labelByAddress.get(addr);
              return (
                <div
                  key={addr}
                  title={label}
                  className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-md border font-mono text-xs font-semibold ${
                    on
                      ? "border-purple-500 bg-purple-300 text-purple-900"
                      : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                  }`}
                >
                  <AddressLabel addr={addr} label={label} />
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
