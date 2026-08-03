/**
 * Batch 4 (levels 61-80, "อนาล็อกและคณิตศาสตร์" / Analog & Math) of the
 * 100-level Game Engines curriculum - see generate-game-levels.ts for
 * shared design notes.
 *
 * Maze levels (61-70) reuse batch 1's maps and turn-logic (Pattern
 * B-right/left/D) completely unchanged, adding one CMP block reading AI0
 * (distance-to-goal) into an internal relay M0 as a "getting close"
 * proximity indicator - required as an extra success condition alongside
 * reach_goal. The exact threshold is MEASURED (not hand-computed) by
 * dry-running each map's normal turn-logic once and capturing the real
 * minimum AI0 the robot ever reads, same discipline batch 3 used for its
 * counter targets.
 *
 * Factory levels (71-80) introduce a tank-level interlock (CMP AI1>=T
 * gates the heater) and, from level 66 on, bang-bang temperature control
 * (CMP AI1>=T AND CMP AI2<target -> Y2, auto-shutoff the instant the
 * target is first reached) - directly foreshadowing the Level 100 boss
 * scenario's dry-boil interlock.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-game-levels-61-80.ts
 *   npm run seed:game-levels -- ./scripts/level-gen/game-levels-61-80.json
 */
import { writeFileSync } from "fs";
import { NO, NC, COIL, CMPCONST, seriesRung, program } from "./grid-builders";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory } from "../../src/lib/ladder/types";
import type { SimMemory } from "../../src/lib/ladder/types";
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
  return `gl61_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}

const PROXIMITY_RUNG_UNBUILT = -1; // sentinel: replaced by the real measured threshold before the level is finalized

function turnRightWithProximity(threshold: number): GridProgram {
  return program(rung([NC("X0")], COIL("Y0")), rung([NO("X0")], COIL("Y2")), rung([CMPCONST("<=", "AI0", threshold)], COIL("M0")));
}
function turnLeftWithProximity(threshold: number): GridProgram {
  return program(rung([NC("X0")], COIL("Y0")), rung([NO("X0")], COIL("Y1")), rung([CMPCONST("<=", "AI0", threshold)], COIL("M0")));
}
function decisionWithProximity(threshold: number): GridProgram {
  return program(
    rung([NC("X0")], COIL("Y0")),
    rung([NO("X0"), { kind: "CONTACT", type: "NC", address: "X2" }], COIL("Y2")),
    rung([NO("X0"), { kind: "CONTACT", type: "NO", address: "X2" }], COIL("Y1")),
    rung([CMPCONST("<=", "AI0", threshold)], COIL("M0"))
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

/** Runs `buildSolution(999)` (always-true CMP, no gating effect on movement) to a win against reach_goal alone, and returns the minimum AI0 ever read - the real, achievable proximity threshold for this map. */
function measureMinAi0(map: MazeMap, start: MazeRobotState, buildSolution: (threshold: number) => GridProgram, maxTicks: number): number {
  const probe = buildSolution(999999);
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
  let minAi0 = Infinity;
  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const { inputs, analogInputs } = mazeBinding.readInputs(run.maze!);
    minAi0 = Math.min(minAi0, analogInputs.AI0 ?? Infinity);
    const { memory: nextMemory } = runGridScan(probe, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = { maze: mazeBinding.step(run.maze!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }
  if (outcome.status !== "won") throw new Error(`measureMinAi0: reference solution never won for map starting ${JSON.stringify(start)}`);
  return minAi0;
}

const MAZE_DEFS: {
  map: MazeMap;
  start: MazeRobotState;
  title: string;
  description: string;
  build: (threshold: number) => GridProgram;
  maxTicks: number;
}[] = [
  {
    map: [["PATH", "PATH", "PATH", "GOAL"]],
    start: { x: 0, y: 0, direction: "E" },
    title: "วัดระยะทางถึงเป้าหมาย",
    description: "ด่านแนะนำบล็อกเปรียบเทียบ: ต่อ CMP เปรียบเทียบ AI0 (ระยะทางถึงเป้าหมาย) กับค่าคงที่ ให้ M0 ติดเมื่อเข้าใกล้เป้าหมายพอ",
    build: turnRightWithProximity,
    maxTicks: 15,
  },
  {
    map: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "เลี้ยวขวาพร้อมวัดระยะ",
    description: "เลี้ยวขวาเหมือนเดิม พร้อมวัดระยะทางถึงเป้าหมายด้วย CMP",
    build: turnRightWithProximity,
    maxTicks: 15,
  },
  {
    map: [
      ["WALL", "PATH", "PATH"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 2, y: 0, direction: "W" },
    title: "เลี้ยวซ้ายพร้อมวัดระยะ",
    description: "เลี้ยวซ้ายเหมือนเดิม พร้อมวัดระยะทางถึงเป้าหมายด้วย CMP",
    build: turnLeftWithProximity,
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
    title: "เลี้ยวขวาต่อเนื่องพร้อมวัดระยะ",
    description: "เขาวงกตรูปตัว Z พร้อมวัดระยะทางถึงเป้าหมายด้วย CMP",
    build: turnRightWithProximity,
    maxTicks: 20,
  },
  {
    map: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "ตัดสินใจสองด้านพร้อมวัดระยะ",
    description: "ใช้กฎตัดสินใจสองด้าน พร้อมวัดระยะทางถึงเป้าหมายด้วย CMP",
    build: decisionWithProximity,
    maxTicks: 15,
  },
  {
    map: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    start: { x: 0, y: 1, direction: "E" },
    title: "วัดระยะแล้วยังต้องระวังกับดัก",
    description: "เลี้ยวขวาให้ถูก ห้ามพลาดเข้ากับดัก พร้อมวัดระยะทางถึงเป้าหมาย",
    build: turnRightWithProximity,
    maxTicks: 15,
  },
  {
    map: [
      ["PATH", "PATH", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 0, direction: "E" },
    title: "วัดระยะทางแยกซ้ำ",
    description: "เขาวงกตทางแยกซ้ำ พร้อมวัดระยะทางถึงเป้าหมาย",
    build: decisionWithProximity,
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
    title: "วัดระยะเขาวงกตซับซ้อน",
    description: "เขาวงกตซับซ้อน พร้อมวัดระยะทางถึงเป้าหมาย",
    build: decisionWithProximity,
    maxTicks: 25,
  },
  {
    map: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    start: { x: 0, y: 1, direction: "E" },
    title: "วัดระยะทางแยกอันตราย",
    description: "ทางแยกตัดสินใจสองด้าน พร้อมกับดักที่ต้องระวัง และวัดระยะทางถึงเป้าหมาย",
    build: decisionWithProximity,
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
    title: "บทสรุปหมวดอนาล็อก (เขาวงกต)",
    description: "ด่านสรุปฝั่งเขาวงกตของหมวดอนาล็อก: เขาวงกตรูปตัว U พร้อมวัดระยะทางถึงเป้าหมาย",
    build: turnRightWithProximity,
    maxTicks: 25,
  },
];

const levels: LevelDef[] = MAZE_DEFS.map((d, i) => {
  const measured = measureMinAi0(d.map, d.start, d.build, d.maxTicks);
  return {
    levelNumber: 61 + i,
    title: d.title,
    description: `${d.description} (M0 ต้องติดเมื่อระยะทาง AI0 <= ${measured})`,
    hints: [
      "ใช้บล็อกเปรียบเทียบ CMP: AI0 <= ค่าคงที่ -> M0",
      "AI0 คือระยะทาง (Manhattan distance) จากหุ่นยนต์ถึงเป้าหมาย ยิ่งใกล้เป้าหมายค่ายิ่งน้อย",
    ],
    gameType: "MAZE",
    mapLayout: d.map,
    robotStart: d.start,
    successConditions: [{ kind: "reach_goal" }, { kind: "bit", address: "M0", expected: true }],
    timeLimitTicks: d.maxTicks,
    solution: d.build(measured),
  };
});

// --- FACTORY 71-80: tank interlock + bang-bang temperature control ---
/** Heater gated by a tank-level interlock only - no auto-shutoff yet. */
function interlockedHeater(tankThreshold: number): GridProgram {
  return program(rung([NC("X9")], COIL("Y0")), rung([CMPCONST(">=", "AI1", tankThreshold)], COIL("Y2")));
}
/** Bang-bang: heater runs only while the tank is ready AND the target hasn't been reached yet - auto-shuts off exactly when AI2 first crosses tempTarget. */
function bangBangHeater(tankThreshold: number, tempTarget: number): GridProgram {
  return program(
    rung([NC("X9")], COIL("Y0")),
    rung([CMPCONST(">=", "AI1", tankThreshold), CMPCONST("<", "AI2", tempTarget)], COIL("Y2"))
  );
}

const FACTORY_DEFS: {
  title: string;
  description: string;
  tankThreshold: number;
  tempTarget: number;
  bangBang: boolean;
  dryBoilSafety: boolean;
}[] = [
  {
    title: "รอถังน้ำก่อนเปิดฮีตเตอร์",
    description: "ต่อ CMP เปรียบเทียบ AI1 (ระดับถัง) กับค่าคงที่ - เปิดฮีตเตอร์ได้ก็ต่อเมื่อระดับน้ำถึงเกณฑ์เท่านั้น",
    tankThreshold: 1000,
    tempTarget: 1500,
    bangBang: false,
    dryBoilSafety: false,
  },
  {
    title: "อุณหภูมิเป้าหมายสูงขึ้น",
    description: "เกณฑ์ถังเท่าเดิม แต่อุณหภูมิเป้าหมายสูงขึ้น",
    tankThreshold: 1000,
    tempTarget: 2000,
    bangBang: false,
    dryBoilSafety: false,
  },
  {
    title: "เกณฑ์ถังสูงขึ้น",
    description: "ทั้งเกณฑ์ถังและอุณหภูมิเป้าหมายสูงขึ้นกว่าเดิม",
    tankThreshold: 1500,
    tempTarget: 2500,
    bangBang: false,
    dryBoilSafety: false,
  },
  {
    title: "ปิดฮีตเตอร์อัตโนมัติ",
    description: "เพิ่ม CMP ตัวที่สอง: AI2 < เป้าหมาย ต่ออนุกรมกับเกณฑ์ถัง เพื่อให้ฮีตเตอร์ปิดเองทันทีที่ถึงอุณหภูมิเป้าหมาย",
    tankThreshold: 1000,
    tempTarget: 2000,
    bangBang: true,
    dryBoilSafety: false,
  },
  {
    title: "ปิดอัตโนมัติ เป้าหมายสูงขึ้น",
    description: "ปิดฮีตเตอร์อัตโนมัติเหมือนเดิม แต่อุณหภูมิเป้าหมายสูงขึ้น",
    tankThreshold: 1000,
    tempTarget: 2800,
    bangBang: true,
    dryBoilSafety: false,
  },
  {
    title: "กฎห้ามต้มแห้ง",
    description: "เปิดใช้กฎความปลอดภัย: ห้ามเปิดฮีตเตอร์ขณะระดับถังต่ำกว่าเกณฑ์ (ป้องกันต้มแห้ง) ต้องเขียนวงจรให้ไม่ละเมิดกฎ",
    tankThreshold: 1000,
    tempTarget: 2000,
    bangBang: true,
    dryBoilSafety: true,
  },
  {
    title: "กฎห้ามต้มแห้ง เกณฑ์สูงขึ้น",
    description: "กฎห้ามต้มแห้งเหมือนเดิม แต่เกณฑ์ถังและอุณหภูมิเป้าหมายสูงขึ้น",
    tankThreshold: 1500,
    tempTarget: 2500,
    bangBang: true,
    dryBoilSafety: true,
  },
  {
    title: "กฎห้ามต้มแห้ง เป้าหมายสูงสุด",
    description: "อุณหภูมิเป้าหมายสูงที่สุดในหมวดนี้ ยังต้องไม่ละเมิดกฎห้ามต้มแห้ง",
    tankThreshold: 1500,
    tempTarget: 3200,
    bangBang: true,
    dryBoilSafety: true,
  },
  {
    title: "กฎห้ามต้มแห้ง เกณฑ์ถังสูงสุด",
    description: "เกณฑ์ถังสูงที่สุดในหมวดนี้ ยังต้องไม่ละเมิดกฎห้ามต้มแห้ง",
    tankThreshold: 2000,
    tempTarget: 2500,
    bangBang: true,
    dryBoilSafety: true,
  },
  {
    title: "บทสรุปหมวดอนาล็อก (สายพาน)",
    description: "ด่านสรุปฝั่งสายพานของหมวดอนาล็อก: เกณฑ์ถังและอุณหภูมิเป้าหมายสูงที่สุด พร้อมกฎห้ามต้มแห้ง",
    tankThreshold: 2000,
    tempTarget: 3000,
    bangBang: true,
    dryBoilSafety: true,
  },
];

for (const [i, def] of FACTORY_DEFS.entries()) {
  const solution = def.bangBang ? bangBangHeater(def.tankThreshold, def.tempTarget) : interlockedHeater(def.tankThreshold);
  levels.push({
    levelNumber: 71 + i,
    title: def.title,
    description: `${def.description} (ระดับถัง AI1 >= ${def.tankThreshold}, อุณหภูมิเป้าหมาย AI2 >= ${def.tempTarget})`,
    hints: [
      "ต่อ CMP: AI1 >= ค่าคงที่ (ระดับถังพร้อม) ก่อนอนุญาตให้เปิดฮีตเตอร์ (Y2)",
      def.bangBang ? "เพิ่ม CMP ตัวที่สองอนุกรมกัน: AI2 < เป้าหมาย เพื่อให้ฮีตเตอร์ปิดเองเมื่อถึงเป้าหมาย" : "ยังไม่ต้องปิดฮีตเตอร์อัตโนมัติในด่านนี้",
    ],
    gameType: "FACTORY",
    factoryInitial: factory([]),
    successConditions: [{ kind: "numeric", address: "AI2", operator: ">=", value: def.tempTarget }],
    safetyConstraints: def.dryBoilSafety
      ? [
          {
            id: "no-dry-boil",
            description: "ห้ามเปิดฮีตเตอร์ (Y2) ขณะระดับถัง (AI1) ต่ำกว่าเกณฑ์ (ป้องกันต้มแห้ง)",
            violatingWhen: [
              { kind: "bit", address: "Y2", expected: true },
              { kind: "numeric", address: "AI1", operator: "<", value: def.tankThreshold },
            ],
          },
        ]
      : undefined,
    timeLimitTicks: 150,
    solution,
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
  const outPath = "./scripts/level-gen/game-levels-61-80.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nAll ${levels.length} levels verified. Wrote ${outPath}.`);
}

main();
