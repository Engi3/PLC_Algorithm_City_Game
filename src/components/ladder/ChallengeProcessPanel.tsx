"use client";

import type { AnalogInputs, Inputs, SimMemory } from "@/lib/ladder/types";
import type { ProcessAddressGroups } from "@/lib/ladder/challenge-types";

const MAX_ANALOG_DISPLAY_VALUE = 32767;

/**
 * Task 5.2 "Crucial" requirement: a visual representation of the physical
 * plant (tanks/conveyors/heaters/AGVs) reacting live to the student's
 * ladder logic. Rather than authoring bespoke per-challenge artwork (50
 * different plants, no structured metadata to drive it), this renders a
 * generic industrial HMI/SCADA-style instrument panel - exactly how real
 * plant-floor operator screens represent these things anyway: sensors as
 * status lamps, analog process values (level/temperature/pressure) as tank
 * gauges, and actuators (motors/valves/heaters) as glowing indicator lamps.
 * The address inventory itself is derived live from the challenge's script
 * and the student's own program (collectProcessAddresses), so this stays
 * correct for all 50 challenges with zero new authoring.
 */
export default function ChallengeProcessPanel({
  groups,
  inputs,
  analogInputs,
  memory,
}: {
  groups: ProcessAddressGroups;
  inputs: Inputs;
  analogInputs: AnalogInputs;
  memory: SimMemory;
}) {
  const hasAnything =
    groups.digitalInputs.length > 0 ||
    groups.analogInputs.length > 0 ||
    groups.actuators.length > 0 ||
    groups.timers.length > 0 ||
    groups.counters.length > 0;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-white">
      <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400">Process Panel</p>
      <h2 className="mt-0.5 text-sm font-semibold">สถานะโรงงานจำลอง (Live Plant Status)</h2>

      {!hasAnything && (
        <p className="mt-3 text-xs text-zinc-500">วางบล็อกในวงจรของคุณ แล้วสถานะกระบวนการจะแสดงที่นี่</p>
      )}

      {groups.digitalInputs.length > 0 && (
        <Section title="สัญญาณจากเซนเซอร์/ปุ่มกด (จำลองอัตโนมัติตามสถานการณ์)">
          <div className="flex flex-wrap gap-2">
            {groups.digitalInputs.map((addr) => {
              const on = inputs[addr] ?? false;
              return (
                <div
                  key={addr}
                  className={`flex h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-md border font-mono text-[11px] font-semibold transition-colors ${
                    on ? "border-emerald-400 bg-emerald-500/20 text-emerald-300" : "border-zinc-700 bg-zinc-950 text-zinc-500"
                  }`}
                >
                  <span>{addr}</span>
                  <span className="text-[9px] font-normal">{on ? "ON" : "OFF"}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {groups.analogInputs.length > 0 && (
        <Section title="ค่าอนาล็อกของกระบวนการ (ระดับ/อุณหภูมิ/แรงดัน)">
          <div className="flex flex-wrap gap-3">
            {groups.analogInputs.map((addr) => {
              const value = analogInputs[addr] ?? 0;
              const pct = Math.max(0, Math.min(100, (value / MAX_ANALOG_DISPLAY_VALUE) * 100));
              return (
                <div key={addr} className="flex flex-col items-center gap-1">
                  <div className="relative h-20 w-8 overflow-hidden rounded border border-zinc-700 bg-zinc-950">
                    <div
                      className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-sky-500 to-sky-300 transition-[height]"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-zinc-300">{addr}</span>
                  <span className="font-mono text-[9px] text-zinc-500">{value}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {groups.actuators.length > 0 && (
        <Section title="ตัวกระตุ้น - มอเตอร์ / วาล์ว / ฮีตเตอร์ (Actuators)">
          <div className="flex flex-wrap gap-2">
            {groups.actuators.map((addr) => {
              const on = memory.coils[addr] ?? false;
              return (
                <div
                  key={addr}
                  className={`flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-full border-2 font-mono text-[11px] font-semibold transition-all ${
                    on
                      ? "border-amber-400 bg-amber-500/25 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                      : "border-zinc-700 bg-zinc-950 text-zinc-500"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${on ? "animate-pulse bg-amber-400" : "bg-zinc-700"}`} />
                  {addr}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {groups.timers.length > 0 && (
        <Section title="ไทม์เมอร์ (Timers)">
          <div className="flex flex-wrap gap-2">
            {groups.timers.map((addr) => {
              const t = memory.timers[addr];
              const pct = t && t.preset > 0 ? Math.min(100, (t.acc / t.preset) * 100) : 0;
              return (
                <div
                  key={addr}
                  className={`flex h-12 w-20 flex-col justify-center gap-1 rounded-md border px-2 text-[10px] font-semibold ${
                    t?.done ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 bg-zinc-950 text-zinc-400"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span>{addr}</span>
                    <span>{t ? `${t.acc}/${t.preset}` : "-"}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {groups.counters.length > 0 && (
        <Section title="เคาน์เตอร์ (Counters)">
          <div className="flex flex-wrap gap-2">
            {groups.counters.map((addr) => {
              const c = memory.counters[addr];
              const pct = c && c.preset > 0 ? Math.min(100, (c.cv / c.preset) * 100) : 0;
              return (
                <div
                  key={addr}
                  className={`flex h-12 w-20 flex-col justify-center gap-1 rounded-md border px-2 text-[10px] font-semibold ${
                    c?.done ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 bg-zinc-950 text-zinc-400"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span>{addr}</span>
                    <span>{c ? `${c.cv}/${c.preset}` : "-"}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-zinc-800 pt-3 first:mt-3 first:border-t-0 first:pt-0">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}
