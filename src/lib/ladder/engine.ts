import { isInputAddress, isOutputFamilyAddress, type Branch, type Contact, type Inputs, type LadderProgram, type SimMemory } from "./types";

export function readBit(address: string | null, inputs: Inputs, memory: SimMemory): boolean {
  if (!address) return false;
  if (address.endsWith(".DN")) {
    const base = address.slice(0, -".DN".length);
    return memory.timers[base]?.done ?? memory.counters[base]?.done ?? false;
  }
  if (address.endsWith(".EN")) {
    const base = address.slice(0, -".EN".length);
    return memory.timers[base]?.en ?? memory.counters[base]?.en ?? false;
  }
  // Q/Y (aliased outputs) and M (internal relays) all live in the same
  // coil store; I/X (aliased inputs) read from the live input state.
  if (isOutputFamilyAddress(address)) return memory.coils[address] ?? false;
  if (isInputAddress(address)) return inputs[address] ?? false;
  return inputs[address] ?? false;
}

/**
 * Reads a timer/counter's integer register (`.PRE` preset or `.ACC`
 * accumulated value) - unlike readBit these are numbers, not booleans, so
 * they can't be wired to a contact. Exists for the Phase 11 comparison
 * blocks (e.g. `T0.ACC >= 1000`), added now so the memory model exposes
 * these values cleanly from day one.
 */
export function readRegister(address: string | null, memory: SimMemory): number {
  if (!address) return 0;
  if (address.endsWith(".PRE")) {
    const base = address.slice(0, -".PRE".length);
    return memory.timers[base]?.preset ?? memory.counters[base]?.preset ?? 0;
  }
  if (address.endsWith(".ACC")) {
    const base = address.slice(0, -".ACC".length);
    return memory.timers[base]?.acc ?? memory.counters[base]?.cv ?? 0;
  }
  return 0;
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
 * memory through so later rungs can read coils/timers/counters written
 * earlier in the same scan (mirrors real in-scan image-table updates).
 *
 * `tick` gates timer accumulation only: combinational logic (contacts,
 * coils) and counters are always recomputed instantly on any input or
 * program change, but a timer's accumulator only advances on an explicit
 * tick (Step/Run) - this separates "time passing" from "an input changed".
 * Counters are edge-triggered off rung-energized transitions, not time, so
 * they are unaffected by `tick`.
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
    counters: { ...prevMemory.counters },
  };
  const rungEnergized: Record<string, boolean> = {};

  for (const rung of program.rungs) {
    const energized = evalRungEnergized(rung.branches, inputs, memory);
    rungEnergized[rung.id] = energized;

    const output = rung.output;
    if (!output || !output.address) continue;
    const addr = output.address;

    switch (output.kind) {
      case "COIL": {
        memory.coils[addr] = energized;
        break;
      }
      case "SET": {
        if (energized) memory.coils[addr] = true;
        break;
      }
      case "RESET": {
        if (!energized) break;
        if (isOutputFamilyAddress(addr)) {
          memory.coils[addr] = false;
        } else if (addr.startsWith("T")) {
          const prev = memory.timers[addr];
          memory.timers[addr] = { acc: 0, preset: prev?.preset ?? 0, done: false, en: prev?.en ?? false };
        } else if (addr.startsWith("C")) {
          const prev = memory.counters[addr];
          const preset = prev?.preset ?? 0;
          const variant = prev?.variant ?? "CTU";
          // CTD reloads to its preset (counts back down from there); CTU
          // clears to 0 (counts back up from there).
          const cv = variant === "CTD" ? preset : 0;
          memory.counters[addr] = {
            cv,
            preset,
            done: variant === "CTD" ? cv <= 0 : preset > 0 && cv >= preset,
            variant,
            prevEnergized: prev?.prevEnergized ?? false,
            en: prev?.en ?? false,
          };
        }
        break;
      }
      case "TIMER": {
        const prev = memory.timers[addr];
        const preset = output.preset;
        let acc = prev?.acc ?? 0;
        let done: boolean;

        if (output.variant === "TON") {
          if (!energized) acc = 0;
          else if (options.tick) acc = Math.min(preset, acc + 1);
          done = preset > 0 && acc >= preset;
        } else if (output.variant === "TOF") {
          if (energized) {
            acc = 0;
            done = true;
          } else {
            if (options.tick) acc = Math.min(preset, acc + 1);
            done = preset > 0 && acc < preset;
          }
        } else {
          // RTO: accumulates while energized, never auto-resets - only a
          // RESET instruction targeting this address clears it.
          if (energized && options.tick) acc = Math.min(preset, acc + 1);
          done = preset > 0 && acc >= preset;
        }

        memory.timers[addr] = { acc, preset, done, en: energized };
        break;
      }
      case "COUNTER": {
        const prev = memory.counters[addr];
        const preset = output.preset;
        // CTD starts pre-loaded at the preset and counts down; CTU starts at 0.
        // Re-seed (not just on first use) whenever the variant differs from
        // what's stored, so switching CTU<->CTD in the editor reloads
        // correctly instead of keeping a stale accumulator.
        const sameVariant = prev?.variant === output.variant;
        let cv = sameVariant ? prev!.cv : output.variant === "CTD" ? preset : 0;
        const prevEnergized = sameVariant ? prev!.prevEnergized : false;
        const risingEdge = energized && !prevEnergized;

        if (risingEdge) {
          cv = output.variant === "CTU" ? cv + 1 : Math.max(0, cv - 1);
        }

        const done = output.variant === "CTU" ? preset > 0 && cv >= preset : cv <= 0;
        memory.counters[addr] = { cv, preset, done, variant: output.variant, prevEnergized: energized, en: energized };
        break;
      }
    }
  }

  return { memory, rungEnergized };
}
