/**
 * New independently-numbered 50-level Factory Simulator track (levels
 * 1-50, own number line per migration 0014), replacing the old 50-level
 * track entirely. Six chapters, each its own scenario, progressively
 * combined toward a finale that layers several mechanics onto one
 * program at once - see generate-factory-mechanics.ts for where the
 * sorting-robot/reversible-conveyor/traffic-light solutions and their
 * calibrated timing constants (item spawn cutoff, pulse durations, safe
 * same-category spacing) were originally derived and self-verified; this
 * script reuses those exact constants rather than re-deriving them.
 *
 * Chapters:
 *   1 (1-8):   Basic conveyor - belt, defect-reject, safety interlock
 *   2 (9-16):  Tank & heater - interlock -> bang-bang -> dry-boil safety
 *   3 (17-24): Sorting robot - 1 -> 3 categories
 *   4 (25-32): Reversible conveyor - single item -> whole-batch return
 *   5 (33-40): Traffic light - delayed-open -> full cycle -> multi-item
 *   6 (41-50): Combined finale - sort+gate, gate+reverse, then heater
 *              layered on top of each (heater physics are unconditional
 *              and address-independent from every belt mechanic, so
 *              combining is risk-free - confirmed by inspection, not
 *              just assumed, since every output address is distinct:
 *              Y0 belt, Y1 pusher, Y2 heater, Y3 robot arm, Y4 reverse,
 *              Y5/Y6/Y7 lights). Sort+reverse is deliberately NOT
 *              combined - reverse is a whole-belt direction flip, so
 *              mixing it with per-item sorting is a fragile combination
 *              that was not worth the added risk for this batch.
 *
 * Every level is self-verified against the real engine (runGridScan +
 * evaluateGameLevelTick) before being written out.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-factory-50.ts
 *   npx tsx scripts/replace-factory-levels.ts
 */
import { writeFileSync } from "fs";
import { NC, NO, SET, RESET, COIL, TON, CMPCONST, seriesRung, program } from "./grid-builders";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createFactoryGameState, factoryBinding } from "../../src/lib/games/factory-plc-binding";
import type { ConveyorItem, FactoryState } from "../../src/lib/games/factory-types";
import type { GameLevelSpec, SuccessCondition } from "../../src/lib/games/game-level-types";
import type { SafetyConstraint } from "../../src/lib/ladder/challenge-types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `f50_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}
function factory(items: ConveyorItem[], extra?: Partial<FactoryState>): FactoryState {
  return { conveyorRunning: false, items, tankLevel: 0, pusherExtended: false, heaterOn: false, temperature: 0, ...extra };
}
function item(id: string, position: number, opts?: { category?: 0 | 1 | 2; defective?: boolean }): ConveyorItem {
  return { id, position, category: opts?.category, defective: opts?.defective };
}
const conveyorAlways = () => rung([NC("X9")], COIL("Y0"));
const NO_OVERLAP: SafetyConstraint = {
  id: "no-conveyor-pusher-overlap",
  description: "ห้ามเปิดสายพาน (Y0) และตัวดัน (Y1) พร้อมกัน",
  violatingWhen: [
    { kind: "bit", address: "Y0", expected: true },
    { kind: "bit", address: "Y1", expected: true },
  ],
};
function dryBoilSafety(tankThreshold: number): SafetyConstraint {
  return {
    id: "no-dry-boil",
    description: "ห้ามเปิดฮีตเตอร์ (Y2) ขณะระดับถัง (AI1) ต่ำกว่าเกณฑ์ (ป้องกันต้มแห้ง)",
    violatingWhen: [
      { kind: "bit", address: "Y2", expected: true },
      { kind: "numeric", address: "AI1", operator: "<", value: tankThreshold },
    ],
  };
}

// ============================================================
// Chapter 1 building blocks (belt / defect-reject / safety interlock)
// ============================================================
const CONVEYOR_ALWAYS_ON: GridProgram = program(conveyorAlways());
const DETECT_DEFECT: GridProgram = program(conveyorAlways(), rung([NO("X1")], SET("M0")));
const DETECT_AND_REJECT: GridProgram = program(...DETECT_DEFECT.grids, rung([NO("M0")], COIL("Y1")));
const DETECT_AND_REJECT_INTERLOCKED: GridProgram = program(
  rung([NO("X1")], SET("M0")),
  rung([NC("X9"), NC("M0")], COIL("Y0")),
  rung([NO("M0")], COIL("Y1"))
);

// ============================================================
// Chapter 2 building blocks (tank & heater)
// ============================================================
function interlockedHeater(tankThreshold: number): GridProgram {
  return program(conveyorAlways(), rung([CMPCONST(">=", "AI1", tankThreshold)], COIL("Y2")));
}
function bangBangHeater(tankThreshold: number, tempTarget: number): GridProgram {
  return program(conveyorAlways(), rung([CMPCONST(">=", "AI1", tankThreshold), CMPCONST("<", "AI2", tempTarget)], COIL("Y2")));
}

// ============================================================
// Chapters 3-5 + 6 building blocks (sorting robot / reverse / gate)
// Timing constants below are the exact ones self-verified in
// generate-factory-mechanics.ts - see that file for the empirical story.
// ============================================================
function sortSolution(robotPulseTicks: number, pusherPulseTicks: number): GridProgram {
  return program(
    conveyorAlways(),
    rung([CMPCONST("==", "AI3", 1)], SET("M1")),
    rung([NO("M1")], TON("T1", robotPulseTicks)),
    rung([NO("M1")], COIL("Y3")),
    rung([NO("T1.DN")], RESET("M1")),
    rung([CMPCONST("==", "AI3", 2)], SET("M2")),
    rung([NO("M2")], TON("T2", pusherPulseTicks)),
    rung([NO("M2")], COIL("Y1")),
    rung([NO("T2.DN")], RESET("M2"))
  );
}
const SORT_ROBOT_PULSE = 5;
const SORT_PUSHER_PULSE = 11;

function reverseOnceSolution(): GridProgram {
  return program(conveyorAlways(), rung([NO("X1")], SET("M0")), rung([NO("M0")], COIL("Y4")));
}
function reversePulseSolution(pulseTicks: number): GridProgram {
  return program(
    conveyorAlways(),
    rung([NO("X1")], SET("M0")),
    rung([NO("M0")], TON("T0", pulseTicks)),
    rung([NO("M0")], COIL("Y4")),
    rung([NO("T0.DN")], RESET("M0"))
  );
}
const REVERSE_PULSE = 20;

function gateDelayedOpenSolution(delayTicks: number): GridProgram {
  return program(conveyorAlways(), rung([NC("X9")], TON("T0", delayTicks)), rung([NO("T0.DN")], COIL("Y7")));
}
function gateCycleSolution(greenTicks: number, yellowTicks: number, redTicks: number): GridProgram {
  return program(
    conveyorAlways(),
    rung([NC("M_Y"), NC("M_R")], COIL("Y7")),
    rung([NO("Y7")], TON("TG", greenTicks)),
    rung([NO("TG.DN")], SET("M_Y")),
    rung([NO("M_Y")], COIL("Y6")),
    rung([NO("M_Y")], TON("TY", yellowTicks)),
    rung([NO("TY.DN")], RESET("M_Y")),
    rung([NO("TY.DN")], SET("M_R")),
    rung([NO("M_R")], COIL("Y5")),
    rung([NO("M_R")], TON("TR", redTicks)),
    rung([NO("TR.DN")], RESET("M_R"))
  );
}
/** Drops each helper's own duplicate conveyorAlways() (always rungs[0]) before merging - a repeated identical rung is harmless but pointless. */
function mergePrograms(...programs: GridProgram[]): GridProgram {
  return program(conveyorAlways(), ...programs.flatMap((p) => p.grids.slice(1)));
}
function sortWithGateSolution(greenTicks: number, yellowTicks: number, redTicks: number): GridProgram {
  return mergePrograms(gateCycleSolution(greenTicks, yellowTicks, redTicks), sortSolution(SORT_ROBOT_PULSE, SORT_PUSHER_PULSE));
}
function reverseWithGateSolution(greenTicks: number, yellowTicks: number, redTicks: number, reversePulseTicks: number): GridProgram {
  return mergePrograms(gateCycleSolution(greenTicks, yellowTicks, redTicks), reversePulseSolution(reversePulseTicks));
}

const SORT_HINTS = [
  "AI3 คือหมวดหมู่ (category) ของชิ้นงานที่อยู่ในจุดตรวจจับตอนนี้ (0, 1 หรือ 2)",
  "ใช้ CMP: AI3 == 1 -> SET M1 แล้วต่อ M1 -> Y3 (แขนหุ่นยนต์ ดันไปถังที่ 1) - ต่อ TON หน่วงเวลาแล้ว RESET M1 เมื่อครบ เพื่อให้พร้อมรับชิ้นถัดไป",
  "ทำแบบเดียวกันกับ AI3 == 2 -> SET M2 -> Y1 (ตัวดัน ดันไปถังที่ 2) - ชิ้นที่ไม่ถูกดันเลยจะไหลผ่านไปถังที่ 0 เอง",
];
const REVERSE_HINTS = ["X1 คือเซ็นเซอร์ตรวจของเสีย - ต่อ NO(X1) -> SET M0 แล้วต่อ M0 -> Y4 (ย้อนกลับ) เพื่อส่งของเสียกลับไปจุดเริ่ม"];
const GATE_HINTS = [
  "Y5 = ไฟแดง, Y6 = ไฟเหลือง, Y7 = ไฟเขียว - สายพานจะผ่านประตูได้ก็ต่อเมื่อ Y7 ติดเท่านั้น",
  "วงจรไฟจราจรวนซ้ำ: ไฟเขียวติดเมื่อไม่ใช่ช่วงเหลือง/แดง ใช้ TON นับเวลาแต่ละสี แล้ว SET/RESET รีเลย์ภายในสลับสถานะ",
];
const HEATER_HINTS = [
  "ใช้ CMP: AI1 >= ค่าคงที่ (ระดับถังพร้อม) ก่อนอนุญาตให้เปิดฮีตเตอร์ (Y2)",
  "เพิ่ม CMP ตัวที่สองอนุกรมกัน: AI2 < เป้าหมาย เพื่อให้ฮีตเตอร์ปิดเองเมื่อถึงเป้าหมาย",
];

type LevelDef = {
  levelNumber: number;
  title: string;
  description: string;
  hints: string[];
  factoryInitial: FactoryState;
  successConditions: SuccessCondition[];
  safetyConstraints?: SafetyConstraint[];
  timeLimitTicks: number;
  solution: GridProgram;
};

const levels: LevelDef[] = [];

// ============================================================
// Chapter 1 (1-8): Basic conveyor
// ============================================================
levels.push(
  {
    levelNumber: 1,
    title: "สายพานพื้นฐาน",
    description: "เปิดสายพานลำเลียงให้ทำงานตลอดเวลา เพื่อส่งสินค้า 1 ชิ้นออกจากปลายสายพานให้สำเร็จ",
    hints: ["ใช้หน้าสัมผัส NC ต่อกับที่อยู่ที่ไม่ได้ใช้งาน (เช่น X9) แล้วต่อไป Y0 เพื่อให้สายพานเดินตลอดเวลา"],
    factoryInitial: factory([item("a", 0)]),
    successConditions: [{ kind: "process_items", target: 1 }],
    timeLimitTicks: 50,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 2,
    title: "ล็อตสินค้า 3 ชิ้น",
    description: "เปิดสายพานลำเลียงส่งสินค้าให้ครบ 3 ชิ้น",
    hints: ["วงจรเดียวกับด่านที่ 1"],
    factoryInitial: factory([item("a", 0), item("b", 10), item("c", 20)]),
    successConditions: [{ kind: "process_items", target: 3 }],
    timeLimitTicks: 70,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 3,
    title: "ล็อตสินค้าใหญ่",
    description: "ล็อตใหญ่ขึ้น ส่งสินค้าให้ครบ 5 ชิ้น",
    hints: ["วงจรเดียวกับด่านก่อนหน้า"],
    factoryInitial: factory([item("a", 0), item("b", 10), item("c", 20), item("d", 30), item("e", 40)]),
    successConditions: [{ kind: "process_items", target: 5 }],
    timeLimitTicks: 90,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 4,
    title: "ตรวจจับของเสีย",
    description: 'มีสินค้าชิ้นหนึ่งเป็นของเสีย เมื่อเซนเซอร์ตรวจพบ ให้เขียนวงจรจดจำสถานะ "พบของเสียแล้ว" ค้างไว้ (ใช้คำสั่ง SET กับรีเลย์ภายใน)',
    hints: ["ใช้หน้าสัมผัส NO ต่อกับ X1 แล้วต่อไปคำสั่ง SET M0"],
    factoryInitial: factory([item("a", 0, { defective: true })]),
    successConditions: [{ kind: "bit", address: "M0", expected: true }],
    timeLimitTicks: 40,
    solution: DETECT_DEFECT,
  },
  {
    levelNumber: 5,
    title: "ดันของเสียออกจากสาย",
    description: "ต่อยอดจากด่านก่อนหน้า: เมื่อจดจำสถานะ \"พบของเสีย\" ได้แล้ว ให้สั่งแขนดันของเสียออกจากสายพานด้วย",
    hints: ["ต่อจากด่านก่อนหน้า: เพิ่มหน้าสัมผัส NO ต่อกับ M0 แล้วต่อไปยัง Y1"],
    factoryInitial: factory([item("a", 0, { defective: true })]),
    successConditions: [
      { kind: "bit", address: "M0", expected: true },
      { kind: "bit", address: "Y1", expected: true },
    ],
    timeLimitTicks: 40,
    solution: DETECT_AND_REJECT,
  },
  {
    levelNumber: 6,
    title: "กฎความปลอดภัยสายพาน",
    description: "ด่านนี้เปิดใช้กฎความปลอดภัย: ห้ามเปิดสายพานและตัวดันพร้อมกันเด็ดขาด ให้ส่งสินค้า 1 ชิ้นให้สำเร็จโดยไม่ละเมิดกฎ",
    hints: ["ด่านนี้ไม่มีของเสีย ไม่ต้องแตะ Y1 เลยก็ผ่านได้"],
    factoryInitial: factory([item("a", 0)]),
    successConditions: [{ kind: "process_items", target: 1 }],
    safetyConstraints: [NO_OVERLAP],
    timeLimitTicks: 50,
    solution: CONVEYOR_ALWAYS_ON,
  },
  {
    levelNumber: 7,
    title: "ของเสียพร้อมกฎความปลอดภัย",
    description: "รวมสองบทเรียน: ตรวจจับและดันของเสียออก แต่ต้องไม่ละเมิดกฎห้ามเปิดสายพานกับตัวดันพร้อมกัน - ต้องหยุดสายพานก่อนดันของออก",
    hints: ["ให้สายพาน (Y0) ทำงานเฉพาะตอนที่ M0 ยังไม่ติด (ใช้หน้าสัมผัส NC ต่อกับ M0 อนุกรมกับสายพาน)"],
    factoryInitial: factory([item("a", 0, { defective: true })]),
    successConditions: [
      { kind: "bit", address: "M0", expected: true },
      { kind: "bit", address: "Y1", expected: true },
    ],
    safetyConstraints: [NO_OVERLAP],
    timeLimitTicks: 40,
    solution: DETECT_AND_REJECT_INTERLOCKED,
  },
  {
    levelNumber: 8,
    title: "บทสรุปหมวดพื้นฐาน",
    description: "ด่านสรุปหมวดพื้นฐาน: ตรวจจับและดันของเสียออกอย่างปลอดภัย ภายใต้กฎห้ามเปิดสายพานกับตัวดันพร้อมกัน",
    hints: ["วงจรเดียวกับด่านก่อนหน้า"],
    factoryInitial: factory([item("a", 0, { defective: true })]),
    successConditions: [
      { kind: "bit", address: "M0", expected: true },
      { kind: "bit", address: "Y1", expected: true },
    ],
    safetyConstraints: [NO_OVERLAP],
    timeLimitTicks: 40,
    solution: DETECT_AND_REJECT_INTERLOCKED,
  }
);

// ============================================================
// Chapter 2 (9-16): Tank & heater
// ============================================================
const HEATER_DEFS: { title: string; description: string; tankThreshold: number; tempTarget: number; bangBang: boolean; dryBoil: boolean }[] = [
  { title: "รอถังน้ำก่อนเปิดฮีตเตอร์", description: "เปิดฮีตเตอร์ได้ก็ต่อเมื่อระดับน้ำถึงเกณฑ์เท่านั้น", tankThreshold: 1000, tempTarget: 1500, bangBang: false, dryBoil: false },
  { title: "เกณฑ์ถังสูงขึ้น", description: "เกณฑ์ถังและอุณหภูมิเป้าหมายสูงขึ้น", tankThreshold: 1200, tempTarget: 2000, bangBang: false, dryBoil: false },
  { title: "ปิดฮีตเตอร์อัตโนมัติ", description: "เพิ่ม CMP ตัวที่สอง เพื่อให้ฮีตเตอร์ปิดเองทันทีที่ถึงอุณหภูมิเป้าหมาย", tankThreshold: 1000, tempTarget: 2000, bangBang: true, dryBoil: false },
  { title: "ปิดอัตโนมัติ เป้าหมายสูงขึ้น", description: "ปิดฮีตเตอร์อัตโนมัติเหมือนเดิม แต่อุณหภูมิเป้าหมายสูงขึ้น", tankThreshold: 1300, tempTarget: 2400, bangBang: true, dryBoil: false },
  { title: "กฎห้ามต้มแห้ง", description: "เปิดใช้กฎความปลอดภัย: ห้ามเปิดฮีตเตอร์ขณะระดับถังต่ำกว่าเกณฑ์", tankThreshold: 1000, tempTarget: 2000, bangBang: true, dryBoil: true },
  { title: "กฎห้ามต้มแห้ง เกณฑ์สูงขึ้น", description: "กฎห้ามต้มแห้งเหมือนเดิม แต่เกณฑ์ถังและอุณหภูมิเป้าหมายสูงขึ้น", tankThreshold: 1500, tempTarget: 2500, bangBang: true, dryBoil: true },
  { title: "กฎห้ามต้มแห้ง เป้าหมายสูงสุด", description: "อุณหภูมิเป้าหมายสูงที่สุดในหมวดนี้ ยังต้องไม่ละเมิดกฎห้ามต้มแห้ง", tankThreshold: 1800, tempTarget: 2900, bangBang: true, dryBoil: true },
  { title: "บทสรุปหมวดถังน้ำและฮีตเตอร์", description: "เกณฑ์ถังและอุณหภูมิเป้าหมายสูงที่สุด พร้อมกฎห้ามต้มแห้ง", tankThreshold: 2000, tempTarget: 3200, bangBang: true, dryBoil: true },
];
HEATER_DEFS.forEach((d, i) => {
  const solution = d.bangBang ? bangBangHeater(d.tankThreshold, d.tempTarget) : interlockedHeater(d.tankThreshold);
  levels.push({
    levelNumber: 9 + i,
    title: d.title,
    description: `${d.description} (ระดับน้ำในถังต้องถึง ${d.tankThreshold} และอุณหภูมิเป้าหมายอยู่ที่ ${d.tempTarget})`,
    hints: d.bangBang ? HEATER_HINTS : [HEATER_HINTS[0]],
    factoryInitial: factory([]),
    successConditions: [{ kind: "numeric", address: "AI2", operator: ">=", value: d.tempTarget }],
    safetyConstraints: d.dryBoil ? [dryBoilSafety(d.tankThreshold)] : undefined,
    timeLimitTicks: Math.ceil(d.tempTarget / 60) + Math.ceil(d.tankThreshold / 40) + 20,
    solution,
  });
});

// ============================================================
// Chapter 3 (17-24): Sorting robot
// ============================================================
type SortDef = { title: string; description: string; items: ConveyorItem[] };
const SORT_DEFS: SortDef[] = [
  { title: "แนะนำหุ่นยนต์คัดแยก", description: "ชิ้นงานหมวดหมู่ 1 ทั้งหมดต้องถูกแขนหุ่นยนต์ดันไปยังถังที่ 1 ให้ครบ", items: [item("a", 0, { category: 1 })] },
  {
    title: "คัดแยกหมวด 1 สองชิ้น",
    description: "หมวด 1 สองชิ้นเรียงกัน ทั้งสองชิ้นต้องถูกดันไปถังที่ 1",
    items: [item("a", 0, { category: 1 }), item("b", 15, { category: 1 })],
  },
  {
    title: "คัดแยกหมวด 1 สามชิ้น",
    description: "หมวด 1 สามชิ้นเรียงกัน",
    items: [item("a", 0, { category: 1 }), item("b", 15, { category: 1 }), item("c", 30, { category: 1 })],
  },
  {
    title: "คัดแยกสองหมวดหมู่",
    description: "หมวด 1 ต้องไปถังที่ 1, หมวด 2 ต้องไปถังที่ 2",
    items: [item("a", 0, { category: 1 }), item("b", 20, { category: 2 })],
  },
  {
    title: "คัดแยกสองหมวดหมู่ สามชิ้น",
    description: "หมวด 1 สองชิ้นและหมวด 2 หนึ่งชิ้น",
    items: [item("a", 0, { category: 1 }), item("b", 20, { category: 2 }), item("c", 40, { category: 1 })],
  },
  {
    title: "คัดแยกครบสามหมวดหมู่",
    description: "หมวด 0 ไหลผ่านเอง หมวด 1 ไปถังที่ 1 หมวด 2 ไปถังที่ 2",
    items: [item("a", 0, { category: 0 }), item("b", 15, { category: 1 }), item("c", 30, { category: 2 })],
  },
  {
    title: "คัดแยกสี่ชิ้นครบสามหมวดหมู่",
    description: "สี่ชิ้นครบสามหมวดหมู่ (หมวด 1 สองชิ้น)",
    items: [item("a", 0, { category: 0 }), item("b", 15, { category: 1 }), item("c", 30, { category: 2 }), item("d", 45, { category: 1 })],
  },
  {
    title: "บทสรุปหมวดคัดแยก",
    description: "ด่านสรุป: คัดแยกสี่ชิ้นครบสามหมวดหมู่ให้ถูกถังทุกชิ้น",
    items: [item("a", 0, { category: 0 }), item("b", 15, { category: 1 }), item("c", 30, { category: 2 }), item("d", 45, { category: 1 })],
  },
];
SORT_DEFS.forEach((d, i) => {
  levels.push({
    levelNumber: 17 + i,
    title: d.title,
    description: d.description,
    hints: SORT_HINTS,
    factoryInitial: factory(d.items),
    successConditions: [{ kind: "sort_items", target: d.items.length }],
    timeLimitTicks: 45 + d.items.length * 12,
    solution: sortSolution(SORT_ROBOT_PULSE, SORT_PUSHER_PULSE),
  });
});

// ============================================================
// Chapter 4 (25-32): Reversible conveyor
// ============================================================
type ReverseDef = { title: string; description: string; items: ConveyorItem[]; once: boolean };
const REVERSE_DEFS: ReverseDef[] = [
  { title: "แนะนำสายพานย้อนกลับ", description: "พบของเสีย 1 ชิ้น ให้สั่งสายพานย้อนกลับเพื่อส่งของเสียกลับไปจุดเริ่มต้น", items: [item("a", 0, { defective: true })], once: true },
  { title: "ของเสียอยู่ไกลขึ้น", description: "ของเสียเริ่มอยู่ไกลจากจุดเริ่มมากขึ้น", items: [item("a", 20, { defective: true })], once: true },
  {
    title: "ของเสียสองชิ้น",
    description: "ของเสีย 2 ชิ้นเรียงกัน ต้องย้อนกลับทั้งคู่",
    items: [item("a", 0, { defective: true }), item("b", 40, { defective: true })],
    once: false,
  },
  {
    title: "ของเสียสองชิ้น ห่างขึ้น",
    description: "ของเสีย 2 ชิ้น ห่างกันมากขึ้น",
    items: [item("a", 0, { defective: true }), item("b", 50, { defective: true })],
    once: false,
  },
  {
    title: "ของเสียสามชิ้น",
    description: "ของเสีย 3 ชิ้นเรียงกัน ย้อนกลับทั้งชุด",
    items: [item("a", 0, { defective: true }), item("b", 25, { defective: true }), item("c", 50, { defective: true })],
    once: false,
  },
  {
    title: "ของเสียสี่ชิ้น",
    description: "ของเสีย 4 ชิ้นเรียงกัน",
    items: [item("a", 0, { defective: true }), item("b", 18, { defective: true }), item("c", 36, { defective: true }), item("d", 54, { defective: true })],
    once: false,
  },
  {
    title: "ของเสียห้าชิ้น",
    description: "ของเสีย 5 ชิ้นเรียงกันชิดขึ้น",
    items: [
      item("a", 0, { defective: true }),
      item("b", 12, { defective: true }),
      item("c", 24, { defective: true }),
      item("d", 36, { defective: true }),
      item("e", 48, { defective: true }),
    ],
    once: false,
  },
  {
    title: "บทสรุปหมวดสายพานย้อนกลับ",
    description: "ด่านสรุป: ของเสียทั้งชุด 5 ชิ้น ย้อนกลับให้ครบทุกชิ้น",
    items: [
      item("a", 0, { defective: true }),
      item("b", 12, { defective: true }),
      item("c", 24, { defective: true }),
      item("d", 36, { defective: true }),
      item("e", 48, { defective: true }),
    ],
    once: false,
  },
];
REVERSE_DEFS.forEach((d, i) => {
  levels.push({
    levelNumber: 25 + i,
    title: d.title,
    description: d.description,
    hints: d.once ? REVERSE_HINTS : [...REVERSE_HINTS, "ต่อ TON หน่วงเวลาการย้อนกลับ แล้ว RESET M0 เมื่อ TON นับครบ - ไม่งั้นสายพานจะย้อนกลับค้างตลอดไป"],
    factoryInitial: factory(d.items),
    successConditions: [{ kind: "return_items", target: d.items.length }],
    timeLimitTicks: 40 + d.items.length * 12,
    solution: d.once ? reverseOnceSolution() : reversePulseSolution(REVERSE_PULSE),
  });
});

// ============================================================
// Chapter 5 (33-40): Traffic light
// ============================================================
type GateDef = { title: string; description: string; items: ConveyorItem[]; solution: GridProgram };
const GATE_DEFS: GateDef[] = [
  { title: "แนะนำไฟจราจร", description: "ประตูปิดอยู่ก่อน (ไฟแดง) หน่วงเวลาสักครู่แล้วจึงเปิดไฟเขียวให้สินค้าผ่านไปได้", items: [item("a", 0)], solution: gateDelayedOpenSolution(10) },
  { title: "หน่วงเวลานานขึ้น", description: "หน่วงเวลาก่อนเปิดไฟเขียวนานขึ้น", items: [item("a", 0)], solution: gateDelayedOpenSolution(16) },
  { title: "วงจรไฟจราจรวนซ้ำ", description: "สร้างวงจรไฟจราจรที่วนซ้ำเอง (เขียว -> เหลือง -> แดง -> เขียว)", items: [item("a", 0)], solution: gateCycleSolution(8, 3, 6) },
  {
    title: "สองชิ้นผ่านประตู",
    description: "ชิ้นงาน 2 ชิ้นต้องผ่านประตูให้ครบ",
    items: [item("a", 0), item("b", 15)],
    solution: gateCycleSolution(8, 3, 6),
  },
  { title: "วงจรไฟจราจรรอบสั้นลง", description: "รอบไฟจราจรสั้นลง ต้องจับจังหวะให้ดี", items: [item("a", 0), item("b", 15)], solution: gateCycleSolution(6, 3, 5) },
  {
    title: "สามชิ้นผ่านประตู",
    description: "ชิ้นงาน 3 ชิ้นต้องผ่านประตูให้ครบ โดยบางชิ้นอาจต้องรอไฟเขียวรอบถัดไป",
    items: [item("a", 0), item("b", 15), item("c", 30)],
    solution: gateCycleSolution(8, 3, 6),
  },
  {
    title: "วงจรไฟจราจรรอบยาวขึ้น",
    description: "รอบไฟจราจรยาวขึ้น ต้องรอนานขึ้นในแต่ละรอบ",
    items: [item("a", 0), item("b", 15), item("c", 30)],
    solution: gateCycleSolution(10, 4, 8),
  },
  {
    title: "บทสรุปหมวดไฟจราจร",
    description: "ด่านสรุป: ชิ้นงาน 4 ชิ้นต้องผ่านประตูไฟจราจรให้ครบ",
    items: [item("a", 0), item("b", 15), item("c", 30), item("d", 45)],
    solution: gateCycleSolution(8, 3, 6),
  },
];
GATE_DEFS.forEach((d, i) => {
  levels.push({
    levelNumber: 33 + i,
    title: d.title,
    description: d.description,
    hints: GATE_HINTS,
    factoryInitial: factory(d.items, { gateEnabled: true }),
    successConditions: [{ kind: "process_items", target: d.items.length }],
    timeLimitTicks: 50 + d.items.length * 20,
    solution: d.solution,
  });
});

// ============================================================
// Chapter 6 (41-50): Combined finale
// ============================================================
levels.push(
  {
    levelNumber: 41,
    title: "คัดแยกผ่านประตูไฟจราจร",
    description: "รวมสองกลไก: ชิ้นงานต้องผ่านประตูไฟจราจรก่อน แล้วจึงถูกคัดแยกตามหมวดหมู่",
    hints: [...GATE_HINTS, ...SORT_HINTS],
    factoryInitial: factory([item("a", 0, { category: 1 }), item("b", 15, { category: 2 }), item("c", 30, { category: 1 })], { gateEnabled: true }),
    successConditions: [{ kind: "sort_items", target: 3 }],
    timeLimitTicks: 100,
    solution: sortWithGateSolution(8, 3, 6),
  },
  {
    levelNumber: 42,
    title: "คัดแยกผ่านประตู สี่ชิ้นครบสามหมวดหมู่",
    description: "รวมสองกลไก: ชิ้นงานครบ 3 หมวดหมู่ต้องผ่านประตูไฟจราจรแล้วถูกคัดแยกให้ถูกถังทุกชิ้น",
    hints: [...GATE_HINTS, ...SORT_HINTS],
    factoryInitial: factory([item("a", 0, { category: 0 }), item("b", 15, { category: 1 }), item("c", 30, { category: 2 }), item("d", 45, { category: 1 })], {
      gateEnabled: true,
    }),
    successConditions: [{ kind: "sort_items", target: 4 }],
    timeLimitTicks: 100,
    solution: sortWithGateSolution(8, 3, 6),
  },
  {
    levelNumber: 43,
    title: "ย้อนกลับผ่านประตูไฟจราจร",
    description: "รวมสองกลไก: ของเสียต้องผ่านประตูไฟจราจรก่อน แล้วจึงถูกย้อนกลับ",
    hints: [...GATE_HINTS, ...REVERSE_HINTS],
    factoryInitial: factory([item("a", 0, { defective: true }), item("b", 20, { defective: true })], { gateEnabled: true }),
    successConditions: [{ kind: "return_items", target: 2 }],
    timeLimitTicks: 100,
    solution: reverseWithGateSolution(8, 3, 6, REVERSE_PULSE),
  },
  {
    levelNumber: 44,
    title: "ย้อนกลับผ่านประตู สามชิ้น",
    description: "รวมสองกลไก: ของเสีย 3 ชิ้นต้องผ่านประตูไฟจราจรก่อน แล้วจึงถูกย้อนกลับทั้งชุด",
    hints: [...GATE_HINTS, ...REVERSE_HINTS],
    factoryInitial: factory([item("a", 0, { defective: true }), item("b", 15, { defective: true }), item("c", 30, { defective: true })], { gateEnabled: true }),
    successConditions: [{ kind: "return_items", target: 3 }],
    timeLimitTicks: 110,
    solution: reverseWithGateSolution(8, 3, 6, REVERSE_PULSE),
  },
  {
    levelNumber: 45,
    title: "ฮีตเตอร์พร้อมล็อตสินค้า",
    description: "ควบคุมฮีตเตอร์แบบ bang-bang ไปพร้อมกับส่งสินค้าล็อตหนึ่งบนสายพาน - สองระบบทำงานพร้อมกันแต่เป็นอิสระต่อกัน",
    hints: [...HEATER_HINTS, "ระบบถังน้ำ/ฮีตเตอร์ และสายพาน/สินค้า เป็นคนละระบบ ไม่ต้องรอกัน"],
    factoryInitial: factory([item("a", 0), item("b", 10), item("c", 20)]),
    successConditions: [
      { kind: "numeric", address: "AI2", operator: ">=", value: 2000 },
      { kind: "process_items", target: 3 },
    ],
    safetyConstraints: [dryBoilSafety(1000)],
    timeLimitTicks: 100,
    solution: mergePrograms(bangBangHeater(1000, 2000), CONVEYOR_ALWAYS_ON),
  },
  {
    levelNumber: 46,
    title: "ฮีตเตอร์พร้อมล็อตใหญ่",
    description: "เหมือนด่านก่อนหน้าแต่ล็อตสินค้าใหญ่ขึ้นและอุณหภูมิเป้าหมายสูงขึ้น",
    hints: HEATER_HINTS,
    factoryInitial: factory([item("a", 0), item("b", 10), item("c", 20), item("d", 30), item("e", 40)]),
    successConditions: [
      { kind: "numeric", address: "AI2", operator: ">=", value: 2400 },
      { kind: "process_items", target: 5 },
    ],
    safetyConstraints: [dryBoilSafety(1200)],
    timeLimitTicks: 130,
    solution: mergePrograms(bangBangHeater(1200, 2400), CONVEYOR_ALWAYS_ON),
  },
  {
    levelNumber: 47,
    title: "ฮีตเตอร์พร้อมคัดแยก",
    description: "ควบคุมฮีตเตอร์แบบ bang-bang ไปพร้อมกับคัดแยกสินค้า 2 หมวดหมู่",
    hints: [...HEATER_HINTS, ...SORT_HINTS],
    factoryInitial: factory([item("a", 0, { category: 1 }), item("b", 20, { category: 2 })]),
    successConditions: [
      { kind: "numeric", address: "AI2", operator: ">=", value: 2000 },
      { kind: "sort_items", target: 2 },
    ],
    safetyConstraints: [dryBoilSafety(1000)],
    timeLimitTicks: 110,
    solution: mergePrograms(bangBangHeater(1000, 2000), sortSolution(SORT_ROBOT_PULSE, SORT_PUSHER_PULSE)),
  },
  {
    levelNumber: 48,
    title: "ฮีตเตอร์พร้อมย้อนกลับ",
    description: "ควบคุมฮีตเตอร์แบบ bang-bang ไปพร้อมกับย้อนกลับของเสีย 2 ชิ้น",
    hints: [...HEATER_HINTS, ...REVERSE_HINTS],
    factoryInitial: factory([item("a", 0, { defective: true }), item("b", 40, { defective: true })]),
    successConditions: [
      { kind: "numeric", address: "AI2", operator: ">=", value: 2000 },
      { kind: "return_items", target: 2 },
    ],
    safetyConstraints: [dryBoilSafety(1000)],
    timeLimitTicks: 110,
    solution: mergePrograms(bangBangHeater(1000, 2000), reversePulseSolution(REVERSE_PULSE)),
  },
  {
    levelNumber: 49,
    title: "ฮีตเตอร์พร้อมคัดแยกผ่านประตู",
    description: "รวมสามกลไก: ฮีตเตอร์แบบ bang-bang พร้อมกับคัดแยกสินค้าผ่านประตูไฟจราจร",
    hints: [...HEATER_HINTS, ...GATE_HINTS, ...SORT_HINTS],
    factoryInitial: factory([item("a", 0, { category: 1 }), item("b", 15, { category: 2 }), item("c", 30, { category: 1 })], { gateEnabled: true }),
    successConditions: [
      { kind: "numeric", address: "AI2", operator: ">=", value: 2000 },
      { kind: "sort_items", target: 3 },
    ],
    safetyConstraints: [dryBoilSafety(1000)],
    timeLimitTicks: 130,
    solution: mergePrograms(bangBangHeater(1000, 2000), sortWithGateSolution(8, 3, 6)),
  },
  {
    levelNumber: 50,
    title: "บทสรุปสุดท้าย: สายการผลิตอัตโนมัติเต็มรูปแบบ",
    description: "ด่านสรุปหมวดขั้นสูง: รวมทุกกลไก - ฮีตเตอร์แบบ bang-bang, ประตูไฟจราจร, และคัดแยกสินค้าครบสามหมวดหมู่สี่ชิ้น",
    hints: [...HEATER_HINTS, ...GATE_HINTS, ...SORT_HINTS],
    factoryInitial: factory([item("a", 0, { category: 0 }), item("b", 15, { category: 1 }), item("c", 30, { category: 2 }), item("d", 45, { category: 1 })], {
      gateEnabled: true,
    }),
    successConditions: [
      { kind: "numeric", address: "AI2", operator: ">=", value: 2200 },
      { kind: "sort_items", target: 4 },
    ],
    safetyConstraints: [dryBoilSafety(1000)],
    timeLimitTicks: 140,
    solution: mergePrograms(bangBangHeater(1000, 2200), sortWithGateSolution(8, 3, 6)),
  }
);

// ============================================================
// Self-verify every level against the real engine before writing.
// ============================================================
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
    safetyConstraints: def.safetyConstraints,
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
    safety_constraints_json: def.safetyConstraints ?? [],
    time_limit_ticks: def.timeLimitTicks,
    ticks_per_second: null,
    reference_grid_program_json: def.solution,
  };
}

function main() {
  const levelNumbers = levels.map((l) => l.levelNumber);
  const missing: number[] = [];
  for (let n = 1; n <= 50; n++) if (!levelNumbers.includes(n)) missing.push(n);
  if (missing.length > 0) {
    console.error(`Missing level number(s): ${missing.join(",")}`);
    process.exit(1);
  }

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

  console.log(`Self-verified ${levels.length} factory levels: ${levelNumbers.join(",")}`);

  const rows = levels.sort((a, b) => a.levelNumber - b.levelNumber).map(toRow);
  const outPath = "./scripts/level-gen/game-levels-factory-50.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
