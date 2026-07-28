export type ContactType = "NO" | "NC";
export type OutputType = "COIL" | "TIMER";

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

export const MAX_RUNGS = 8;
export const MAX_BRANCHES_PER_RUNG = 3;
export const COLS_PER_BRANCH = 4;
export const DEFAULT_TIMER_PRESET = 3;

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
  | { type: "COIL"; address: string | null }
  | { type: "TIMER"; address: string | null; preset: number };

export type Rung = {
  id: string;
  branches: Branch[];
  output: Output | null;
};

export type LadderProgram = {
  rungs: Rung[];
};

export type TimerMemory = { acc: number; preset: number; done: boolean };

export type SimMemory = {
  coils: Record<string, boolean>;
  timers: Record<string, TimerMemory>;
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
  return { coils: {}, timers: {} };
}

/** Addresses usable as a contact input: raw inputs, coils, and timer done bits. */
export function contactAddressOptions(program: LadderProgram): string[] {
  const timerAddresses = program.rungs
    .map((r) => r.output)
    .filter(
      (o): o is Extract<Output, { type: "TIMER" }> =>
        !!o && o.type === "TIMER" && !!o.address
    )
    .map((o) => `${o.address}.DN`);

  return [...INPUT_ADDRESSES, ...COIL_ADDRESSES, ...timerAddresses];
}

/** An output address is already claimed if another rung's output uses it. */
export function isOutputAddressTaken(
  program: LadderProgram,
  address: string,
  excludeRungId: string
): boolean {
  return program.rungs.some(
    (r) =>
      r.id !== excludeRungId && r.output?.address === address
  );
}
