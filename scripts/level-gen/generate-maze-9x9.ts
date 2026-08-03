/**
 * Regenerates all 49 existing MAZE levels (1-10, 21-30, 41-50, 61-70,
 * 91-99) as procedural 9x9 mazes, replacing them in place by level_number
 * (upserted via seed-game-levels.ts, never renumbered) - see
 * maze9x9-gen.ts for the generator itself.
 *
 * Design: chapters 1-4 (1-10/21-30/41-50/61-70) reuse the SAME 10 base
 * 9x9 mazes (generated once, escalating difficulty + hazards from level
 * 6 on), matching the original curriculum's approach of reusing batch 1's
 * maps across chapters - only the PLC concept layered on top changes:
 *   ch1 (Basic Digital):  plain Pattern D, reach_goal only
 *   ch2 (Timers):         Pattern D gated behind a T0 startup delay
 *   ch3 (Counters):       Pattern D + CTU C0 counting turns, C0.ACC>=measured required
 *   ch4 (Analog & Math):  Pattern D + CMP AI0<=threshold->M0, M0 required
 * Chapter 5 (91-99, "Advanced Applied") gets 9 FRESH, harder mazes, every
 * one a hazard maze - the curriculum's summary/finale chapter.
 *
 * Every level is self-verified against the real engine (runGridScan +
 * evaluateGameLevelTick) before being written out, same discipline as
 * every other generate-game-levels*.ts script.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-maze-9x9.ts
 *   npx tsx scripts/seed-game-levels.ts ./scripts/level-gen/game-levels-maze9x9.json
 */
import { writeFileSync } from "fs";
import { NO, NC, COIL, TON, CTU, CMPCONST, seriesRung, program } from "./grid-builders";
import { generateDifficultyMaze, generateHazardMaze, type GeneratedMaze } from "./maze-gen";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, mazeBinding } from "../../src/lib/games/maze-plc-binding";
import type { MazeMap, MazeRobotState } from "../../src/lib/games/maze-types";
import type { GameLevelSpec, SuccessCondition } from "../../src/lib/games/game-level-types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m9_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}

const moveForward = () => rung([NC("X0")], COIL("Y0"));
const turnRight = () => rung([NO("X0"), NC("X2")], COIL("Y2"));
const turnLeft = () => rung([NO("X0"), NO("X2")], COIL("Y1"));

/** Ch1 (Basic Digital): plain Pattern D. */
function basicDecision(): GridProgram {
  return program(moveForward(), turnRight(), turnLeft());
}
/** Ch2 (Timers): Pattern D's move rung gated behind T0.DN; turns unaffected. */
function startupDelayDecision(preset: number): GridProgram {
  return program(
    rung([NC("X9")], TON("T0", preset)),
    rung([NC("X0"), NO("T0.DN")], COIL("Y0")),
    turnRight(),
    turnLeft()
  );
}
/** Ch3 (Counters): Pattern D + CTU C0 counting every turn-triggering wall encounter. */
function decisionCounted(): GridProgram {
  return program(moveForward(), turnRight(), turnLeft(), rung([NO("X0")], CTU("C0", 99)));
}
/** Ch4 (Analog & Math): Pattern D + CMP AI0<=threshold -> M0 proximity flag. */
function decisionWithProximity(threshold: number): GridProgram {
  return program(moveForward(), turnRight(), turnLeft(), rung([CMPCONST("<=", "AI0", threshold)], COIL("M0")));
}

/** Runs `solution` against reach_goal alone and returns the real engine outcome - shared simulation harness for both measurement and final self-verification. */
function runMaze(map: MazeMap, start: MazeRobotState, solution: GridProgram, successConditions: SuccessCondition[], maxTicks: number) {
  const spec: GameLevelSpec = {
    levelNumber: 0,
    gameType: "MAZE",
    title: "measure",
    description: "measure",
    mapLayout: map,
    robotStart: start,
    successConditions,
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
    const { memory: nextMemory } = runGridScan(solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = { maze: mazeBinding.step(run.maze!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }
  return { outcome, tick, memory, minAi0 };
}

function measureCounterAcc(map: MazeMap, start: MazeRobotState, solution: GridProgram, maxTicks: number): number {
  const { outcome, memory } = runMaze(map, start, solution, [{ kind: "reach_goal" }], maxTicks);
  if (outcome.status !== "won") throw new Error(`measureCounterAcc: reference solution never won (start ${JSON.stringify(start)})`);
  return memory.counters["C0"]?.cv ?? 0;
}

function measureMinAi0(map: MazeMap, start: MazeRobotState, buildSolution: (threshold: number) => GridProgram, maxTicks: number): number {
  const { outcome, minAi0 } = runMaze(map, start, buildSolution(999999), [{ kind: "reach_goal" }], maxTicks);
  if (outcome.status !== "won") throw new Error(`measureMinAi0: reference solution never won (start ${JSON.stringify(start)})`);
  return minAi0;
}

type LevelDef = {
  levelNumber: number;
  title: string;
  description: string;
  hints: string[];
  mapLayout: MazeMap;
  robotStart: MazeRobotState;
  successConditions: SuccessCondition[];
  timeLimitTicks: number;
  solution: GridProgram;
};

// ============================================================
// Chapter 1 base mazes: 10 procedurally generated 9x9 mazes, escalating
// difficulty (measured tick count, not hand-guessed), hazards from #6 on.
// ============================================================
const TICK_BANDS: [number, number][] = [
  [3, 6],
  [4, 8],
  [6, 10],
  [8, 13],
  [10, 16],
  [12, 18],
  [14, 20],
  [16, 24],
  [18, 28],
  [20, 32],
];

const CH1_BASE: GeneratedMaze[] = TICK_BANDS.map(([minT, maxT], i) => {
  const seed = 90210 + i * 7919;
  const hazard = i >= 5;
  return hazard ? generateHazardMaze(seed, 9, minT, maxT, 300) : generateDifficultyMaze(seed, 9, minT, maxT, 300);
});

function levelTitle(chapterLabel: string, i: number, hazard: boolean): string {
  const base = `เขาวงกต 9x9${chapterLabel} ด่านที่ ${i + 1}`;
  return hazard ? `${base} (ระวังกับดัก)` : base;
}

// ---- Ch1: Basic Digital (1-10) ----
const ch1Levels: LevelDef[] = CH1_BASE.map((base, i) => {
  const hazard = i >= 5;
  return {
    levelNumber: 1 + i,
    title: levelTitle("", i, hazard),
    description: hazard
      ? "เขาวงกต 9x9 พร้อมกับดัก (HAZARD) - ใช้กฎตัดสินใจสองด้าน: เจอกำแพงข้างหน้า ถ้าขวาว่างเลี้ยวขวา ไม่ว่างเลี้ยวซ้าย ห้ามพลาดเข้ากับดัก"
      : "เขาวงกต 9x9 - ใช้กฎตัดสินใจสองด้าน: เจอกำแพงข้างหน้า (X0) ถ้าขวาว่าง (NC X2) เลี้ยวขวา (Y2) ไม่ว่าง (NO X2) เลี้ยวซ้าย (Y1)",
    hints: [
      "ใช้หน้าสัมผัส NC ต่อกับ X0 แล้วต่อไปยัง Y0 เพื่อเดินหน้าตลอดเวลาที่ไม่มีกำแพง",
      "ที่ทางแยก: NO(X0) อนุกรมกับ NC(X2) -> Y2 (เลี้ยวขวาเมื่อขวาว่าง), NO(X0) อนุกรมกับ NO(X2) -> Y1 (เลี้ยวซ้ายเมื่อขวาไม่ว่าง)",
      ...(hazard ? ["ระวัง! มีกับดัก (HAZARD) ซ่อนอยู่ข้างเส้นทาง ถ้าเดินผิดทางจะพลาดเข้ากับดักทันที"] : []),
    ],
    mapLayout: base.map,
    robotStart: base.start,
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: base.solveTicks + 20,
    solution: basicDecision(),
  };
});

// ---- Ch2: Timers (21-30) - reuses CH1_BASE maps, gated behind T0 ----
const ch2Levels: LevelDef[] = CH1_BASE.map((base, i) => {
  const hazard = i >= 5;
  const preset = 3 + (i % 3);
  return {
    levelNumber: 21 + i,
    title: levelTitle(" (หน่วงเวลาก่อนเดิน)", i, hazard),
    description: `เขาวงกต 9x9 เดิม แต่ต้องรอ TON T0 นับครบก่อนจึงเดินได้ (T0 preset = ${preset} ติ๊ก)`,
    hints: [
      "ใช้บล็อกตัวจับเวลา TON ชื่อ T0 ต่อกับหน้าสัมผัส NC(X9) เพื่อให้เดินนับตลอดเวลา",
      'ต่อหน้าสัมผัส NO ที่อยู่ "T0.DN" อนุกรมกับ NC(X0) แล้วค่อยต่อไป Y0 - หุ่นยนต์จะเดินได้ก็ต่อเมื่อ T0 นับครบเท่านั้น',
      "กฎตัดสินใจสองด้าน (เลี้ยวขวา/ซ้าย) เหมือนหมวดพื้นฐานดิจิทัลทุกประการ",
      ...(hazard ? ["ระวัง! มีกับดัก (HAZARD) ซ่อนอยู่ข้างเส้นทาง"] : []),
    ],
    mapLayout: base.map,
    robotStart: base.start,
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: base.solveTicks + preset + 15,
    solution: startupDelayDecision(preset),
  };
});

// ---- Ch3: Counters (41-50) - reuses CH1_BASE maps, CTU counts turns ----
const ch3Levels: LevelDef[] = CH1_BASE.map((base, i) => {
  const hazard = i >= 5;
  const solution = decisionCounted();
  const measured = measureCounterAcc(base.map, base.start, solution, base.solveTicks + 20);
  return {
    levelNumber: 41 + i,
    title: levelTitle(" (นับจำนวนเลี้ยว)", i, hazard),
    description: `เขาวงกต 9x9 เดิม พร้อมนับจำนวนครั้งที่เจอกำแพงข้างหน้าด้วย CTU C0 (ต้องนับให้ได้อย่างน้อย ${measured} ครั้งก่อนถึงเป้าหมาย)`,
    hints: [
      "ใช้บล็อกตัวนับ CTU ชื่อ C0 - นับขึ้นทุกครั้งที่สัญญาณอินพุตเปลี่ยนจากปิดเป็นเปิด (rising edge)",
      "ต่อหน้าสัมผัส NO กับ X0 เข้ากับ CTU C0",
      "กฎตัดสินใจสองด้าน (เลี้ยวขวา/ซ้าย) เหมือนหมวดพื้นฐานดิจิทัลทุกประการ",
      ...(hazard ? ["ระวัง! มีกับดัก (HAZARD) ซ่อนอยู่ข้างเส้นทาง"] : []),
    ],
    mapLayout: base.map,
    robotStart: base.start,
    successConditions: [
      { kind: "reach_goal" },
      { kind: "numeric", address: "C0.ACC", operator: ">=", value: measured },
    ],
    timeLimitTicks: base.solveTicks + 20,
    solution,
  };
});

// ---- Ch4: Analog & Math (61-70) - reuses CH1_BASE maps, CMP AI0 proximity ----
const ch4Levels: LevelDef[] = CH1_BASE.map((base, i) => {
  const hazard = i >= 5;
  const measured = measureMinAi0(base.map, base.start, decisionWithProximity, base.solveTicks + 20);
  return {
    levelNumber: 61 + i,
    title: levelTitle(" (ตรวจระยะใกล้เป้าหมาย)", i, hazard),
    description: `เขาวงกต 9x9 เดิม พร้อมวัดระยะทางถึงเป้าหมายด้วย CMP (M0 ต้องติดเมื่อระยะทาง AI0 <= ${measured})`,
    hints: [
      "ใช้บล็อกเปรียบเทียบ CMP: AI0 <= ค่าคงที่ -> M0",
      "AI0 คือระยะทาง (Manhattan distance) จากหุ่นยนต์ถึงเป้าหมาย ยิ่งใกล้เป้าหมายค่ายิ่งน้อย",
      "กฎตัดสินใจสองด้าน (เลี้ยวขวา/ซ้าย) เหมือนหมวดพื้นฐานดิจิทัลทุกประการ",
      ...(hazard ? ["ระวัง! มีกับดัก (HAZARD) ซ่อนอยู่ข้างเส้นทาง"] : []),
    ],
    mapLayout: base.map,
    robotStart: base.start,
    successConditions: [
      { kind: "reach_goal" },
      { kind: "bit", address: "M0", expected: true },
    ],
    timeLimitTicks: base.solveTicks + 20,
    solution: decisionWithProximity(measured),
  };
});

// ============================================================
// Chapter 5 (91-99): 9 FRESH, harder mazes - every one a hazard maze,
// the curriculum's advanced/summary finale.
// ============================================================
const CH5_COUNT = 9;
const CH5_BAND_START: [number, number] = [20, 30];
const CH5_BAND_END: [number, number] = [44, 65];
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}
const ch5Levels: LevelDef[] = Array.from({ length: CH5_COUNT }, (_, i) => {
  const t = i / (CH5_COUNT - 1);
  const minT = lerp(CH5_BAND_START[0], CH5_BAND_END[0], t);
  const maxT = lerp(CH5_BAND_START[1], CH5_BAND_END[1], t);
  const seed = 424242 + i * 104729;
  const base = generateHazardMaze(seed, 9, minT, maxT, 300);
  const isFinale = i === CH5_COUNT - 1;
  return {
    levelNumber: 91 + i,
    title: isFinale ? "บทสรุปหมวดขั้นสูง (เขาวงกต 9x9 ด่านสุดท้าย)" : `เขาวงกต 9x9 ขั้นสูง ด่านที่ ${i + 1}`,
    description: isFinale
      ? "ด่านสรุปฝั่งเขาวงกตของหมวดขั้นสูง - เขาวงกต 9x9 ที่ซับซ้อนที่สุดในหลักสูตรนี้ พร้อมกับดัก ใช้กฎตัดสินใจสองด้านเดิมให้แม่นยำ"
      : "เขาวงกต 9x9 ขั้นสูง พร้อมกับดัก (HAZARD) - ใช้กฎตัดสินใจสองด้านเดิม: เจอกำแพงข้างหน้า ถ้าขวาว่างเลี้ยวขวา ไม่ว่างเลี้ยวซ้าย",
    hints: [
      "ใช้กฎตัดสินใจสองด้านเดิม (NO(X0) อนุกรมกับ NC(X2) หรือ NO(X2)) - กฎเดิมใช้ได้กับทุกขนาดเขาวงกต",
      "ระวัง! มีกับดัก (HAZARD) ซ่อนอยู่ข้างเส้นทาง ถ้าต่อวงจรผิด (เช่นสลับ Y1/Y2) อาจพลาดเข้ากับดัก",
    ],
    mapLayout: base.map,
    robotStart: base.start,
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: base.solveTicks + 20,
    solution: basicDecision(),
  };
});

const allLevels: LevelDef[] = [...ch1Levels, ...ch2Levels, ...ch3Levels, ...ch4Levels, ...ch5Levels];

// ============================================================
// Self-verify every level against the real engine before writing.
// ============================================================
function verifyLevel(def: LevelDef): string | null {
  const { outcome } = runMaze(def.mapLayout, def.robotStart, def.solution, def.successConditions, def.timeLimitTicks + 5);
  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): reference solution did not win within ${def.timeLimitTicks + 5} ticks - final outcome ${JSON.stringify(outcome)}`;
  }
  return null;
}

type GameLevelRowOut = {
  level_number: number;
  game_type: "MAZE";
  title: string;
  description: string;
  hints: string[];
  map_layout_json: unknown;
  robot_start_json: unknown;
  factory_initial_json: null;
  success_conditions_json: unknown;
  safety_constraints_json: unknown;
  time_limit_ticks: number | null;
  ticks_per_second: number | null;
};

function toRow(def: LevelDef): GameLevelRowOut {
  return {
    level_number: def.levelNumber,
    game_type: "MAZE",
    title: def.title,
    description: def.description,
    hints: def.hints,
    map_layout_json: def.mapLayout,
    robot_start_json: def.robotStart,
    factory_initial_json: null,
    success_conditions_json: def.successConditions,
    safety_constraints_json: [],
    time_limit_ticks: def.timeLimitTicks,
    ticks_per_second: null,
  };
}

function main() {
  const errors: string[] = [];
  for (const def of allLevels) {
    const err = verifyLevel(def);
    if (err) errors.push(err);
  }
  if (errors.length > 0) {
    console.error(`${errors.length} level(s) failed self-verification:`);
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }

  const levelNumbers = allLevels.map((l) => l.levelNumber).sort((a, b) => a - b);
  console.log(`Self-verified ${allLevels.length} maze levels: ${levelNumbers.join(",")}`);

  const rows = allLevels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-maze9x9.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
