/**
 * Generates the first batch (levels 1-20, "พื้นฐานดิจิทัล" / Basic Digital)
 * of the 100-level Game Engines curriculum, and self-verifies every level's
 * reference solution against the real engine (runGridScan + evaluateGameLevelTick)
 * before writing scripts/level-gen/game-levels-1-20.json - same
 * "verify against the real grading path before shipping" discipline
 * generate-efficiency.ts already established for the legacy Levels track.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-game-levels.ts
 *   npm run seed:game-levels   (writes the JSON into public.game_levels)
 */
import { writeFileSync } from "fs";
import { NO, NC, SET, COIL, seriesRung, program } from "./grid-builders";
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

// --- AND-series rung helper (grid-builders' seriesRung already does this - reuse for clarity) ---
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}
let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `gl${idCounter}`;
}

// --- Reusable rung patterns (see design notes in the Task 4 write-up) ---
/** Pattern A: NC(X0) -> Y0 - always move forward whenever no wall is ahead. */
function moveForwardAlways(): LadderGrid {
  return rung([NC("X0")], COIL("Y0"));
}
/** Pattern B: adds a single fixed turn direction on top of Pattern A. */
function turnOnWall(turnAddr: "Y1" | "Y2"): LadderGrid {
  return rung([NO("X0")], COIL(turnAddr));
}
/** Pattern D: AND-decision turn - prefers turning right when the right side reads clear (no real wall), otherwise turns left. */
function decisionTurnRight(): LadderGrid {
  return rung([NO("X0"), NC("X2")], COIL("Y2"));
}
function decisionTurnLeft(): LadderGrid {
  return rung([NO("X0"), NO("X2")], COIL("Y1"));
}

const PATTERN_B_RIGHT: GridProgram = program(moveForwardAlways(), turnOnWall("Y2"));
const PATTERN_B_LEFT: GridProgram = program(moveForwardAlways(), turnOnWall("Y1"));
const PATTERN_D: GridProgram = program(moveForwardAlways(), decisionTurnRight(), decisionTurnLeft());

const CONVEYOR_ALWAYS_ON: GridProgram = program(rung([NC("X9")], COIL("Y0")));
/** X1 -> SET M0 (latch defect detection permanently). */
const DETECT_DEFECT: GridProgram = program(CONVEYOR_ALWAYS_ON.grids[0], rung([NO("X1")], SET("M0")));
/** Adds M0 -> Y1 (reject) on top of DETECT_DEFECT. */
const DETECT_AND_REJECT: GridProgram = program(...DETECT_DEFECT.grids, rung([NO("M0")], COIL("Y1")));
/**
 * Interlocked reject: conveyor runs only while M0 isn't latched yet, so
 * Y0/Y1 never overlap. Grid order matters here - runGridScan threads the
 * same `memory` through each grid in sequence, so a later grid sees an
 * earlier grid's coil writes from THIS scan (not just the previous one).
 * SET M0 must run before the Y0 rung reads M0, so the conveyor actually
 * stops on the very same tick the defect is latched, instead of one tick
 * late (which would momentarily energize Y0 and Y1 together).
 */
const DETECT_AND_REJECT_INTERLOCKED: GridProgram = program(
  rung([NO("X1")], SET("M0")),
  rung([NC("X9"), NC("M0")], COIL("Y0")),
  rung([NO("M0")], COIL("Y1"))
);

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

const levels: LevelDef[] = [
  // ---- MAZE 1-10 ----
  {
    levelNumber: 1,
    title: "ทางตรงสู่เป้าหมาย",
    description: "หุ่นยนต์อยู่หน้าทางเดินตรง ไม่มีสิ่งกีดขวาง ให้เขียนวงจรสั่งหุ่นยนต์เดินหน้าไปจนถึงเป้าหมาย (GOAL)",
    hints: ["ใช้หน้าสัมผัส NC ต่อกับ X0 (มีกำแพงข้างหน้า) แล้วต่อไปยัง Y0 (เดินหน้า) เพื่อให้เดินหน้าตลอดเวลาที่ไม่มีกำแพง"],
    gameType: "MAZE",
    mapLayout: [["PATH", "PATH", "PATH", "GOAL"]],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 15,
    solution: PATTERN_B_RIGHT,
  },
  {
    levelNumber: 2,
    title: "เลี้ยวขวาเมื่อชนกำแพง",
    description: "ทางเดินมีมุมเลี้ยวขวา 1 จุด เมื่อหุ่นยนต์เจอกำแพงข้างหน้า (X0) ให้สั่งเลี้ยวขวา (Y2) แล้วเดินหน้าต่อจนถึงเป้าหมาย",
    hints: [
      "ใช้หน้าสัมผัส NO ต่อกับ X0 แล้วต่อไปยัง Y2 (เลี้ยวขวา) - ทำงานเฉพาะตอนมีกำแพงข้างหน้าเท่านั้น",
      "อย่าลืมรุ้ง NC(X0)->Y0 สำหรับเดินหน้าตอนไม่มีกำแพงด้วย",
    ],
    gameType: "MAZE",
    mapLayout: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 15,
    solution: PATTERN_B_RIGHT,
  },
  {
    levelNumber: 3,
    title: "เลี้ยวซ้ายเมื่อชนกำแพง",
    description: "เหมือนด่านก่อนหน้า แต่คราวนี้ทางเดินเลี้ยวซ้ายแทน ให้ใช้เอาต์พุต Y1 (เลี้ยวซ้าย) แทน Y2",
    hints: ["สลับจากด่านก่อนหน้า: NO(X0) -> Y1 (เลี้ยวซ้าย)"],
    gameType: "MAZE",
    mapLayout: [
      ["WALL", "PATH", "PATH"],
      ["WALL", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    robotStart: { x: 2, y: 0, direction: "W" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 15,
    solution: PATTERN_B_LEFT,
  },
  {
    levelNumber: 4,
    title: "ทางเลี้ยวขวาต่อเนื่อง",
    description: "ทางเดินรูปตัว Z เลี้ยวขวา 2 จุด วงจรเดิมจากด่าน 2 ยังใช้ได้ เพราะกฎ \"เจอกำแพงให้เลี้ยวขวา\" เหมือนกันทุกจุด",
    hints: ["ใช้วงจรเดียวกับด่าน 2 ได้เลย ไม่ต้องแก้ไข"],
    gameType: "MAZE",
    mapLayout: [
      ["PATH", "PATH", "PATH", "PATH", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["GOAL", "PATH", "PATH", "PATH", "PATH"],
    ],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 20,
    solution: PATTERN_B_RIGHT,
  },
  {
    levelNumber: 5,
    title: "ตรวจสองด้านก่อนเลี้ยว",
    description:
      "ทางเดินนี้มีทั้งเลี้ยวขวาและเลี้ยวซ้ายปนกัน ใช้เซนเซอร์ X2 (กำแพงด้านขวา) ร่วมกับ X0 เพื่อตัดสินใจว่าจะเลี้ยวทางไหน",
    hints: [
      "ถ้าเจอกำแพงข้างหน้า (X0) และด้านขวาว่าง (X2=ไม่มีกำแพง) ให้เลี้ยวขวา: NO(X0) ต่ออนุกรมกับ NC(X2) -> Y2",
      "ถ้าเจอกำแพงข้างหน้าและด้านขวาก็มีกำแพง ให้เลี้ยวซ้ายแทน: NO(X0) ต่ออนุกรมกับ NO(X2) -> Y1",
    ],
    gameType: "MAZE",
    mapLayout: [
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 15,
    solution: PATTERN_D,
  },
  {
    levelNumber: 6,
    title: "ต่อผิดทาง เจอกับดัก",
    description:
      "ระวัง! ถ้าต่อเอาต์พุตเลี้ยวผิดด้าน (Y1 กับ Y2 สลับกัน) หุ่นยนต์จะเดินเข้ากับดักอันตราย (HAZARD) และด่านจบทันที ต่อให้ถูกต้องเพื่อเลี้ยวขวาไปเป้าหมาย",
    hints: ["วงจรเดียวกับด่าน 2 (NO(X0)->Y2, NC(X0)->Y0) - แค่ต่อ Y2 ให้ถูก อย่าใช้ Y1"],
    gameType: "MAZE",
    mapLayout: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "GOAL", "WALL"],
    ],
    robotStart: { x: 0, y: 1, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 15,
    solution: PATTERN_B_RIGHT,
  },
  {
    levelNumber: 7,
    title: "เขาวงกตทางแยกซ้ำ",
    description: "เขาวงกตขนาดใหญ่ขึ้น ใช้กฎการตัดสินใจสองด้าน (เหมือนด่าน 5) ผ่านทางแยกหลายจุดจนถึงเป้าหมาย",
    hints: ["ใช้วงจรเดียวกับด่าน 5 ได้เลย กฎเดิมใช้ได้กับทุกทางแยกในเขาวงกตนี้"],
    gameType: "MAZE",
    mapLayout: [
      ["PATH", "PATH", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "PATH", "GOAL"],
    ],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 20,
    solution: PATTERN_D,
  },
  {
    levelNumber: 8,
    title: "เขาวงกตซับซ้อน",
    description: "เขาวงกตที่ยาวและซับซ้อนกว่าเดิม ยังคงใช้กฎการตัดสินใจสองด้านเช่นเดิม",
    hints: ["วงจรเดิมจากด่าน 5/7 ยังใช้ได้ - กฎ \"ขวาว่างเลี้ยวขวา ไม่ว่างเลี้ยวซ้าย\" ใช้ได้ทุกทางแยก"],
    gameType: "MAZE",
    mapLayout: [
      ["PATH", "PATH", "WALL", "WALL", "WALL"],
      ["WALL", "PATH", "PATH", "WALL", "WALL"],
      ["WALL", "WALL", "PATH", "PATH", "WALL"],
      ["WALL", "WALL", "WALL", "PATH", "GOAL"],
    ],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 25,
    solution: PATTERN_D,
  },
  {
    levelNumber: 9,
    title: "ทางแยกอันตราย",
    description: "ทางแยกแบบด่าน 5 อีกครั้ง แต่คราวนี้ถ้าต่อเอาต์พุตเลี้ยวสลับกันที่ทางแยกแรก หุ่นยนต์จะเดินเข้ากับดักอันตรายทันที",
    hints: ["ใช้วงจรเดียวกับด่าน 5 (การตัดสินใจสองด้าน) - ต่อ Y1/Y2 ให้ถูกด้าน ห้ามสลับ"],
    gameType: "MAZE",
    mapLayout: [
      ["WALL", "HAZARD", "WALL"],
      ["PATH", "PATH", "WALL"],
      ["WALL", "PATH", "GOAL"],
    ],
    robotStart: { x: 0, y: 1, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 20,
    solution: PATTERN_D,
  },
  {
    levelNumber: 10,
    title: "เขาวงกตสุดท้ายของหมวดพื้นฐาน",
    description: "ด่านสรุปหมวดพื้นฐาน: เขาวงกตรูปตัว U ขนาดใหญ่ เลี้ยวขวาทุกจุด เดินหน้าให้ถึงเป้าหมาย",
    hints: ["ใช้วงจรเดียวกับด่าน 2/4 (เลี้ยวขวาเสมอเมื่อเจอกำแพง)"],
    gameType: "MAZE",
    mapLayout: [
      ["PATH", "PATH", "PATH", "PATH", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["WALL", "WALL", "WALL", "WALL", "PATH"],
      ["GOAL", "PATH", "PATH", "PATH", "PATH"],
    ],
    robotStart: { x: 0, y: 0, direction: "E" },
    successConditions: [{ kind: "reach_goal" }],
    timeLimitTicks: 25,
    solution: PATTERN_B_RIGHT,
  },
  // ---- FACTORY 11-20 ----
  {
    levelNumber: 11,
    title: "สายพานพื้นฐาน",
    description: "เปิดสายพานลำเลียง (Y0) ตลอดเวลา เพื่อส่งสินค้า 1 ชิ้นออกจากสายพานให้สำเร็จ",
    hints: ["ใช้หน้าสัมผัส NC ต่อกับที่อยู่ที่ไม่ได้ใช้งาน (เช่น X9) แล้วต่อไป Y0 เพื่อให้สายพานเดินตลอดเวลา"],
    gameType: "FACTORY",
    factoryInitial: factory([{ id: "a", position: 0 }]),
    successConditions: [{ kind: "process_items", target: 1 }],
    timeLimitTicks: 50,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 12,
    title: "ล็อตสินค้า 2 ชิ้น",
    description: "เปิดสายพานลำเลียงส่งสินค้าให้ครบ 2 ชิ้น",
    hints: ["วงจรเดียวกับด่าน 11"],
    gameType: "FACTORY",
    factoryInitial: factory([
      { id: "a", position: 0 },
      { id: "b", position: 10 },
    ]),
    successConditions: [{ kind: "process_items", target: 2 }],
    timeLimitTicks: 60,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 13,
    title: "ล็อตสินค้าใหญ่",
    description: "ล็อตใหญ่ขึ้น ส่งสินค้าให้ครบ 4 ชิ้น",
    hints: ["วงจรเดียวกับด่าน 11/12"],
    gameType: "FACTORY",
    factoryInitial: factory([
      { id: "a", position: 0 },
      { id: "b", position: 10 },
      { id: "c", position: 20 },
      { id: "d", position: 30 },
    ]),
    successConditions: [{ kind: "process_items", target: 4 }],
    timeLimitTicks: 80,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 14,
    title: "ตรวจจับของเสีย",
    description: "มีสินค้าชิ้นหนึ่งเป็นของเสีย (ตรวจจับได้ที่ X1) ให้เขียนวงจรเก็บสถานะ \"พบของเสีย\" ไว้ในรีเลย์ภายใน M0 โดยใช้คำสั่ง SET",
    hints: ["ใช้หน้าสัมผัส NO ต่อกับ X1 แล้วต่อไปคำสั่ง SET M0 - เมื่อ SET แล้ว M0 จะค้างสถานะ true ตลอดไป"],
    gameType: "FACTORY",
    factoryInitial: factory([{ id: "a", position: 0, defective: true }]),
    successConditions: [{ kind: "bit", address: "M0", expected: true }],
    timeLimitTicks: 40,
    solution: DETECT_DEFECT,
  },
  {
    levelNumber: 15,
    title: "ดันของเสียออกจากสาย",
    description: "ต่อยอดจากด่านก่อนหน้า: เมื่อ M0 ติดค้างแล้ว ให้สั่งดันของออกจากสายพาน (Y1) ด้วย",
    hints: ["ต่อจากด่าน 14: เพิ่มหน้าสัมผัส NO ต่อกับ M0 แล้วต่อไปยัง Y1"],
    gameType: "FACTORY",
    factoryInitial: factory([{ id: "a", position: 0, defective: true }]),
    successConditions: [
      { kind: "bit", address: "M0", expected: true },
      { kind: "bit", address: "Y1", expected: true },
    ],
    timeLimitTicks: 40,
    solution: DETECT_AND_REJECT,
  },
  {
    levelNumber: 16,
    title: "ล็อตใหญ่ไม่มีของเสีย",
    description: "ทบทวนพื้นฐาน: ล็อตสินค้าดีล้วน 5 ชิ้น ให้สายพานทำงานจนกว่าจะส่งครบทุกชิ้น",
    hints: ["วงจรเดียวกับด่าน 11-13 ก็เพียงพอแล้ว"],
    gameType: "FACTORY",
    factoryInitial: factory([
      { id: "a", position: 0 },
      { id: "b", position: 10 },
      { id: "c", position: 20 },
      { id: "d", position: 30 },
      { id: "e", position: 40 },
    ]),
    successConditions: [{ kind: "process_items", target: 5 }],
    timeLimitTicks: 90,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 17,
    title: "กฎความปลอดภัยสายพาน",
    description:
      "ด่านนี้เปิดใช้กฎความปลอดภัย: ห้ามเปิดสายพาน (Y0) และตัวดัน (Y1) พร้อมกันเด็ดขาด ให้ส่งสินค้า 1 ชิ้นให้สำเร็จโดยไม่ละเมิดกฎ",
    hints: ["ด่านนี้ไม่มีของเสีย ไม่ต้องแตะ Y1 เลยก็ผ่านได้ - ใช้วงจรเดิมจากด่าน 11"],
    gameType: "FACTORY",
    factoryInitial: factory([{ id: "a", position: 0 }]),
    successConditions: [{ kind: "process_items", target: 1 }],
    safetyConstraints: [
      {
        id: "no-conveyor-pusher-overlap",
        description: "ห้ามเปิดสายพาน (Y0) และตัวดัน (Y1) พร้อมกัน",
        violatingWhen: [
          { kind: "bit", address: "Y0", expected: true },
          { kind: "bit", address: "Y1", expected: true },
        ],
      },
    ],
    timeLimitTicks: 50,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 18,
    title: "ของเสียพร้อมกฎความปลอดภัย",
    description:
      "รวมสองบทเรียน: ตรวจจับและดันของเสียออก (เหมือนด่าน 15) แต่ต้องไม่ละเมิดกฎห้ามเปิดสายพานกับตัวดันพร้อมกัน - ต้องหยุดสายพานก่อนดันของออก",
    hints: [
      "แก้วงจรด่าน 15: ให้สายพาน (Y0) ทำงานเฉพาะตอนที่ M0 ยังไม่ติด (ใช้หน้าสัมผัส NC ต่อกับ M0 อนุกรมกับสายพาน)",
      "NC(X9) ต่ออนุกรมกับ NC(M0) -> Y0, NO(X1) -> SET M0, NO(M0) -> Y1",
    ],
    gameType: "FACTORY",
    factoryInitial: factory([{ id: "a", position: 0, defective: true }]),
    successConditions: [
      { kind: "bit", address: "M0", expected: true },
      { kind: "bit", address: "Y1", expected: true },
    ],
    safetyConstraints: [
      {
        id: "no-conveyor-pusher-overlap",
        description: "ห้ามเปิดสายพาน (Y0) และตัวดัน (Y1) พร้อมกัน",
        violatingWhen: [
          { kind: "bit", address: "Y0", expected: true },
          { kind: "bit", address: "Y1", expected: true },
        ],
      },
    ],
    timeLimitTicks: 40,
    solution: DETECT_AND_REJECT_INTERLOCKED,
  },
  {
    levelNumber: 19,
    title: "ทบทวนกฎความปลอดภัย",
    description: "ทบทวน: ล็อตสินค้าดีล้วน 3 ชิ้น ภายใต้กฎห้ามเปิดสายพานกับตัวดันพร้อมกัน",
    hints: ["ไม่มีของเสีย ไม่ต้องแตะ Y1 - วงจรเดิมจากด่าน 11 ปลอดภัยอยู่แล้ว"],
    gameType: "FACTORY",
    factoryInitial: factory([
      { id: "a", position: 0 },
      { id: "b", position: 10 },
      { id: "c", position: 20 },
    ]),
    successConditions: [{ kind: "process_items", target: 3 }],
    safetyConstraints: [
      {
        id: "no-conveyor-pusher-overlap",
        description: "ห้ามเปิดสายพาน (Y0) และตัวดัน (Y1) พร้อมกัน",
        violatingWhen: [
          { kind: "bit", address: "Y0", expected: true },
          { kind: "bit", address: "Y1", expected: true },
        ],
      },
    ],
    timeLimitTicks: 70,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 20,
    title: "บทสรุปหมวดพื้นฐาน",
    description: "ด่านสรุปหมวดพื้นฐานดิจิทัล: ตรวจจับของเสีย ดันออกอย่างปลอดภัย ภายใต้กฎห้ามเปิดสายพานกับตัวดันพร้อมกัน (เหมือนด่าน 18)",
    hints: ["วงจรเดียวกับด่าน 18"],
    gameType: "FACTORY",
    factoryInitial: factory([{ id: "a", position: 0, defective: true }]),
    successConditions: [
      { kind: "bit", address: "M0", expected: true },
      { kind: "bit", address: "Y1", expected: true },
    ],
    safetyConstraints: [
      {
        id: "no-conveyor-pusher-overlap",
        description: "ห้ามเปิดสายพาน (Y0) และตัวดัน (Y1) พร้อมกัน",
        violatingWhen: [
          { kind: "bit", address: "Y0", expected: true },
          { kind: "bit", address: "Y1", expected: true },
        ],
      },
    ],
    timeLimitTicks: 40,
    solution: DETECT_AND_REJECT_INTERLOCKED,
  },
];

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

/** Runs a level's reference solution against the real engine and confirms it resolves "won" - mirrors the earlier one-off verification script, folded permanently into generation so every future regeneration re-checks itself. */
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
  const outPath = "./scripts/level-gen/game-levels-1-20.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nAll ${levels.length} levels verified. Wrote ${outPath}.`);
}

main();
