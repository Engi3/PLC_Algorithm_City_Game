import type { Branch, Contact, Inputs, LadderProgram, SimMemory } from "./types";

function readBit(address: string | null, inputs: Inputs, memory: SimMemory): boolean {
  if (!address) return false;
  if (address.endsWith(".DN")) {
    const timerAddress = address.slice(0, -".DN".length);
    return memory.timers[timerAddress]?.done ?? false;
  }
  if (address.startsWith("Q")) return memory.coils[address] ?? false;
  return inputs[address] ?? false;
}

export function evalContact(contact: Contact | null, inputs: Inputs, memory: SimMemory): boolean {
  if (!contact || !contact.address) return false;
  const raw = readBit(contact.address, inputs, memory);
  return contact.type === "NC" ? !raw : raw;
}

export function evalBranch(branch: Branch, inputs: Inputs, memory: SimMemory): boolean {
  const placed = branch.cells.filter((c): c is Contact => c !== null);
  if (placed.length === 0) return false;
  return placed.every((c) => evalContact(c, inputs, memory));
}

export function evalRungEnergized(
  branches: Branch[],
  inputs: Inputs,
  memory: SimMemory
): boolean {
  return branches.some((b) => evalBranch(b, inputs, memory));
}

/**
 * Runs one PLC scan over every rung, top to bottom, threading updated
 * memory through so later rungs can read coils/timers written earlier
 * in the same scan (mirrors real in-scan image-table updates).
 *
 * `tick` gates timer accumulation: combinational logic (contacts, coils)
 * is always recomputed instantly, but a timer's accumulator only advances
 * on an explicit tick (Step/Run), while de-energizing still resets it
 * immediately - this separates "time passing" from "an input changed".
 */
export function runScan(
  program: LadderProgram,
  inputs: Inputs,
  prevMemory: SimMemory,
  options: { tick: boolean }
): { memory: SimMemory; rungEnergized: Record<string, boolean> } {
  const memory: SimMemory = {
    coils: { ...prevMemory.coils },
    timers: { ...prevMemory.timers },
  };
  const rungEnergized: Record<string, boolean> = {};

  for (const rung of program.rungs) {
    const energized = evalRungEnergized(rung.branches, inputs, memory);
    rungEnergized[rung.id] = energized;

    if (!rung.output || !rung.output.address) continue;

    if (rung.output.type === "COIL") {
      memory.coils[rung.output.address] = energized;
    } else {
      const prev = memory.timers[rung.output.address];
      const preset = rung.output.preset;
      let acc = prev?.acc ?? 0;
      if (!energized) {
        acc = 0;
      } else if (options.tick) {
        acc = Math.min(preset, acc + 1);
      }
      memory.timers[rung.output.address] = {
        acc,
        preset,
        done: acc >= preset && preset > 0,
      };
    }
  }

  return { memory, rungEnergized };
}
