/**
 * Batch 2 (levels 21-40, "ตัวจับเวลา" / Timers) of the 100-level Game
 * Engines curriculum - see generate-game-levels.ts for the shared design
 * notes and self-verification discipline (every level's reference solution
 * is run through the real engine before being written to JSON).
 *
 * Maze levels (21-30) reuse the exact 10 maps from levels 1-10, gated
 * behind a TON startup-delay timer - the robot must not move until T0.DN.
 * Factory levels (31-40) solve the "reset the reject latch" problem Basic
 * Digital (11-20) deliberately deferred: a TON timer holds the reject
 * pulse for a fixed number of ticks, then auto-RESETs M0, so a batch with
 * multiple defective items can be sorted correctly with real physics
 * (checked via process_items counting only the genuinely-good items, not
 * a bit-only proxy like levels 14/15/18/20 used).
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-game-levels-21-40.ts
 *   npm run seed:game-levels -- ./scripts/level-gen/game-levels-21-40.json
 */
import { writeFileSync } from "fs";
import { NO, NC, SET, RESET, COIL, TON, seriesRung, program } from "./grid-builders";
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

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `gl21_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}

/** Startup-delay move, always-right turn - reuses PATTERN_B_RIGHT's turn rung, gates the move rung behind T0.DN. */
function startupDelayRight(preset: number): GridProgram {
  return program(
    rung([NC("X9")], TON("T0", preset)),
    rung([NC("X0"), NO("T0.DN")], COIL("Y0")),
    rung([NO("X0")], COIL("Y2"))
  );
}
function startupDelayLeft(preset: number): GridProgram {
  return program(
    rung([NC("X9")], TON("T0", preset)),
    rung([NC("X0"), NO("T0.DN")], COIL("Y0")),
    rung([NO("X0")], COIL("Y1"))
  );
}
/** Startup-delay move, AND-decision turn (Pattern D from batch 1). */
function startupDelayDecision(preset: number): GridProgram {
  return program(
    rung([NC("X9")], TON("T0", preset)),
    rung([NC("X0"), NO("T0.DN")], COIL("Y0")),
    rung([NO("X0"), NC("X2")], COIL("Y2")),
    rung([NO("X0"), NO("X2")], COIL("Y1"))
  );
}

/**
 * Timed auto-reject: conveyor always on; X1 -> SET M0; M0 enables a TON
 * timer; M0 -> Y1 (reject pulse); the timer's own .DN resets M0 once the
 * pulse has run long enough for the item to actually clear the pusher
 * zone. Grid order matters (see batch 1's DETECT_AND_REJECT_INTERLOCKED
 * comment) - SET must run before the TIMER rung reads M0, and the TIMER
 * rung must run before the RESET rung reads its .DN, so a single scan can
 * both start and (many ticks later) end a pulse cleanly.
 */
function timedAutoReject(preset: number): GridProgram {
  return program(
    rung([NC("X9")], COIL("Y0")),
    rung([NO("X1")], SET("M0")),
    rung([NO("M0")], TON("T0", preset)),
    rung([NO("M0")], COIL("Y1")),
    rung([NO("T0.DN")], RESET("M0"))
  );
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

// --- The 10 maze maps from batch 1 (levels 1-10), reused verbatim ---
const MAZE_MAPS: { map: MazeMap; start: MazeRobotState; title: string; description: string; solution: (p: number) => GridProgram }[] = [
  {
    map: [["PATH", "PATH", "PATH", "GOAL"]],
    start: { x: 0, y: 0, direction: "E" },
    title: "อุ่นเครื่องก่อนออกเดิน",
    description: "หุ่นยนต์ต้องรอให้ตัวจับเวลาอุ่นเครื่อง (T0) นับครบก่อน จึงจะเริ่มเดินหน้าไปเป้าหมายได้",
    solution: startupDelayRight,
  },
  {
    map: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "อุ่นเครื่องแล้วเลี้ยวขวา",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วค่อยเดินหน้า/เลี้ยวขวาตามด่านเดิม",
    solution: startupDelayRight,
  },
  {
    map: [
      ["WALL", "PATH", "PATH"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 2, y: 0, direction: "W" },
    title: "อุ่นเครื่องแล้วเลี้ยวซ้าย",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วค่อยเดินหน้า/เลี้ยวซ้ายตามด่านเดิม",
    solution: startupDelayLeft,
  },
  {
    map: [
      ["PATH", "PATH", "PATH", "PATH", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["GOAL", "PATH", "PATH", "PATH", "PATH"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "อุ่นเครื่องแล้วเลี้ยวขวาต่อเนื่อง",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วเดินตามทางเลี้ยวขวาต่อเนื่อง",
    solution: startupDelayRight,
  },
  {
    map: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "อุ่นเครื่องแล้วตัดสินใจสองด้าน",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วใช้กฎตัดสินใจสองด้านเหมือนเดิม",
    solution: startupDelayDecision,
  },
  {
    map: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 0, y: 1, direction: "E" },
    title: "อุ่นเครื่องแล้วระวังกับดัก",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วเลี้ยวขวาให้ถูก ห้ามพลาดเข้ากับดัก",
    solution: startupDelayRight,
  },
  {
    map: [
      ["PATH", "PATH", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "อุ่นเครื่องแล้วเขาวงกตทางแยกซ้ำ",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วผ่านเขาวงกตทางแยกซ้ำด้วยกฎตัดสินใจสองด้าน",
    solution: startupDelayDecision,
  },
  {
    map: [
      ["PATH", "PATH", "WALL", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL", "WALL"],
      ["WALL", "WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "อุ่นเครื่องแล้วเขาวงกตซับซ้อน",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วผ่านเขาวงกตซับซ้อนด้วยกฎเดิม",
    solution: startupDelayDecision,
  },
  {
    map: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 1, direction: "E" },
    title: "อุ่นเครื่องแล้วทางแยกอันตราย",
    description: "รอตัวจับเวลาอุ่นเครื่องก่อน แล้วใช้กฎตัดสินใจสองด้านให้ถูก ห้ามพลาดเข้ากับดัก",
    solution: startupDelayDecision,
  },
  {
    map: [
      ["PATH", "PATH", "PATH", "PATH", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["GOAL", "PATH", "PATH", "PATH", "PATH"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "บทสรุปหมวดตัวจับเวลา (เขาวงกต)",
    description: "ด่านสรุปฝั่งเขาวงกตของหมวดตัวจับเวลา: อุ่นเครื่องก่อน แล้วเดินเขาวงกตรูปตัว U",
    solution: startupDelayRight,
  },
];

const levels: LevelDef[] = MAZE_MAPS.map((m, i) => {
  const preset = 3 + (i % 3); // vary 3-5 ticks across the batch
  return {
    levelNumber: 21 + i,
    title: m.title,
    description: `${m.description} (T0 preset = ${preset} ติ๊ก)`,
    hints: [
      "ใช้บล็อกตัวจับเวลา TON ชื่อ T0 ต่อกับหน้าสัมผัส NC(X9) เพื่อให้เดินนับตลอดเวลา",
      "ต่อหน้าสัมผัส NO ที่อยู่ \"T0.DN\" อนุกรมกับ NC(X0) แล้วค่อยต่อไป Y0 - หุ่นยนต์จะเดินได้ก็ต่อเมื่อ T0 นับครบเท่านั้น",
    ],
    gameType: "MAZE",
    mapLayout: m.map,
    robotStart: m.start,
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 25 + preset,
    solution: m.solution(preset),
  };
});

// --- FACTORY 31-40: timed auto-reject/reset ---
const FACTORY_DEFS: {
  title: string;
  description: string;
  items: FactoryState["items"];
  goodCount: number;
  preset: number;
  withInterlockHint?: boolean;
}[] = [
  {
    title: "จับเวลาดันของเสีย",
    description: "ของเสีย 1 ชิ้น ใช้ตัวจับเวลาค้างจังหวะดันของออก แล้วรีเซ็ต M0 อัตโนมัติเมื่อครบเวลา",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    preset: 12,
  },
  {
    title: "ของดีตามหลังของเสีย",
    description: "ของเสีย 1 ชิ้น ตามด้วยของดี 1 ชิ้น ห่างกันพอสมควร - ตัวจับเวลาต้องรีเซ็ต M0 ทันเวลาก่อนของดีมาถึง",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 60 },
    ],
    goodCount: 1,
    preset: 12,
  },
  {
    title: "ของดีนำ ของเสียตาม",
    description: "ของดี 1 ชิ้นผ่านไปก่อน แล้วของเสียตามมาทีหลัง",
    items: [
      { id: "a", position: 0 },
      { id: "b", position: 60, defective: true },
    ],
    goodCount: 1,
    preset: 12,
  },
  {
    title: "ของเสียสองชิ้นห่างกัน",
    description: "ของเสีย 2 ชิ้น ห่างกันพอให้ตัวจับเวลาทำงานครบรอบก่อนของชิ้นถัดไปมาถึง",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 70, defective: true },
    ],
    goodCount: 0,
    preset: 12,
  },
  {
    title: "ผสมของดีของเสีย 3 ชิ้น",
    description: "ล็อตผสม: ดี-เสีย-ดี เรียงกัน ต้องดันเฉพาะชิ้นที่เสียออกเท่านั้น",
    items: [
      { id: "a", position: 0 },
      { id: "b", position: 55, defective: true },
      { id: "c", position: 115 },
    ],
    goodCount: 2,
    preset: 12,
  },
  {
    title: "ล็อตใหญ่ผสมของเสีย",
    description: "ล็อตใหญ่ขึ้น: ดี-ดี-เสีย-ดี เรียงกัน",
    items: [
      { id: "a", position: 0 },
      { id: "b", position: 45 },
      { id: "c", position: 90, defective: true },
      { id: "d", position: 150 },
    ],
    goodCount: 3,
    preset: 12,
  },
  {
    title: "จับเวลาสั้นลง",
    description: "ตัวจับเวลาสั้นลงกว่าเดิม (10 ติ๊ก) ยังต้องดันของเสียออกให้สำเร็จ",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    preset: 10,
  },
  {
    title: "จับเวลาสั้น ของดีตามติด",
    description: "ตัวจับเวลาสั้น (10 ติ๊ก) กับของดีตามหลังของเสียในระยะห่างที่ปลอดภัย",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 55 },
    ],
    goodCount: 1,
    preset: 10,
  },
  {
    title: "ล็อตผสมจับเวลาสั้น",
    description: "ล็อตผสมดี-เสีย-ดี-เสีย-ดี ด้วยตัวจับเวลาสั้น",
    items: [
      { id: "a", position: 0 },
      { id: "b", position: 45, defective: true },
      { id: "c", position: 100 },
      { id: "d", position: 145, defective: true },
      { id: "e", position: 200 },
    ],
    goodCount: 3,
    preset: 10,
  },
  {
    title: "บทสรุปหมวดตัวจับเวลา (สายพาน)",
    description: "ด่านสรุปฝั่งสายพานของหมวดตัวจับเวลา: ล็อตผสมขนาดใหญ่ที่สุดของหมวดนี้",
    items: [
      { id: "a", position: 0 },
      { id: "b", position: 45 },
      { id: "c", position: 90, defective: true },
      { id: "d", position: 150 },
      { id: "e", position: 195, defective: true },
      { id: "f", position: 250 },
    ],
    goodCount: 4,
    preset: 12,
  },
];

for (const [i, def] of FACTORY_DEFS.entries()) {
  levels.push({
    levelNumber: 31 + i,
    title: def.title,
    description: `${def.description} (ตัวจับเวลา T0 preset = ${def.preset} ติ๊ก)`,
    hints: [
      "X1 -> SET M0 เมื่อพบของเสีย",
      "M0 -> TON T0 (preset ตามที่กำหนด) เพื่อค้างจังหวะดันของออก",
      "M0 -> Y1 (ดันของออก) และ T0.DN -> RESET M0 เพื่อให้พร้อมรับของเสียชิ้นถัดไป",
    ],
    gameType: "FACTORY",
    factoryInitial: factory(def.items),
    successConditions: [{ kind: "process_items", target: def.goodCount }],
    timeLimitTicks: Math.ceil((def.items[def.items.length - 1].position + 150) / 3),
    solution: timedAutoReject(def.preset),
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
  const outPath = "./scripts/level-gen/game-levels-21-40.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nAll ${levels.length} levels verified. Wrote ${outPath}.`);
}

main();
