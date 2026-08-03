/**
 * Batch 5 (levels 81-100, "ประยุกต์ขั้นสูง" / Advanced Applied) of the
 * 100-level Game Engines curriculum - see generate-game-levels.ts for
 * shared design notes.
 *
 * Levels 81-90 (FACTORY): combines every prior unit's techniques in one
 * program - timed SET/RESET reject latch (batch 2), CTD batch countdown
 * (batch 3), and bang-bang tank/heater interlock with a dry-boil safety
 * constraint (batch 4). Every item's spawn position stays under the fixed
 * SENSOR_POSITION window (~52, see factory-plc-binding.ts) for the same
 * physical reason batch 3 discovered: items are the only way to generate a
 * rising edge on X0, and a defective item's reject-hold must fully clear
 * before its neighbor reaches the pusher.
 *
 * Levels 91-99 (MAZE): a `staircaseMaze(n)` generator produces an n-turn
 * version of the same right-turn staircase shape already proven safe in
 * batches 1/3/4 (map 7/8) - Pattern D's "prefer right when clear, else
 * left" rule generalizes to any n, verified per-level rather than assumed.
 *
 * Level 100 (HYBRID): the exact Boss Level reference scenario from the
 * original curriculum spec - a mixing tank + heater interlock, bottle
 * packaging with reject sorting, then an AGV maze delivery, gated behind
 * dry-boil and AGV-hazard safety constraints. HYBRID levels are new
 * territory for this curriculum (never exercised in batches 1-4), so this
 * file also builds a small HYBRID-aware simulation harness mirroring
 * useGameLevelPlay's real buildCombinedBinding/phaseRef switch, instead of
 * assuming the phase hand-off just works.
 *
 * A HYBRID level's ladder program is the SAME program for both phases -
 * Maze and Factory reuse the identical standardized addresses (X0-X2,
 * Y0-Y2) for different physical meanings, so a naive separate-grid rung
 * for each phase's Y0/Y1/Y2 breaks in TWO ways discovered empirically
 * while building this level (see scripts/_debug-boss.ts, not checked in):
 *
 * 1. A COIL node writes its value UNCONDITIONALLY every scan, even to
 *    false when its own rung doesn't conduct - it's not a no-op when
 *    idle. Two independent grids each ending in their own COIL(Y0) will
 *    fight every tick; whichever grid is LAST in program order always
 *    wins, including writing false and stomping an earlier grid's true.
 *    Fix: Y0/Y1/Y2 are each built as ONE grid with two parallel rows (the
 *    factory condition and the maze condition) vertically tied at the
 *    coil column, with the COIL node on only ONE row - true OR semantics
 *    through the grid engine's own flood-fill, a single write per tick.
 * 2. "Temperature reached" must be latched into M1 via SET, not read live
 *    off AI2 - a live comparison would stop holding once the heater
 *    shuts off and the plant cools during the (long) maze phase, breaking
 *    the AND with the later reach_goal tick.
 * 3. The maze-turn OR-branch is gated behind NO("C0.DN") and NO("M1") -
 *    the only two factory-completion signals actually exposed as
 *    PLC-readable addresses (process_items has no address) - so it can
 *    only start contributing once the factory phase is genuinely
 *    finishing, not from tick 1.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-game-levels-81-100.ts
 *   npm run seed:game-levels -- ./scripts/level-gen/game-levels-81-100.json
 */
import { writeFileSync } from "fs";
import { NO, NC, SET, RESET, COIL, TON, CTD, CMPCONST, seriesRung, program, grid, place, wireH, feedLeftRail, tieVertical } from "./grid-builders";
import { COIL_COLUMN } from "../../src/lib/ladder/grid-types";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory } from "../../src/lib/ladder/types";
import type { AnalogInputs, Inputs, SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, checkSuccessCondition, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, mazeBinding, type MazeGameState } from "../../src/lib/games/maze-plc-binding";
import { createFactoryGameState, factoryBinding, type FactoryGameState } from "../../src/lib/games/factory-plc-binding";
import type { MazeMap, MazeRobotState, MazeTile } from "../../src/lib/games/maze-types";
import type { FactoryState } from "../../src/lib/games/factory-types";
import type { GameLevelSpec, GameType, SuccessCondition } from "../../src/lib/games/game-level-types";
import type { SafetyConstraint } from "../../src/lib/ladder/challenge-types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `gl81_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}

/**
 * Builds ONE grid with `rows.length` parallel series-AND branches, all
 * vertically tied at the coil column so the grid engine's own flood-fill
 * ORs them together - a SINGLE coil write per tick, unlike two separate
 * grids each ending in their own COIL(addr) (which fight every tick,
 * since a COIL write happens even when its own rung doesn't conduct - see
 * the file header comment). Only the FIRST row gets the actual coil node;
 * later rows are bare wire at the coil column, feeding power into row 0's
 * coil cell through the tie.
 */
function orRung(rows: GridNode[][], coilNode: GridNode): LadderGrid {
  const g = grid(nextId(), rows.length);
  rows.forEach((instructions, r) => {
    instructions.forEach((node, c) => place(g, r, c, node));
    feedLeftRail(g, r);
    wireH(g, r, 0, COIL_COLUMN);
  });
  place(g, 0, COIL_COLUMN, coilNode);
  for (let r = 0; r < rows.length - 1; r++) tieVertical(g, r, COIL_COLUMN);
  return g;
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

// ============================================================
// FACTORY 81-90: full combo (timed reject + CTD + bang-bang heater)
// ============================================================
function advancedFactorySolution(rejectPreset: number, batchSize: number, tankThreshold: number, tempTarget: number): GridProgram {
  return program(
    rung([NC("X9")], COIL("Y0")),
    rung([NO("X1")], SET("M0")),
    rung([NO("M0")], TON("T0", rejectPreset)),
    rung([NO("M0")], COIL("Y1")),
    rung([NO("T0.DN")], RESET("M0")),
    rung([NO("X0")], CTD("C0", batchSize)),
    rung([CMPCONST(">=", "AI1", tankThreshold), CMPCONST("<", "AI2", tempTarget)], COIL("Y2"))
  );
}

const FACTORY_DEFS: {
  title: string;
  description: string;
  items: FactoryState["items"];
  goodCount: number;
  rejectPreset: number;
  tankThreshold: number;
  tempTarget: number;
}[] = [
  {
    title: "รวมทุกทักษะ: คัดของเสียพื้นฐาน",
    description: "รวมวงจรคัดของเสีย (จับเวลา+ตัวนับ) กับระบบถัง/ฮีตเตอร์แบบปิดอัตโนมัติและกฎห้ามต้มแห้งไว้ในโปรแกรมเดียว",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    rejectPreset: 10,
    tankThreshold: 1000,
    tempTarget: 1500,
  },
  {
    title: "รวมทุกทักษะ: 2 ชิ้น",
    description: "ล็อต 2 ชิ้น ของดีผ่านก่อนของเสีย พร้อมระบบถัง/ฮีตเตอร์",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 36 },
    ],
    goodCount: 1,
    rejectPreset: 10,
    tankThreshold: 1000,
    tempTarget: 1500,
  },
  {
    title: "รวมทุกทักษะ: เกณฑ์สูงขึ้น",
    description: "เกณฑ์ถังและอุณหภูมิเป้าหมายสูงขึ้น",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    rejectPreset: 10,
    tankThreshold: 1500,
    tempTarget: 2000,
  },
  {
    title: "รวมทุกทักษะ: 2 ชิ้น เกณฑ์สูงขึ้น",
    description: "ล็อต 2 ชิ้น เกณฑ์ถังและอุณหภูมิเป้าหมายสูงขึ้น",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 36 },
    ],
    goodCount: 1,
    rejectPreset: 10,
    tankThreshold: 1500,
    tempTarget: 2000,
  },
  {
    title: "รวมทุกทักษะ: ของเสีย 2 ชิ้น",
    description: "ล็อต 2 ชิ้น เป็นของเสียทั้งคู่ ห่างกันพอให้ตัวจับเวลารีเซ็ตทันเวลา",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 40, defective: true },
    ],
    goodCount: 0,
    rejectPreset: 8,
    tankThreshold: 1200,
    tempTarget: 1800,
  },
  {
    title: "รวมทุกทักษะ: จับเวลาสั้น",
    description: "ตัวจับเวลาสั้นลง กับล็อต 2 ชิ้น ของดีผ่านก่อนของเสีย",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 30 },
    ],
    goodCount: 1,
    rejectPreset: 8,
    tankThreshold: 1200,
    tempTarget: 1800,
  },
  {
    title: "รวมทุกทักษะ: อุณหภูมิสูง",
    description: "อุณหภูมิเป้าหมายสูงขึ้นอีกขั้น",
    items: [{ id: "a", position: 0, defective: true }],
    goodCount: 0,
    rejectPreset: 10,
    tankThreshold: 1500,
    tempTarget: 2600,
  },
  {
    title: "รวมทุกทักษะ: เกณฑ์ถังสูง",
    description: "เกณฑ์ถังสูงขึ้นอีกขั้น พร้อมล็อต 2 ชิ้น",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 40 },
    ],
    goodCount: 1,
    rejectPreset: 10,
    tankThreshold: 2000,
    tempTarget: 2600,
  },
  {
    title: "รวมทุกทักษะ: ของเสีย 2 ชิ้น เกณฑ์สูง",
    description: "ของเสีย 2 ชิ้น พร้อมเกณฑ์ถัง/อุณหภูมิสูงสุดของหมวดนี้",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 42, defective: true },
    ],
    goodCount: 0,
    rejectPreset: 10,
    tankThreshold: 2000,
    tempTarget: 2800,
  },
  {
    title: "บทสรุปหมวดขั้นสูง (สายพาน)",
    description: "ด่านสรุปฝั่งสายพานของหมวดขั้นสูง: ล็อต 2 ชิ้น เกณฑ์ถัง/อุณหภูมิสูงสุด",
    items: [
      { id: "a", position: 0, defective: true },
      { id: "b", position: 40 },
    ],
    goodCount: 1,
    rejectPreset: 10,
    tankThreshold: 2000,
    tempTarget: 3000,
  },
];

const factoryLevels: LevelDef[] = FACTORY_DEFS.map((def, i) => ({
  levelNumber: 81 + i,
  title: def.title,
  description: `${def.description} (ถัง AI1>=${def.tankThreshold}, อุณหภูมิเป้าหมาย AI2>=${def.tempTarget}, ตัวจับเวลา ${def.rejectPreset} ติ๊ก)`,
  hints: [
    "รวมวงจรจากหมวดก่อนหน้าทั้งหมด: SET/TON/RESET คัดของเสีย, CTD นับถอยหลังทั้งล็อต, CMP คู่ควบคุมฮีตเตอร์",
    "กฎห้ามต้มแห้งยังใช้อยู่: ห้ามเปิด Y2 ขณะ AI1 ต่ำกว่าเกณฑ์",
  ],
  gameType: "FACTORY" as const,
  factoryInitial: factory(def.items),
  successConditions: [
    { kind: "bit" as const, address: "C0.DN", expected: true },
    { kind: "process_items" as const, target: def.goodCount },
    { kind: "numeric" as const, address: "AI2", operator: ">=" as const, value: def.tempTarget },
  ],
  safetyConstraints: [
    {
      id: "no-dry-boil",
      description: "ห้ามเปิดฮีตเตอร์ (Y2) ขณะระดับถัง (AI1) ต่ำกว่าเกณฑ์ (ป้องกันต้มแห้ง)",
      violatingWhen: [
        { kind: "bit" as const, address: "Y2", expected: true },
        { kind: "numeric" as const, address: "AI1", operator: "<" as const, value: def.tankThreshold },
      ],
    },
  ],
  timeLimitTicks: 180,
  solution: advancedFactorySolution(def.rejectPreset, def.items.length, def.tankThreshold, def.tempTarget),
}));

// ============================================================
// MAZE 91-99: n-turn staircase (generalizes batch 1/3/4's map 7/8 shape)
// ============================================================
function staircaseMaze(n: number): { map: MazeMap; start: MazeRobotState } {
  const rows = n + 1;
  const cols = n + 2;
  const map: MazeMap = Array.from({ length: rows }, () => Array<MazeTile>(cols).fill("WALL"));
  for (let r = 0; r < rows; r++) {
    map[r][r] = "PATH";
    map[r][r + 1] = r === rows - 1 ? "GOAL" : "PATH";
  }
  return { map, start: { x: 0, y: 0, direction: "E" } };
}
function decisionSolution(): GridProgram {
  return program(
    rung([NC("X0")], COIL("Y0")),
    rung([NO("X0"), { kind: "CONTACT", type: "NC", address: "X2" }], COIL("Y2")),
    rung([NO("X0"), { kind: "CONTACT", type: "NO", address: "X2" }], COIL("Y1"))
  );
}

const MAZE_DEFS: { n: number; title: string; description: string }[] = [
  { n: 4, title: "บันไดเลี้ยว 4 ขั้น", description: "เขาวงกตบันไดเลี้ยว 4 จุด ใช้กฎตัดสินใจสองด้าน" },
  { n: 5, title: "บันไดเลี้ยว 5 ขั้น", description: "เขาวงกตบันไดเลี้ยว 5 จุด" },
  { n: 6, title: "บันไดเลี้ยว 6 ขั้น", description: "เขาวงกตบันไดเลี้ยว 6 จุด" },
  { n: 7, title: "บันไดเลี้ยว 7 ขั้น", description: "เขาวงกตบันไดเลี้ยว 7 จุด" },
  { n: 8, title: "บันไดเลี้ยว 8 ขั้น", description: "เขาวงกตบันไดเลี้ยว 8 จุด" },
  { n: 9, title: "บันไดเลี้ยว 9 ขั้น", description: "เขาวงกตบันไดเลี้ยว 9 จุด" },
  { n: 10, title: "บันไดเลี้ยว 10 ขั้น", description: "เขาวงกตบันไดเลี้ยว 10 จุด" },
  { n: 11, title: "บันไดเลี้ยว 11 ขั้น", description: "เขาวงกตบันไดเลี้ยว 11 จุด" },
  { n: 12, title: "บทสรุปหมวดขั้นสูง (เขาวงกต)", description: "ด่านสรุปฝั่งเขาวงกตของหมวดขั้นสูง: บันไดเลี้ยว 12 จุด ยาวที่สุดในหลักสูตรนี้" },
];

const mazeLevels: LevelDef[] = MAZE_DEFS.map((def, i) => {
  const { map, start } = staircaseMaze(def.n);
  return {
    levelNumber: 91 + i,
    title: def.title,
    description: `${def.description} - ใช้กฎเดิม: เจอกำแพงข้างหน้า ถ้าขวาว่างเลี้ยวขวา ไม่ว่างเลี้ยวซ้าย`,
    hints: ["ใช้วงจรตัดสินใจสองด้านเดิม (NO(X0) ต่ออนุกรมกับ NC(X2) หรือ NO(X2)) - กฎเดิมใช้ได้กับทุกขนาดเขาวงกต"],
    gameType: "MAZE" as const,
    mapLayout: map,
    robotStart: start,
    successConditions: [{ kind: "reach_goal" as const }],
    timeLimitTicks: def.n * 3 + 15,
    solution: decisionSolution(),
  };
});

// ============================================================
// Level 100: THE BOSS - HYBRID (mixing tank + bottle packaging, then AGV delivery)
// ============================================================
const BOSS_TANK_THRESHOLD = 1500;
const BOSS_TEMP_TARGET = 2500;
const BOSS_REJECT_PRESET = 10;
const BOSS_ITEMS: FactoryState["items"] = [
  { id: "a", position: 0, defective: true },
  { id: "b", position: 40 },
];
const BOSS_GOOD_COUNT = 1;
const BOSS_MAP: MazeMap = [
  ["WALL", "HAZARD", "WALL"],
  ["PATH", "PATH", "WALL"],
  ["WALL", "GOAL", "WALL"],
];
const BOSS_ROBOT_START: MazeRobotState = { x: 0, y: 1, direction: "E" };

/**
 * Factory rungs first (win priority for their addresses during the factory
 * phase, and harmless once M0/Y2 settle back to false), maze-turn rungs
 * last (win priority once the maze phase begins) - see the file header
 * comment for the full reasoning and the empirical-vs-hand-proof caveat.
 */
function bossSolution(): GridProgram {
  // Maze-turn branches are gated behind NO("C0.DN") + NO("M1") - both are
  // ladder-readable factory-completion signals (the third, process_items,
  // isn't exposed as any PLC address). This isn't the exact real
  // phase-switch instant, but process_items reliably finishes first here
  // (the non-defective item clears the belt long before the slower
  // C0.DN/M1 signals), so the gate never opens before the real engine has
  // already switched to the maze phase - confirmed empirically, not
  // assumed. Y0/Y1/Y2 are each ONE orRung (factory branch OR maze branch)
  // rather than two separate COIL grids - see the file header comment for
  // why two independent COIL(addr) grids fight every tick instead of
  // safely coexisting.
  const gate1: GridNode = { kind: "CONTACT", type: "NO", address: "C0.DN" };
  const gate2: GridNode = { kind: "CONTACT", type: "NO", address: "M1" };
  const notM1: GridNode = { kind: "CONTACT", type: "NC", address: "M1" };
  const wallRightClear: GridNode = { kind: "CONTACT", type: "NC", address: "X2" };
  const wallRightBlocked: GridNode = { kind: "CONTACT", type: "NO", address: "X2" };
  // Two more shared-address collisions caught by verification, beyond the
  // ones above: (1) "NC(X9)" as an always-true conveyor-on placeholder
  // backfires because X9 is undefined in BOTH bindings, so that branch of
  // Y0's orRung stays permanently true straight through the maze phase
  // too, masking every turn command behind Y0's move-forward priority -
  // replaced with NC("M1") (conveyor runs until the temperature target
  // latches, which this scenario's timing keeps well after every item has
  // already cleared the belt). (2) mazeBinding ALSO sets X1 (wall-to-left)
  // - a wall to the AGV's left during the maze phase would otherwise
  // re-trigger the factory's SET M0 rung, corrupting the reject latch;
  // gated with the same NC("M1") for the same reason.
  return program(
    orRung([[notM1], [gate1, gate2, NC("X0")]], COIL("Y0")),
    rung([NO("X1"), notM1], SET("M0")),
    rung([NO("M0")], TON("T0", BOSS_REJECT_PRESET)),
    orRung([[NO("M0")], [gate1, gate2, NO("X0"), wallRightBlocked]], COIL("Y1")),
    rung([NO("T0.DN")], RESET("M0")),
    rung([NO("X0")], CTD("C0", BOSS_ITEMS.length)),
    orRung(
      [
        [CMPCONST(">=", "AI1", BOSS_TANK_THRESHOLD), CMPCONST("<", "AI2", BOSS_TEMP_TARGET)],
        [gate1, gate2, NO("X0"), wallRightClear],
      ],
      COIL("Y2")
    ),
    rung([CMPCONST(">=", "AI2", BOSS_TEMP_TARGET)], SET("M1"))
  );
}

const BOSS_SUCCESS: SuccessCondition[] = [
  { kind: "bit", address: "C0.DN", expected: true },
  { kind: "process_items", target: BOSS_GOOD_COUNT },
  { kind: "bit", address: "M1", expected: true },
  { kind: "reach_goal" },
];
const BOSS_SAFETY: SafetyConstraint[] = [
  {
    id: "no-dry-boil",
    description: "ห้ามเปิดฮีตเตอร์ (Y2) ขณะระดับถัง (AI1) ต่ำกว่าเกณฑ์ (ป้องกันต้มแห้ง)",
    // The M1=false clause scopes this check to the genuine dry-boil risk
    // window (before the target temperature is ever reached). Without it,
    // this constraint would ALSO fire during the maze phase - AI1 isn't
    // provided by mazeBinding.readInputs at all (defaults to 0, always
    // "below threshold"), and Y2 legitimately means "turn right" there,
    // so the two together would spuriously read as a dry-boil violation
    // every time the AGV turns right - caught empirically, not assumed.
    violatingWhen: [
      { kind: "bit", address: "Y2", expected: true },
      { kind: "numeric", address: "AI1", operator: "<", value: BOSS_TANK_THRESHOLD },
      { kind: "bit", address: "M1", expected: false },
    ],
  },
];

const bossLevel: LevelDef = {
  levelNumber: 100,
  title: "บอสด่านสุดท้าย: โรงงานอัจฉริยะ",
  description:
    "ภารกิจสุดท้าย: (1) ควบคุมถังผสมสารเคมีและฮีตเตอร์ให้ถึงอุณหภูมิเป้าหมายโดยไม่ต้มแห้ง (2) คัดของเสียออกจากสายการบรรจุขวด (3) เมื่อเสร็จภารกิจโรงงานแล้ว หุ่นยนต์ AGV จะออกเดินทางส่งของอัตโนมัติผ่านเขาวงกต ห้ามชนจุดอันตรายเด็ดขาด",
  hints: [
    "ใช้บล็อกเปรียบเทียบ CMP ควบคุมฮีตเตอร์แบบมีเงื่อนไขถัง (interlock) เหมือนหมวดอนาล็อก",
    "ใช้ SET เก็บสถานะ \"อุณหภูมิถึงเป้าหมายแล้ว\" ไว้ในรีเลย์ภายใน M1 - ห้ามใช้ CMP เปรียบเทียบสดตรงๆ เพราะอุณหภูมิจะเย็นลงระหว่างที่หุ่นยนต์เดินเขาวงกต",
    "โปรแกรมเดียวกันนี้ควบคุมทั้งสายพานและหุ่นยนต์ AGV (ใช้ X0-X2, Y0-Y2 ซ้ำกัน) - วางรุ้งควบคุมหุ่นยนต์ไว้ท้ายโปรแกรมเสมอ",
  ],
  gameType: "HYBRID",
  mapLayout: BOSS_MAP,
  robotStart: BOSS_ROBOT_START,
  factoryInitial: factory(BOSS_ITEMS),
  successConditions: BOSS_SUCCESS,
  safetyConstraints: BOSS_SAFETY,
  timeLimitTicks: 200,
  solution: bossSolution(),
};

// ============================================================
// Verification (MAZE/FACTORY via a direct binding; HYBRID via a small
// phase-switching harness mirroring use-game-level-play.ts's
// buildCombinedBinding/phaseRef exactly).
// ============================================================
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

function verifySingleDomain(def: LevelDef): string | null {
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

/** Mirrors use-game-level-play.ts's buildCombinedBinding + phaseRef switch exactly, as a plain (non-React) function for scripted verification. */
function verifyHybrid(def: LevelDef): string | null {
  const spec = toSpec(def);
  let run: GameRunState = {
    maze: createMazeGameState(def.mapLayout!, def.robotStart!),
    factory: createFactoryGameState(def.factoryInitial!),
  };
  let memory = createEmptyMemory();
  let phase: "factory" | "maze" = "factory";
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  const maxTicks = (def.timeLimitTicks ?? 100) + 5;

  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const binding = phase === "factory" ? factoryBinding : mazeBinding;
    const state: FactoryGameState | MazeGameState = phase === "factory" ? run.factory! : run.maze!;
    const { inputs, analogInputs }: { inputs: Inputs; analogInputs: AnalogInputs } = binding.readInputs(state as never);
    const { memory: nextMemory } = runGridScan(def.solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run =
      phase === "factory"
        ? { ...run, factory: factoryBinding.step(run.factory!, memory.coils, memory) }
        : { ...run, maze: mazeBinding.step(run.maze!, memory.coils, memory) };

    if (phase === "factory") {
      const nonGoalConditions = spec.successConditions.filter((c) => !("kind" in c && c.kind === "reach_goal"));
      const factoryPhaseDone = nonGoalConditions.every((c) => checkSuccessCondition(c, run, inputs, memory, analogInputs));
      if (factoryPhaseDone) phase = "maze";
    }

    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }

  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): HYBRID reference solution did not win within ${maxTicks} ticks (phase ended as "${phase}") - final outcome ${JSON.stringify(outcome)}`;
  }
  return null;
}

function verifyLevel(def: LevelDef): string | null {
  return def.gameType === "HYBRID" ? verifyHybrid(def) : verifySingleDomain(def);
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
  const levels: LevelDef[] = [...factoryLevels, ...mazeLevels, bossLevel];
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
  const outPath = "./scripts/level-gen/game-levels-81-100.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nAll ${levels.length} levels verified. Wrote ${outPath}.`);
}

main();
