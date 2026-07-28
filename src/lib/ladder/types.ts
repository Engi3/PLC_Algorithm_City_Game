export type ContactType = "NO" | "NC";
export type TimerVariant = "TON" | "TOF" | "RTO";
export type CounterVariant = "CTU" | "CTD";

export const INPUT_ADDRESSES = [
  "I0",
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
  "I7",
] as const;
export const COIL_ADDRESSES = ["Q0", "Q1", "Q2", "Q3"] as const;
export const TIMER_ADDRESSES = ["T0", "T1", "T2", "T3"] as const;
export const COUNTER_ADDRESSES = ["C0", "C1", "C2", "C3"] as const;

export const MAX_RUNGS = 12;
export const MAX_BRANCHES_PER_RUNG = 3;
export const COLS_PER_BRANCH = 4;
export const DEFAULT_TIMER_PRESET = 3;
export const DEFAULT_COUNTER_PRESET = 3;

export type Contact = {
  type: ContactType;
  /** Unassigned until the student picks an address. */
  address: string | null;
};

export type Branch = {
  /** Fixed-length row of contact slots; null = empty slot. */
  cells: (Contact | null)[];
};

export type Output =
  | { kind: "COIL"; address: string | null }
  /** Latches address to true. Meant to share its address with a RESET elsewhere. */
  | { kind: "SET"; address: string | null }
  /** Clears a coil (false), or clears a timer/counter accumulator, by address prefix. */
  | { kind: "RESET"; address: string | null }
  | { kind: "TIMER"; variant: TimerVariant; address: string | null; preset: number }
  | { kind: "COUNTER"; variant: CounterVariant; address: string | null; preset: number };

export type OutputKind = Output["kind"];

export type Rung = {
  id: string;
  branches: Branch[];
  output: Output | null;
};

export type LadderProgram = {
  rungs: Rung[];
};

export type TimerMemory = { acc: number; preset: number; done: boolean };
export type CounterMemory = {
  cv: number;
  preset: number;
  done: boolean;
  variant: CounterVariant;
  /** Rung-energized state as of the previous scan, for rising-edge detection. */
  prevEnergized: boolean;
};

export type SimMemory = {
  coils: Record<string, boolean>;
  timers: Record<string, TimerMemory>;
  counters: Record<string, CounterMemory>;
};

export type Inputs = Record<string, boolean>;

export function createEmptyBranch(): Branch {
  return { cells: Array.from({ length: COLS_PER_BRANCH }, () => null) };
}

export function createEmptyRung(id: string): Rung {
  return { id, branches: [createEmptyBranch()], output: null };
}

export function createEmptyProgram(): LadderProgram {
  return { rungs: [createEmptyRung(crypto.randomUUID())] };
}

export function createEmptyMemory(): SimMemory {
  return { coils: {}, timers: {}, counters: {} };
}

function defaultOutputForKind(kind: OutputKind): Output {
  switch (kind) {
    case "COIL":
      return { kind: "COIL", address: null };
    case "SET":
      return { kind: "SET", address: null };
    case "RESET":
      return { kind: "RESET", address: null };
    case "TIMER":
      return { kind: "TIMER", variant: "TON", address: null, preset: DEFAULT_TIMER_PRESET };
    case "COUNTER":
      return { kind: "COUNTER", variant: "CTU", address: null, preset: DEFAULT_COUNTER_PRESET };
  }
}

export { defaultOutputForKind };

/** Address dropdown options for a given output kind. */
export function outputAddressOptions(kind: OutputKind): readonly string[] {
  switch (kind) {
    case "COIL":
    case "SET":
      return COIL_ADDRESSES;
    case "TIMER":
      return TIMER_ADDRESSES;
    case "COUNTER":
      return COUNTER_ADDRESSES;
    case "RESET":
      return [...COIL_ADDRESSES, ...TIMER_ADDRESSES, ...COUNTER_ADDRESSES];
  }
}

/** Addresses usable as a contact input: raw inputs, coils, and timer/counter done bits. */
export function contactAddressOptions(program: LadderProgram): string[] {
  const doneBits = program.rungs
    .map((r) => r.output)
    .filter(
      (o): o is Extract<Output, { kind: "TIMER" | "COUNTER" }> =>
        !!o && (o.kind === "TIMER" || o.kind === "COUNTER") && !!o.address
    )
    .map((o) => `${o.address}.DN`);

  return [...INPUT_ADDRESSES, ...COIL_ADDRESSES, ...doneBits];
}

/**
 * Whether `address` is already claimed by another rung's output in a way that
 * would conflict with placing `candidateKind` there.
 *
 * RESET never conflicts (any number of resets may target the same address).
 * SET only conflicts with a plain COIL (SET/RESET pairs are meant to share
 * an address). COIL conflicts with another COIL or a SET. TIMER/COUNTER each
 * only conflict with another instance of their own kind (the instance that
 * owns the accumulator).
 */
export function isOutputAddressTaken(
  program: LadderProgram,
  candidateKind: OutputKind,
  address: string,
  excludeRungId: string
): boolean {
  const conflictingKinds: OutputKind[] =
    candidateKind === "RESET"
      ? []
      : candidateKind === "SET"
        ? ["COIL"]
        : candidateKind === "COIL"
          ? ["COIL", "SET"]
          : [candidateKind];

  return program.rungs.some(
    (r) =>
      r.id !== excludeRungId &&
      r.output !== null &&
      r.output.address === address &&
      conflictingKinds.includes(r.output.kind)
  );
}
