/**
 * Batch 3 (levels 41-60, "ตัวนับ" / Counters) of the 100-level Game
 * Engines curriculum - see generate-game-levels.ts for shared design notes.
 *
 * Maze levels (41-50) reuse batch 1's maps, wired with a CTU counter (C0)
 * on NO(X0) - counts real wall-encounter events (one rising edge per
 * junction, verified safe in batch 1's design notes: every junction in
 * these maps resolves in a single tick, so X0 never re-rises mid-turn).
 * Rather than hand-tracing each map's exact junction count (error-prone
 * for the bigger mazes), this generator MEASURES it directly: it runs each
 * map's normal turn-logic once with the counter attached and an
 * intentionally-loose success condition, captures the real C0.ACC at the
 * winning tick, and uses that measured number as the level's actual
 * target - then re-verifies the complete level (now with its real,
 * measured success condition) before writing it out.
 *
 * Factory levels (51-60) layer a CTD "batch remaining" countdown counter
 * (C0, preset = batch size, one rising edge per item entering the sensor
 * zone) on top of batch 2's timed-auto-reject logic - success requires
 * both C0.DN (every item in the batch has been seen) and the correct
 * count of good items actually processed.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-game-levels-41-60.ts
 *   npm run seed:game-levels -- ./scripts/level-gen/game-levels-41-60.json
 */
import { writeFileSync } from "fs";
import { NO, NC, SET, RESET, COIL, TON, CTU, CTD, seriesRung, program } from "./grid-builders";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, mazeBinding } from "../../src/lib/games/maze-plc-binding";
import { createFactoryGameState, factoryBinding } from "../../src/lib/games/factory-plc-binding";
import type { MazeMap, MazeRobotState } from "../../src/lib/games/maze-types";
import type { FactoryState } from "../../src/lib/games/factory-types";
import type { GameLevelSpec, GameType, SuccessCondition } from "../../src/lib/games/game-level-types";
import type { SafetyConstraint } from "../../src/lib/ladder/challenge-types";
import type { SimMemory } from "../../src/lib/ladder/types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `gl41_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}

function turnCountedRight(): GridProgram {
  return program(rung([NC("X0")], COIL("Y0")), rung([NO("X0")], COIL("Y2")), rung([NO("X0")], CTU("C0", 99)));
}
function turnCountedLeft(): GridProgram {
  return program(rung([NC("X0")], COIL("Y0")), rung([NO("X0")], COIL("Y1")), rung([NO("X0")], CTU("C0", 99)));
}
function decisionCounted(): GridProgram {
  return program(
    rung([NC("X0")], COIL("Y0")),
    rung([NO("X0"), NC("X2")], COIL("Y2")),
    rung([NO("X0"), NO("X2")], COIL("Y1")),
    rung([NO("X0")], CTU("C0", 99))
  );
}
/** Level 41's simplest intro: power-on pulse counted once, straight path (no real turns to count yet). */
function powerOnCounted(): GridProgram {
  return program(rung([NC("X0")], COIL("Y0")), rung([NC("X9")], CTU("C0", 99)));
}

type LevelDef = {
  levelNumber: number;
  title: string;
  description: string;
  hints: string[];
  gameType: GameType;
  mapLayout?: MazeMap;
  robotStart?: MazeRobotState;
  factoryInitial?: FactoryState;
  successConditions: SuccessCondition[];
  safetyConstraints?: SafetyConstraint[];
  timeLimitTicks?: number;
  solution: GridProgram;
};

function factory(items: FactoryState["items"]): FactoryState {
  return { conveyorRunning: false, items, tankLevel: 0, pusherExtended: false, heaterOn: false, temperature: 0 };
}

/** Runs `solution` to a win against reach_goal alone and returns the counter's final C0.ACC - used to measure each maze's real turn count instead of hand-tracing it. */
function measureMazeCounterAcc(map: MazeMap, start: MazeRobotState, solution: GridProgram, maxTicks: number): number {
  const spec: GameLevelSpec = {
    levelNumber: 0,
    gameType: "MAZE",
    title: "measure",
    description: "measure",
    mapLayout: map,
    robotStart: start,
    successConditions: [{ kind: "reach_goal" }],
  };
  let run: GameRunState = { maze: createMazeGameState(map, start) };
  let memory: SimMemory = createEmptyMemory();
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const { inputs, analogInputs } = mazeBinding.readInputs(run.maze!);
    const { memory: nextMemory } = runGridScan(solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = { maze: mazeBinding.step(run.maze!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }
  if (outcome.status !== "won") throw new Error(`measureMazeCounterAcc: reference solution never won for map starting ${JSON.stringify(start)}`);
  return memory.counters["C0"]?.cv ?? 0;
}

const MAZE_DEFS: { map: MazeMap; start: MazeRobotState; title: string; description: string; solution: GridProgram; maxTicks: number }[] = [
  {
    map: [["PATH", "PATH", "PATH", "GOAL"]],
    start: { x: 0, y: 0, direction: "E" },
    title: "นับสัญญาณเริ่มทำงาน",
    description: "ด่านแนะนำตัวนับ: ต่อ CTU ชื่อ C0 กับสัญญาณเริ่มทำงาน (X9) แล้วเดินหน้าไปเป้าหมาย",
    solution: powerOnCounted(),
    maxTicks: 15,
  },
  {
    map: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "นับจำนวนครั้งที่เลี้ยวขวา",
    description: "ต่อ CTU (C0) นับทุกครั้งที่เจอกำแพงข้างหน้า (X0) แล้วเดินไปเป้าหมายให้ครบตามจำนวนครั้งที่นับได้",
    solution: turnCountedRight(),
    maxTicks: 15,
  },
  {
    map: [
      ["WALL", "PATH", "PATH"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 2, y: 0, direction: "W" },
    title: "นับจำนวนครั้งที่เลี้ยวซ้าย",
    description: "เหมือนด่านก่อนหน้าแต่เลี้ยวซ้ายแทน",
    solution: turnCountedLeft(),
    maxTicks: 15,
  },
  {
    map: [
      ["PATH", "PATH", "PATH", "PATH", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["GOAL", "PATH", "PATH", "PATH", "PATH"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "นับเลี้ยวขวาต่อเนื่อง",
    description: "เขาวงกตรูปตัว Z ที่มีจุดเลี้ยวขวาหลายจุด นับให้ครบทุกจุด",
    solution: turnCountedRight(),
    maxTicks: 20,
  },
  {
    map: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "นับทางแยกตัดสินใจสองด้าน",
    description: "ใช้กฎตัดสินใจสองด้าน พร้อมนับจำนวนทางแยกที่ผ่าน",
    solution: decisionCounted(),
    maxTicks: 15,
  },
  {
    map: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 0, y: 1, direction: "E" },
    title: "นับแล้วยังต้องระวังกับดัก",
    description: "นับจำนวนครั้งที่เลี้ยวขวา และห้ามพลาดเข้ากับดักด้วย",
    solution: turnCountedRight(),
    maxTicks: 15,
  },
  {
    map: [
      ["PATH", "PATH", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "นับทางแยกซ้ำ",
    description: "เขาวงกตทางแยกซ้ำ นับจำนวนทางแยกทั้งหมดที่ผ่าน",
    solution: decisionCounted(),
    maxTicks: 20,
  },
  {
    map: [
      ["PATH", "PATH", "WALL", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL", "WALL"],
      ["WALL", "WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "นับเขาวงกตซับซ้อน",
    description: "เขาวงกตซับซ้อนขึ้น นับจำนวนทางแยกทั้งหมด",
    solution: decisionCounted(),
    maxTicks: 25,
  },
  {
    map: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 1, direction: "E" },
    title: "นับทางแยกอันตราย",
    description: "ทางแยกตัดสินใจสองด้าน พร้อมกับดักที่ต้องระวัง และนับทางแยกทั้งหมด",
    solution: decisionCounted(),
    maxTicks: 20,
  },
  {
    map: [
      ["PATH", "PATH", "PATH", "PATH", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["GOAL", "PATH", "PATH", "PATH", "PATH"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "บทสรุปหมวดตัวนับ (เขาวงกต)",
    description: "ด่านสรุปฝั่งเขาวงกตของหมวดตัวนับ: เขาวงกตรูปตัว U นับจำนวนครั้งที่เลี้ยวขวา",
    solution: turnCountedRight(),
    maxTicks: 25,
  },
];

const levels: LevelDef[] = MAZE_DEFS.map((d, i) => {
  const measured = measureMazeCounterAcc(d.map, d.start, d.solution, d.maxTicks);
  return {
    levelNumber: 41 + i,
    title: d.title,
    description: `${d.description} (ต้องนับให้ได้อย่างน้อย ${measured} ครั้งก่อนถึงเป้าหมาย)`,
    hints: [
      "ใช้บล็อกตัวนับ CTU ชื่อ C0 - นับขึ้นทุกครั้งที่สัญญาณอินพุตเปลี่ยนจากปิดเป็นเปิด (rising edge)",
      "ต่อหน้าสัมผัส NO กับ X0 (หรือ X9 สำหรับด่านแรก) เข้ากับ CTU C0",
    ],
    gameType: "MAZE",
    mapLayout: d.map,
    robotStart: d.start,
    successConditions: [{ kind: "reach_goal" }, { kind: "numeric", address: "C0.ACC", operator: ">=", value: measured }],
    timeLimitTicks: d.maxTicks,
    solution: d.solution,
  };
});

// --- FACTORY 51-60: timed reject (batch 2) + CTD batch-remaining countdown ---
function timedRejectWithBatchCountdown(preset: number, batchSize: number): GridProgram {
  return program(
    rung([NC("X9")], COIL("Y0")),
    rung([NO("X1")], SET("M0")),
    rung([NO("M0")], TON("T0", preset)),
    rung([NO("M0")], COIL("Y1")),
    rung([NO("T0.DN")], RESET("M0")),
    rung([NO("X0")], CTD("C0", batchSize))
  );
}

/**
 * Every item in a level here must physically pass through the fixed
 * SENSOR_POSITION window (55, ±3 - see factory-plc-binding.ts) for CTD to
 * ever see a rising edge on X0 and count it down, which caps every spawn
 * position at well under 52. That collides with wanting generous spacing
 * between defective items (each reject-hold needs ~preset ticks, i.e.
 * ~3*preset position-units, to fully clear before the NEXT item reaches
 * the pusher, or the hold window can bleed into a neighboring item and
 * mis-sort it) - so unlike batch 2's wide, arbitrarily-spaced multi-item
 * batches, these stay to 1-2 items, with any defective/next-item gap kept
 * above 3*preset (a higher spawn position always reaches the sensor AND
 * the pusher sooner, since every item moves at the same belt speed - so
 * placing the defective item at the LOWEST position in a pair keeps its
 * hold-window entirely after the other item has already cleared).
 */
const FACTORY_DEFS: { title: string; description: string; items: FactoryState["items"]; goodCount: number; preset: number }[] = [
  {
    title: "นับถอยหลังล็อตแรก",
    description: "ต่อ CTD ชื่อ C0 นับถอยหลังทุกครั้งที่มีสินค้าผ่านเซนเซอร์ (X0) ล็อตนี้มีของเสีย 1 ชิ้น",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    preset: 12,
  },
  {
    title: "นับถอยหลัง 2 ชิ้น",
    description: "ล็อต 2 ชิ้น ของดีผ่านไปก่อน ของเสียตามมาทีหลัง",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 36 },
    ],
    goodCount: 1,
    preset: 12,
  },
  {
    title: "นับถอยหลัง 2 ชิ้น สลับลำดับ",
    description: "ล็อต 2 ชิ้น สลับตำแหน่ง ของดียังผ่านไปก่อนของเสียเสมอ",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 40 },
    ],
    goodCount: 1,
    preset: 12,
  },
  {
    title: "นับถอยหลังของเสีย 2 ชิ้น",
    description: "ล็อต 2 ชิ้น เป็นของเสียทั้งคู่ ห่างกันพอให้ตัวจับเวลารีเซ็ตทันเวลา",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 40, defective: true },
    ],
    goodCount: 0,
    preset: 8,
  },
  {
    title: "นับถอยหลังจับเวลาสั้น",
    description: "ตัวจับเวลาสั้นลง (8 ติ๊ก) กับล็อต 1 ชิ้นที่เป็นของเสีย",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    preset: 8,
  },
  {
    title: "นับถอยหลังจับเวลาสั้น 2 ชิ้น",
    description: "ตัวจับเวลาสั้น (8 ติ๊ก) กับล็อต 2 ชิ้น ของดีผ่านก่อนของเสีย",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 30 },
    ],
    goodCount: 1,
    preset: 8,
  },
  {
    title: "นับถอยหลังของดีล้วน",
    description: "ล็อต 2 ชิ้น ของดีล้วน ไม่มีของเสีย",
    items: [
      { id: "a", position: 0 },
      { id: "b", position: 20 },
    ],
    goodCount: 2,
    preset: 8,
  },
  {
    title: "นับถอยหลังจับเวลายาว",
    description: "ตัวจับเวลายาวขึ้น (14 ติ๊ก) กับล็อต 2 ชิ้น เป็นของเสียทั้งคู่",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 46 },
    ],
    goodCount: 0,
    preset: 14,
  },
  {
    title: "นับถอยหลังผสมจับเวลายาว",
    description: "ตัวจับเวลายาว (14 ติ๊ก) กับล็อต 2 ชิ้น ของดีผ่านก่อนของเสีย",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 46 },
    ],
    goodCount: 1,
    preset: 14,
  },
  {
    title: "บทสรุปหมวดตัวนับ (สายพาน)",
    description: "ด่านสรุปฝั่งสายพานของหมวดตัวนับ: ของเสีย 2 ชิ้น ห่างกันพอดีให้ตัวจับเวลารีเซ็ตทันเวลา",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 40, defective: true },
    ],
    goodCount: 0,
    preset: 10,
  },
];

for (const [i, def] of FACTORY_DEFS.entries()) {
  levels.push({
    levelNumber: 51 + i,
    title: def.title,
    description: `${def.description} (ตัวนับถอยหลัง C0 preset = ${def.items.length}, ตัวจับเวลา T0 preset = ${def.preset} ติ๊ก)`,
    hints: [
      "ใช้วงจรดันของเสียแบบมีตัวจับเวลาเหมือนหมวดก่อนหน้า",
      "เพิ่มตัวนับถอยหลัง CTD ชื่อ C0 กับ preset เท่าจำนวนสินค้าทั้งล็อต ต่อกับหน้าสัมผัส NO(X0) - นับถอยหลังทุกครั้งที่มีสินค้าผ่านเซนเซอร์",
      "ด่านจะผ่านก็ต่อเมื่อ C0 นับถอยหลังครบ (C0.DN) และจำนวนของดีที่ผ่านออกไปถูกต้อง",
    ],
    gameType: "FACTORY",
    factoryInitial: factory(def.items),
    successConditions: [
      { kind: "bit", address: "C0.DN", expected: true },
      { kind: "process_items", target: def.goodCount },
    ],
    timeLimitTicks: Math.ceil((Math.max(...def.items.map((it) => it.position)) + 150) / 3),
    solution: timedRejectWithBatchCountdown(def.preset, def.items.length),
  });
}

function toSpec(def: LevelDef): GameLevelSpec {
  const common = {
    levelNumber: def.levelNumber,
    title: def.title,
    description: def.description,
    hints: def.hints,
    successConditions: def.successConditions,
    safetyConstraints: def.safetyConstraints,
    timeLimitTicks: def.timeLimitTicks,
  };
  if (def.gameType === "MAZE") return { ...common, gameType: "MAZE", mapLayout: def.mapLayout!, robotStart: def.robotStart! };
  if (def.gameType === "FACTORY") return { ...common, gameType: "FACTORY", factoryInitial: def.factoryInitial! };
  return { ...common, gameType: "HYBRID", mapLayout: def.mapLayout!, robotStart: def.robotStart!, factoryInitial: def.factoryInitial! };
}

function verifyLevel(def: LevelDef): string | null {
  const spec = toSpec(def);
  let run: GameRunState =
    def.gameType === "FACTORY"
      ? { factory: createFactoryGameState(def.factoryInitial!) }
      : { maze: createMazeGameState(def.mapLayout!, def.robotStart!) };
  let memory = createEmptyMemory();
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  const maxTicks = (def.timeLimitTicks ?? 100) + 5;

  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const binding = def.gameType === "FACTORY" ? factoryBinding : mazeBinding;
    const state = def.gameType === "FACTORY" ? run.factory! : run.maze!;
    const { inputs, analogInputs } = binding.readInputs(state as never);
    const { memory: nextMemory } = runGridScan(def.solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run =
      def.gameType === "FACTORY"
        ? { factory: factoryBinding.step(run.factory!, memory.coils, memory) }
        : { maze: mazeBinding.step(run.maze!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }

  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): reference solution did not win within ${maxTicks} ticks - final outcome ${JSON.stringify(outcome)}`;
  }
  return null;
}

type GameLevelRowOut = {
  level_number: number;
  game_type: GameType;
  title: string;
  description: string;
  hints: string[];
  map_layout_json: unknown;
  robot_start_json: unknown;
  factory_initial_json: unknown;
  success_conditions_json: unknown;
  safety_constraints_json: unknown;
  time_limit_ticks: number | null;
  ticks_per_second: number | null;
};

function toRow(def: LevelDef): GameLevelRowOut {
  return {
    level_number: def.levelNumber,
    game_type: def.gameType,
    title: def.title,
    description: def.description,
    hints: def.hints,
    map_layout_json: def.mapLayout ?? null,
    robot_start_json: def.robotStart ?? null,
    factory_initial_json: def.factoryInitial ?? null,
    success_conditions_json: def.successConditions,
    safety_constraints_json: def.safetyConstraints ?? [],
    time_limit_ticks: def.timeLimitTicks ?? null,
    ticks_per_second: null,
  };
}

function main() {
  const errors: string[] = [];
  for (const def of levels) {
    const err = verifyLevel(def);
    if (err) errors.push(err);
    else console.log(`OK  level ${def.levelNumber} (${def.title})`);
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} level(s) FAILED verification:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const rows = levels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-41-60.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nAll ${levels.length} levels verified. Wrote ${outPath}.`);
}

main();
