export type ContactType = "NO" | "NC";
export type TimerVariant = "TON" | "TOF" | "RTO";
export type CounterVariant = "CTU" | "CTD";

export const INPUT_ADDRESSES = [
  "X0",
  "X1",
  "X2",
  "X3",
  "X4",
  "X5",
  "X6",
  "X7",
] as const;
export const COIL_ADDRESSES = ["Y0", "Y1", "Y2", "Y3"] as const;
/** Range widened 0-99 (Phase 10) so a program can use up to MAX_RUNGS distinct timers without exhausting addresses. */
export const TIMER_ADDRESSES = Array.from({ length: 100 }, (_, i) => `T${i}`);
export const COUNTER_ADDRESSES = Array.from({ length: 100 }, (_, i) => `C${i}`);

/**
 * X0-X7/Y0-Y3 (Mitsubishi/JIS style) are the fixed, always-available base
 * I/O - the legacy Allen-Bradley-style `I`/`Q` prefixes have been retired
 * project-wide (every level/challenge/hint migrated to X/Y). `X`/`Y` beyond
 * the base range, plus `M` (internal relay), are the namespace new
 * variables get added to via "+ Add Variable" in the Sandbox and Level
 * Builder - see addVariable's base-range guard in use-variable-pool.ts,
 * which keeps a custom declaration from colliding with X0-X7/Y0-Y3. `I`/`Q`
 * are still recognized as address prefixes (isInputAddress/
 * isOutputFamilyAddress below) purely as a defensive read-compat net for
 * any pre-migration data that slipped through, never generated or shown
 * anymore.
 */
export type VariableKind = "input" | "output" | "relay" | "analog_input" | "timer" | "counter";
export type SwitchType = "momentary" | "toggle";

export type DeclaredVariable = {
  address: string;
  kind: VariableKind;
  /** UX/UI refinement Task 3: an optional human-readable description (e.g. "เซ็นเซอร์หน้า" for X0) shown as a subtitle under the instruction symbol and next to the address in dropdowns/IoPanel - purely cosmetic, never read by the engine. */
  label?: string;
};

export const MAX_VARIABLE_NUMBER = 99;
/** Phase 11: AI0-AI15 per spec - a narrower range than the 0-99 digital pool. */
export const MAX_ANALOG_VARIABLE_NUMBER = 15;

const VARIABLE_PREFIX: Record<VariableKind, string> = {
  input: "X",
  output: "Y",
  relay: "M",
  analog_input: "AI",
  timer: "T",
  counter: "C",
};

const MAX_NUMBER_BY_KIND: Record<VariableKind, number> = {
  input: MAX_VARIABLE_NUMBER,
  output: MAX_VARIABLE_NUMBER,
  relay: MAX_VARIABLE_NUMBER,
  analog_input: MAX_ANALOG_VARIABLE_NUMBER,
  timer: MAX_VARIABLE_NUMBER,
  counter: MAX_VARIABLE_NUMBER,
};

export function buildVariableAddress(kind: VariableKind, num: number): string {
  return `${VARIABLE_PREFIX[kind]}${num}`;
}

export function isValidVariableNumber(kind: VariableKind, num: number): boolean {
  return Number.isInteger(num) && num >= 0 && num <= MAX_NUMBER_BY_KIND[kind];
}

/** True when address collides with a base built-in (X0-X7/Y0-Y3, always present) - a custom pool declaration must never shadow one of these. */
export function isReservedBaseAddress(address: string): boolean {
  return (INPUT_ADDRESSES as readonly string[]).includes(address) || (COIL_ADDRESSES as readonly string[]).includes(address);
}

function customAddressesByKind(variables: DeclaredVariable[], kind: VariableKind): string[] {
  return variables.filter((v) => v.kind === kind).map((v) => v.address);
}

/**
 * UX/UI refinement Task 3: which named group an address belongs to, for
 * rendering address `<select>`s as `<optgroup>` sections (Inputs/Outputs/
 * Relays/Timers/Counters/Analog/status-bits/registers) instead of one long
 * flat list - checked in this order because a status-bit or register
 * address (e.g. "T0.DN", "C3.ACC") shares its base prefix with the plain
 * Timer/Counter group it's derived from and must be told apart first.
 */
export function classifyAddressGroup(address: string): string {
  if (address.endsWith(".DN") || address.endsWith(".EN")) return "Status Bits (.DN/.EN)";
  if (address.endsWith(".ACC") || address.endsWith(".PRE")) return "Registers (.ACC/.PRE)";
  const prefix = address.match(/^[A-Za-z]+/)?.[0] ?? "";
  switch (prefix) {
    case "AI":
      return "Analog Inputs (AI)";
    case "I":
    case "X":
      return "Inputs (X)";
    case "Q":
    case "Y":
      return "Outputs (Y)";
    case "M":
      return "Internal Relays (M)";
    case "T":
      return "Timers (T)";
    case "C":
      return "Counters (C)";
    default:
      return "Other";
  }
}

export type AddressOption = { address: string; label?: string };
export type AddressOptionGroup = { groupLabel: string; options: AddressOption[] };

/**
 * UX/UI refinement Task 3: buckets a flat address list (as already returned
 * by contactAddressOptions/numericAddressOptions/outputAddressOptions) into
 * ordered `<optgroup>`-ready sections, attaching each custom variable's
 * declared label so the dropdown can show "X0 - เซ็นเซอร์หน้า" instead of a
 * bare address - a no-typo picker the student clicks through rather than
 * types into. Grouping is derived purely from the address string itself
 * (classifyAddressGroup), so this works unchanged for the built-in I/Q
 * addresses that have no DeclaredVariable entry at all.
 */
export function groupAddressOptions(addresses: string[], customVariables: DeclaredVariable[] = []): AddressOptionGroup[] {
  const labelByAddress = new Map(customVariables.filter((v) => v.label).map((v) => [v.address, v.label as string]));
  const groupOrder: string[] = [];
  const byGroup = new Map<string, AddressOption[]>();
  for (const address of addresses) {
    const groupLabel = classifyAddressGroup(address);
    if (!byGroup.has(groupLabel)) {
      byGroup.set(groupLabel, []);
      groupOrder.push(groupLabel);
    }
    byGroup.get(groupLabel)!.push({ address, label: labelByAddress.get(address) });
  }
  return groupOrder.map((groupLabel) => ({ groupLabel, options: byGroup.get(groupLabel)! }));
}

const INPUT_PREFIXES = new Set(["I", "X"]);
const OUTPUT_FAMILY_PREFIXES = new Set(["Q", "Y", "M"]);

function addressPrefixLetters(address: string): string {
  return address.match(/^[A-Za-z]+/)?.[0] ?? "";
}

/** True for I/X-prefixed addresses (the two aliased digital-input conventions). */
export function isInputAddress(address: string): boolean {
  return INPUT_PREFIXES.has(addressPrefixLetters(address));
}

/** True for Q/Y/M-prefixed addresses (coils, aliased outputs, and internal relays - all backed by the same memory.coils store). */
export function isOutputFamilyAddress(address: string): boolean {
  return OUTPUT_FAMILY_PREFIXES.has(addressPrefixLetters(address));
}

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

/**
 * Phase 11: a comparison instruction occupying a branch cell, same as a
 * Contact - passes power (continuity = true) when the comparison holds.
 * `sourceA` and `sourceB` (when a register) read numeric values via
 * readNumeric(): AI0-AI15 analog inputs, or a timer/counter's .ACC/.PRE.
 * Distinguished from Contact purely by the `kind` discriminant (Contact has
 * no `kind` field), so existing serialized `{type, address}` contacts remain
 * valid members of the widened Branch.cells union without any migration.
 */
export type ComparisonOperator = ">" | "<" | "==" | ">=" | "<=";
export type ComparisonOperand = { kind: "constant"; value: number } | { kind: "register"; address: string };
export type ComparisonBlock = {
  kind: "COMPARE";
  operator: ComparisonOperator;
  sourceA: string | null;
  sourceB: ComparisonOperand;
};

export function isComparisonBlock(cell: Contact | ComparisonBlock | null): cell is ComparisonBlock {
  return cell !== null && "kind" in cell && cell.kind === "COMPARE";
}

export type BranchCell = Contact | ComparisonBlock;

export type Branch = {
  /** Fixed-length row of contact/comparison slots; null = empty slot. */
  cells: (BranchCell | null)[];
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

/** Task 3: a rung's right rail can hold several outputs, all driven by the same rung-energized signal (real PLCs allow stacking multiple coils/SET/RESET/TIMER/COUNTER off one rung). */
export const MAX_OUTPUTS_PER_RUNG = 3;

export type Rung = {
  id: string;
  branches: Branch[];
  outputs: Output[];
};

export type LadderProgram = {
  rungs: Rung[];
};

export type TimerMemory = { acc: number; preset: number; done: boolean; en: boolean };
export type CounterMemory = {
  cv: number;
  preset: number;
  done: boolean;
  variant: CounterVariant;
  /** Rung-energized state as of the previous scan, for rising-edge detection. */
  prevEnergized: boolean;
  en: boolean;
};

export type SimMemory = {
  coils: Record<string, boolean>;
  timers: Record<string, TimerMemory>;
  counters: Record<string, CounterMemory>;
};

export type Inputs = Record<string, boolean>;

/** Phase 11: AI0-AI15 analog input values, 0-32767 (raw ADC-style range). Separate store from the boolean Inputs. */
export type AnalogInputs = Record<string, number>;
export const ANALOG_INPUT_ADDRESSES = Array.from({ length: MAX_ANALOG_VARIABLE_NUMBER + 1 }, (_, i) => `AI${i}`);
export const MIN_ANALOG_VALUE = 0;
export const MAX_ANALOG_VALUE = 32767;

export function clampAnalogValue(value: number): number {
  return Math.max(MIN_ANALOG_VALUE, Math.min(MAX_ANALOG_VALUE, Math.round(value)));
}

export function createEmptyBranch(): Branch {
  return { cells: Array.from({ length: COLS_PER_BRANCH }, () => null) };
}

export function createEmptyRung(id: string): Rung {
  return { id, branches: [createEmptyBranch()], outputs: [] };
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

/** Address dropdown options for a given output kind, plus any custom X/Y/M variables declared in the current session. */
export function outputAddressOptions(kind: OutputKind, customVariables: DeclaredVariable[] = []): string[] {
  const customOutputs = customAddressesByKind(customVariables, "output");
  const customRelays = customAddressesByKind(customVariables, "relay");

  switch (kind) {
    case "COIL":
    case "SET":
      return [...COIL_ADDRESSES, ...customOutputs, ...customRelays];
    case "TIMER":
      return [...TIMER_ADDRESSES];
    case "COUNTER":
      return [...COUNTER_ADDRESSES];
    case "RESET":
      return [...COIL_ADDRESSES, ...customOutputs, ...customRelays, ...TIMER_ADDRESSES, ...COUNTER_ADDRESSES];
  }
}

/** Addresses usable as a contact input: raw inputs, coils, custom X/Y/M variables, and timer/counter .DN/.EN bits. */
export function contactAddressOptions(program: LadderProgram, customVariables: DeclaredVariable[] = []): string[] {
  const statusBits = program.rungs
    .flatMap((r) => r.outputs)
    .filter(
      (o): o is Extract<Output, { kind: "TIMER" | "COUNTER" }> =>
        !!o && (o.kind === "TIMER" || o.kind === "COUNTER") && !!o.address
    )
    .flatMap((o) => [`${o.address}.DN`, `${o.address}.EN`]);

  const customInputs = customAddressesByKind(customVariables, "input");
  const customOutputs = customAddressesByKind(customVariables, "output");
  const customRelays = customAddressesByKind(customVariables, "relay");

  return [
    ...INPUT_ADDRESSES,
    ...customInputs,
    ...COIL_ADDRESSES,
    ...customOutputs,
    ...customRelays,
    ...statusBits,
  ];
}

/** Numeric sources usable in a comparison block: declared analog inputs, plus any placed timer/counter .ACC/.PRE registers. */
export function numericAddressOptions(program: LadderProgram, customVariables: DeclaredVariable[] = []): string[] {
  const registers = program.rungs
    .flatMap((r) => r.outputs)
    .filter(
      (o): o is Extract<Output, { kind: "TIMER" | "COUNTER" }> =>
        !!o && (o.kind === "TIMER" || o.kind === "COUNTER") && !!o.address
    )
    .flatMap((o) => [`${o.address}.ACC`, `${o.address}.PRE`]);

  return [...customAddressesByKind(customVariables, "analog_input"), ...registers];
}

/**
 * Whether `address` is already claimed by another output in a way that
 * would conflict with placing `candidateKind` there. Checks every output in
 * the program - including sibling outputs stacked on the same rung (Task 3)
 * - except the one at `excludeRungId`/`excludeOutputIndex` (the output
 * currently being edited, which trivially "conflicts" with its own address).
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
  excludeRungId: string,
  excludeOutputIndex: number
): boolean {
  const conflictingKinds: OutputKind[] =
    candidateKind === "RESET"
      ? []
      : candidateKind === "SET"
        ? ["COIL"]
        : candidateKind === "COIL"
          ? ["COIL", "SET"]
          : [candidateKind];

  return program.rungs.some((r) =>
    r.outputs.some(
      (o, i) =>
        !(r.id === excludeRungId && i === excludeOutputIndex) &&
        o.address === address &&
        conflictingKinds.includes(o.kind)
    )
  );
}
