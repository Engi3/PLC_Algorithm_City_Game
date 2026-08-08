/**
 * Task 4d: "Count & Dispatch" - new Factory chapter 7, levels 51-58,
 * APPENDED after the existing 1-50 (generate-factory-50.ts, untouched)
 * rather than replacing anything. Fills the one real gap found in the
 * Factory-50 track: Timer+Analog combos are common (chapter 3's sorting
 * robot), but Counter (CTU/CTD) never appears combined with either -
 * counters only exist in the legacy shared 1-100 track's own isolated
 * Counters chapter. This chapter requires all three on one output at once:
 * count N items past the sensor (CTU C0), THEN wait 5 seconds (TON T0)
 * once the count completes, THEN only light the dispatch signal (Y7) once
 * the tank has ALSO filled past a threshold (AI1) - matching the spec's
 * "count 10 boxes, wait 5 seconds, then dispatch" example, adapted to
 * Factory's own address map (no AGV here - that's Hybrid's job, see
 * generate-hybrid-50.ts).
 *
 * Y7 is reused as a pure dispatch signal, not the traffic-light gate
 * (`gateEnabled` stays unset/false) - the gate physically sits UPSTREAM of
 * the counting sensor (GATE_POSITION=35 < SENSOR_POSITION=55 in
 * factory-plc-binding.ts), so gating items before they can even reach the
 * sensor would make "count N, then open the gate" structurally impossible
 * (nothing could ever be counted). The belt runs continuously instead;
 * Y7 just reports "count done AND timer done AND tank full" as a single
 * combined AND, all three conditions genuinely load-bearing (self-verified
 * below, not hand-guessed).
 *
 * Every level is self-verified against the real engine before being
 * written out.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-factory-count-dispatch.ts
 */
import { writeFileSync } from "fs";
import { NC, NO, COIL, CTU, TON, CMPCONST, seriesRung, program } from "./grid-builders";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createFactoryGameState, factoryBinding } from "../../src/lib/games/factory-plc-binding";
import type { ConveyorItem, FactoryState } from "../../src/lib/games/factory-types";
import type { GameLevelSpec, SuccessCondition } from "../../src/lib/games/game-level-types";

const FIRST_LEVEL_NUMBER = 51;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `f7_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}
function factory(items: ConveyorItem[]): FactoryState {
  return { conveyorRunning: false, items, tankLevel: 0, pusherExtended: false, heaterOn: false, temperature: 0 };
}
function item(id: string, position: number): ConveyorItem {
  return { id, position };
}

/**
 * Counts N items past the sensor (CTU C0), waits `waitTicks` once counting
 * completes (TON T0, gated on C0.DN), then lights Y7 only once BOTH the
 * timer is done AND the tank has filled past `tankThreshold` - three
 * independent condition types (counter/timer/analog) ANDed into one coil.
 */
function countAndDispatch(count: number, waitTicks: number, tankThreshold: number): GridProgram {
  return program(
    rung([NC("X9")], COIL("Y0")),
    rung([NO("X0")], CTU("C0", count)),
    rung([NO("C0.DN")], TON("T0", waitTicks)),
    rung([NO("C0.DN"), NO("T0.DN"), CMPCONST(">=", "AI1", tankThreshold)], COIL("Y7"))
  );
}

type Def = { title: string; description: string; count: number; waitSeconds: number; tankThreshold: number };
const TICKS_PER_SECOND = 5; // matches DEFAULT_TICKS_PER_SECOND (use-game-plc-bridge.ts) - these levels ship ticks_per_second: null, so the default applies.

const DEFS: Def[] = [
  { title: "แนะนำนับและจ่ายสินค้า", description: "นับสินค้าให้ครบ 3 ชิ้นด้วยตัวนับ แล้วรอ 2 วินาที ก่อนเปิดสัญญาณจ่ายสินค้า (Y7)", count: 3, waitSeconds: 2, tankThreshold: 200 },
  { title: "ล็อตใหญ่ขึ้น", description: "นับสินค้าให้ครบ 5 ชิ้น แล้วรอ 3 วินาที ก่อนเปิดสัญญาณจ่ายสินค้า", count: 5, waitSeconds: 3, tankThreshold: 400 },
  { title: "รอเต็ม 5 วินาที", description: "นับสินค้าให้ครบ 5 ชิ้น แล้วรอให้ครบ 5 วินาทีเต็มก่อนเปิดสัญญาณจ่ายสินค้า", count: 5, waitSeconds: 5, tankThreshold: 600 },
  { title: "เพิ่มเงื่อนไขถังน้ำ", description: "นับสินค้าให้ครบ 8 ชิ้น รอ 5 วินาที และระดับถังน้ำ (AI1) ต้องถึงเกณฑ์ด้วย - ต้องจริงทั้งสามเงื่อนไขพร้อมกัน", count: 8, waitSeconds: 5, tankThreshold: 800 },
  { title: "เกณฑ์ถังน้ำสูงขึ้น", description: "เหมือนด่านก่อนหน้า แต่เกณฑ์ถังน้ำสูงขึ้น", count: 8, waitSeconds: 5, tankThreshold: 1000 },
  { title: "นับสิบชิ้น รอห้าวินาที", description: "นับสินค้าให้ครบ 10 ชิ้น แล้วรอ 5 วินาที ก่อนเปิดสัญญาณจ่ายสินค้า (ตามสเปคมาตรฐาน)", count: 10, waitSeconds: 5, tankThreshold: 1000 },
  { title: "ล็อตสิบชิ้น รอนานขึ้น", description: "นับสินค้าให้ครบ 10 ชิ้น รอ 6 วินาที และเกณฑ์ถังน้ำสูงขึ้น", count: 10, waitSeconds: 6, tankThreshold: 1200 },
  {
    title: "บทสรุปหมวดนับและจ่ายสินค้า",
    description: "ด่านสรุป: นับสินค้าให้ครบ 12 ชิ้น รอ 5 วินาที และระดับถังน้ำต้องถึงเกณฑ์สูงสุด ก่อนเปิดสัญญาณจ่ายสินค้า",
    count: 12,
    waitSeconds: 5,
    tankThreshold: 1400,
  },
];

const HINTS = [
  "ใช้ CTU ชื่อ C0 นับจำนวนชิ้นงานที่ผ่านเซนเซอร์ (NO(X0)) จนครบ - C0.DN จะติดเมื่อนับครบ",
  "ต่อ NO(C0.DN) เข้า TON ชื่อ T0 เพื่อเริ่มหน่วงเวลาทันทีที่นับครบ",
  "Y7 (สัญญาณจ่ายสินค้า) ต้องติดก็ต่อเมื่อ C0.DN ติด, T0.DN ติด, และ AI1 (ระดับถังน้ำ) ถึงเกณฑ์ - ทั้งสามเงื่อนไขต้องจริงพร้อมกัน (ต่ออนุกรมกันทั้งหมด)",
  "ถังน้ำเติมเองอัตโนมัติตลอดเวลา ไม่ต้องเปิดวาล์วใดๆ - แค่ตรวจสอบ AI1 ด้วย CMP (>=)",
];

type LevelDef = {
  levelNumber: number;
  title: string;
  description: string;
  hints: string[];
  factoryInitial: FactoryState;
  successConditions: SuccessCondition[];
  timeLimitTicks: number;
  solution: GridProgram;
};

// Minimum gap between consecutive items so the sensor window (|pos-55|<=3,
// width 7) never holds two items at once - two items simultaneously "in
// window" would mean X0 never drops false between them, so CTU only sees
// ONE rising edge for what should be two separate counts. 12 (well above
// the ~7 theoretical minimum) leaves margin for tick-alignment rounding.
const ITEM_SPACING = 12;
// Anchors the item closest to the sensor (spawned last in belt order) at
// position 40 - comfortably behind the window (52) regardless of item
// count. Earlier items are staggered further back (negative positions are
// fine - the engine only ever adds ITEM_SPEED_PER_TICK, no floor at 0), so
// scaling up item count never pushes anything past the sensor at spawn.
const LAST_ITEM_ANCHOR = 40;

const levels: LevelDef[] = DEFS.map((d, i) => {
  const items: ConveyorItem[] = Array.from({ length: d.count }, (_, n) =>
    item(String.fromCharCode(97 + n), LAST_ITEM_ANCHOR - (d.count - 1 - n) * ITEM_SPACING)
  );
  const waitTicks = d.waitSeconds * TICKS_PER_SECOND;

  // The item spawned furthest back (index 0) is both the last to cross the
  // sensor (so it gates C0.DN) and the last to reach the belt end (so it
  // gates process_items) - generous margins, not hand-tuned; verifyLevel()
  // below is the real check.
  const firstStart = LAST_ITEM_ANCHOR - (d.count - 1) * ITEM_SPACING;
  const exitTicks = Math.ceil((100 - firstStart) / 3) + 10;
  const countTicks = Math.ceil((55 - firstStart) / 3) + 10;
  const tankTicks = Math.ceil(d.tankThreshold / 40) + 10;
  const timeLimitTicks = Math.max(exitTicks, countTicks + waitTicks, tankTicks) + 20;

  return {
    levelNumber: FIRST_LEVEL_NUMBER + i,
    title: d.title,
    description: d.description,
    hints: HINTS,
    factoryInitial: factory(items),
    successConditions: [
      { kind: "process_items", target: d.count },
      { kind: "bit", address: "C0.DN", expected: true },
      { kind: "bit", address: "Y7", expected: true },
    ],
    timeLimitTicks,
    solution: countAndDispatch(d.count, waitTicks, d.tankThreshold),
  };
});

function runFactory(spec: GameLevelSpec, initial: FactoryState, solution: GridProgram, maxTicks: number) {
  let run: GameRunState = { factory: createFactoryGameState(initial) };
  let memory: SimMemory = createEmptyMemory();
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const { inputs, analogInputs } = factoryBinding.readInputs(run.factory!);
    const { memory: nextMemory } = runGridScan(solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = { factory: factoryBinding.step(run.factory!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }
  return outcome;
}

function toSpec(def: LevelDef): GameLevelSpec {
  return {
    levelNumber: def.levelNumber,
    title: def.title,
    description: def.description,
    hints: def.hints,
    gameType: "FACTORY",
    factoryInitial: def.factoryInitial,
    successConditions: def.successConditions,
    timeLimitTicks: def.timeLimitTicks,
  };
}

function verifyLevel(def: LevelDef): string | null {
  const spec = toSpec(def);
  const outcome = runFactory(spec, def.factoryInitial, def.solution, def.timeLimitTicks + 15);
  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): reference solution did not win within ${def.timeLimitTicks + 15} ticks - final outcome ${JSON.stringify(outcome)}`;
  }
  return null;
}

type GameLevelRowOut = {
  level_number: number;
  game_type: "FACTORY";
  title: string;
  description: string;
  hints: string[];
  map_layout_json: null;
  robot_start_json: null;
  factory_initial_json: unknown;
  success_conditions_json: unknown;
  safety_constraints_json: unknown;
  time_limit_ticks: number | null;
  ticks_per_second: number | null;
  reference_grid_program_json: unknown;
};

function toRow(def: LevelDef): GameLevelRowOut {
  return {
    level_number: def.levelNumber,
    game_type: "FACTORY",
    title: def.title,
    description: def.description,
    hints: def.hints,
    map_layout_json: null,
    robot_start_json: null,
    factory_initial_json: def.factoryInitial,
    success_conditions_json: def.successConditions,
    safety_constraints_json: [],
    time_limit_ticks: def.timeLimitTicks,
    ticks_per_second: null,
    reference_grid_program_json: def.solution,
  };
}

function main() {
  const errors: string[] = [];
  for (const def of levels) {
    const err = verifyLevel(def);
    if (err) errors.push(err);
  }
  if (errors.length > 0) {
    console.error(`${errors.length} level(s) failed self-verification:`);
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }

  console.log(`Self-verified ${levels.length} count-and-dispatch levels, levels ${FIRST_LEVEL_NUMBER}-${FIRST_LEVEL_NUMBER + levels.length - 1}.`);

  const rows = levels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-factory-count-dispatch.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
