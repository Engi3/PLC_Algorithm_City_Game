/**
 * One item riding the conveyor belt. `position` is 0 (spawn end) to 100
 * (discharge end), matching how the belt is laid out left-to-right
 * regardless of pixel width. `defective` is the item's own ground-truth
 * quality - what a color/size sensor (X1 in the standardized I/O map, see
 * factory-plc-binding.ts) actually detects. `rejected` is a separate,
 * derived flag: whether the pusher (Y1) has actually kicked it off-line yet
 * - a defective item the student's logic never reacts to stays
 * `defective: true, rejected: false` and rides straight through, which is
 * exactly the failure mode a real QA station needs to be able to represent.
 */
export type ConveyorItem = {
  id: string;
  position: number;
  defective?: boolean;
  rejected?: boolean;
  /** Which bin (0/1/2) a sorting-robot level's item genuinely belongs in - undefined for every level that doesn't use the sorting-robot mechanic (all 40 original Factory levels), so their items are never touched by sort bookkeeping. */
  category?: 0 | 1 | 2;
};

/**
 * The full visual state FactoryEngine renders - a plain snapshot, not
 * simulation logic. Analog fields (`tankLevel`, `temperature`) use the same
 * 0-32767 raw range as the ladder engine's AI0-AI15 addresses
 * (MIN_ANALOG_VALUE/MAX_ANALOG_VALUE in lib/ladder/types.ts), so a PLC
 * binding can feed them through unscaled - level authors pick whatever
 * round thresholds read naturally (e.g. 8000, 32000) the same way existing
 * Levels/Challenges already do.
 *
 * `robotArmExtended`/`conveyorReversed`/`redOn`/`yellowOn`/`greenOn` are the
 * 3 new Factory mechanics (sorting robot / reversible conveyor / traffic
 * light) - all optional and all purely output-driven (Y3/Y4/Y5/Y6/Y7), so a
 * level whose reference solution never touches those addresses behaves
 * exactly as before. `gateEnabled` is the one exception that needs an
 * explicit opt-in: the traffic-light gate would otherwise block every
 * existing Factory level's conveyor at GATE_POSITION forever, since their
 * solutions never energize Y7 (green) either - see factory-plc-binding.ts.
 */
export type FactoryState = {
  conveyorRunning: boolean;
  items: ConveyorItem[];
  tankLevel: number; // 0-32767
  pusherExtended: boolean;
  heaterOn: boolean;
  temperature: number; // 0-32767
  robotArmExtended?: boolean;
  conveyorReversed?: boolean;
  gateEnabled?: boolean;
  redOn?: boolean;
  yellowOn?: boolean;
  greenOn?: boolean;
};

export function createEmptyFactoryState(): FactoryState {
  return {
    conveyorRunning: false,
    items: [],
    tankLevel: 0,
    pusherExtended: false,
    heaterOn: false,
    temperature: 0,
  };
}
