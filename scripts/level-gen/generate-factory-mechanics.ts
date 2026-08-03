/**
 * Replaces the 10 existing FACTORY levels 81-90 (the "Advanced Applied"
 * chapter's Factory sub-block) with a fresh progression exercising the 3
 * new Factory mechanics (factory-plc-binding.ts): sorting robot (Y3/AI3),
 * reversible conveyor (Y4), and traffic-light gate (Y5/Y6/Y7). Chosen slot
 * on purpose - same "advanced/summary chapter is the safe place for new
 * material" reasoning generate-maze-9x9.ts used for its own chapter 5.
 *
 * The conveyor only has ONE physical direction at a time (a real belt
 * can't run forward and backward simultaneously for different items), so
 * every reverse-mechanic level here returns a whole batch, never mixes
 * forward-bound and reverse-bound items on the same belt at once.
 *
 * Progression: 81-83 sorting robot (1 -> 2 -> 3 categories), 84-85
 * reversible conveyor (single item -> auto-resetting multi-item pulse),
 * 86-88 traffic light (delayed-open -> full R/Y/G cycle -> multi-item
 * cycle), 89-90 combine sorting + gate, ending on the hardest 3-category
 * sort-through-a-gate finale.
 *
 * Every level is self-verified against the real engine (runGridScan +
 * evaluateGameLevelTick) before being written out, same discipline as
 * every other generate-game-levels*.ts / generate-maze-9x9.ts script.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-factory-mechanics.ts
 *   npx tsx scripts/update-maze9x9-levels.ts ./scripts/level-gen/game-levels-factory-mechanics.json
 */
import { writeFileSync } from "fs";
import { NO, NC, SET, RESET, COIL, TON, CMPCONST, seriesRung, program } from "./grid-builders";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createFactoryGameState, factoryBinding } from "../../src/lib/games/factory-plc-binding";
import type { ConveyorItem, FactoryState } from "../../src/lib/games/factory-types";
import type { GameLevelSpec, SuccessCondition } from "../../src/lib/games/game-level-types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fm_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}
const conveyorAlways = () => rung([NC("X9")], COIL("Y0"));

function factory(items: ConveyorItem[], extra?: Partial<FactoryState>): FactoryState {
  return { conveyorRunning: false, items, tankLevel: 0, pusherExtended: false, heaterOn: false, temperature: 0, ...extra };
}
function item(id: string, position: number, category?: 0 | 1 | 2, defective?: boolean): ConveyorItem {
  return { id, position, category, defective };
}

// ---- Sorting robot: SET on category match, hold Y3/Y1 until the item has
// actually cleared that station, auto-RESET via TON. The robot arm (bin 1)
// sits much closer to the sensor than the pusher (bin 2) does, so bin 2's
// hold needs to be considerably longer - one shared pulse length under-held
// bin 2 and let the item ride straight through before the pusher fired.
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

// ---- Reverse: single-pulse (defect senses once, reverses forever - fine for exactly 1 item). ----
function reverseOnceSolution(): GridProgram {
  return program(conveyorAlways(), rung([NO("X1")], SET("M0")), rung([NO("M0")], COIL("Y4")));
}
// ---- Reverse: auto-resetting pulse (so a 2nd item still gets sensed forward after the 1st's reversal finishes). ----
function reversePulseSolution(pulseTicks: number): GridProgram {
  return program(
    conveyorAlways(),
    rung([NO("X1")], SET("M0")),
    rung([NO("M0")], TON("T0", pulseTicks)),
    rung([NO("M0")], COIL("Y4")),
    rung([NO("T0.DN")], RESET("M0"))
  );
}

// ---- Traffic light: delayed-open (never closes again once green). ----
function gateDelayedOpenSolution(delayTicks: number): GridProgram {
  return program(conveyorAlways(), rung([NC("X9")], TON("T0", delayTicks)), rung([NO("T0.DN")], COIL("Y7")));
}
// ---- Traffic light: full auto-cycling G -> Y -> R -> G sequencer. ----
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
// ---- Sort + gate combined: cyclic gate first, then sort once through. ----
function sortWithGateSolution(
  greenTicks: number,
  yellowTicks: number,
  redTicks: number,
  robotPulseTicks: number,
  pusherPulseTicks: number
): GridProgram {
  const gate = gateCycleSolution(greenTicks, yellowTicks, redTicks);
  const sort = sortSolution(robotPulseTicks, pusherPulseTicks);
  // conveyorAlways() is rungs[0] in both - drop the sort program's duplicate.
  return program(...gate.grids, ...sort.grids.slice(1));
}

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

const levels: LevelDef[] = [
  // ---- 81-83: Sorting robot ----
  {
    levelNumber: 81,
    title: "แนะนำหุ่นยนต์คัดแยก",
    description: "หุ่นยนต์คัดแยกวัตถุ: ชิ้นงานหมวดหมู่ 1 ทั้งหมดต้องถูกแขนหุ่นยนต์ (Y3) ดันไปถังที่ 1",
    hints: SORT_HINTS,
    factoryInitial: factory([item("a", 0, 1), item("b", 25, 1), item("c", 50, 1)]),
    successConditions: [{ kind: "sort_items", target: 3 }],
    timeLimitTicks: 45,
    solution: sortSolution(5, 11),
  },
  {
    levelNumber: 82,
    title: "คัดแยกสองหมวดหมู่",
    description: "คัดแยกวัตถุ 2 หมวดหมู่พร้อมกัน: หมวด 1 ไปถังที่ 1 (Y3), หมวด 2 ไปถังที่ 2 (Y1)",
    hints: SORT_HINTS,
    // Every item must spawn below SENSOR_POSITION+SENSOR_WINDOW (58) - a
    // conveyor only moves forward, so an item spawned past that point would
    // never enter the sensor window at all and could never be sorted. Only
    // ONE category-2 item here on purpose: the pusher's SET/TON/RESET latch
    // is a single continuous hold (not per-item), so two category-2 items
    // spaced closer together than the pusher's own hold duration would
    // merge into one hold that expires before the second item ever arrives
    // - confirmed empirically, see level 90's comment for the full story.
    factoryInitial: factory([item("a", 0, 1), item("b", 20, 2), item("c", 40, 1)]),
    successConditions: [{ kind: "sort_items", target: 3 }],
    timeLimitTicks: 50,
    solution: sortSolution(5, 11),
  },
  {
    levelNumber: 83,
    title: "บทสรุปหมวดคัดแยก (สามหมวดหมู่)",
    description: "ด่านสรุป: คัดแยกครบทั้ง 3 หมวดหมู่ - หมวด 0 ไหลผ่านเอง หมวด 1 ไปถังที่ 1 หมวด 2 ไปถังที่ 2",
    hints: SORT_HINTS,
    factoryInitial: factory([item("a", 0, 0), item("b", 15, 1), item("c", 30, 2), item("d", 45, 1)]),
    successConditions: [{ kind: "sort_items", target: 4 }],
    timeLimitTicks: 55,
    solution: sortSolution(5, 11),
  },
  // ---- 84-85: Reversible conveyor ----
  {
    levelNumber: 84,
    title: "แนะนำสายพานย้อนกลับ",
    description: "พบของเสีย 1 ชิ้น - ใช้สายพานย้อนกลับ (Y4) ส่งกลับไปจุดเริ่มต้นแทนการใช้ตัวดัน",
    hints: REVERSE_HINTS,
    factoryInitial: factory([item("a", 0, undefined, true)]),
    successConditions: [{ kind: "return_items", target: 1 }],
    timeLimitTicks: 40,
    solution: reverseOnceSolution(),
  },
  {
    levelNumber: 85,
    title: "บทสรุปสายพานย้อนกลับ (หลายชิ้น)",
    description: "ของเสีย 2 ชิ้นเรียงกัน - วงจรต้องย้อนกลับแล้ว \"รีเซ็ต\" ตัวเองให้พร้อมตรวจจับชิ้นถัดไปด้วย (ใช้ TON หน่วงเวลาแล้ว RESET)",
    hints: [...REVERSE_HINTS, "ต่อ TON หน่วงเวลาการย้อนกลับ แล้ว RESET M0 เมื่อ TON นับครบ - ไม่งั้นสายพานจะย้อนกลับค้างตลอดไป ตรวจจับชิ้นถัดไปไม่ได้"],
    factoryInitial: factory([item("a", 0, undefined, true), item("b", 40, undefined, true)]),
    successConditions: [{ kind: "return_items", target: 2 }],
    timeLimitTicks: 90,
    // A pulse must be long enough to send the item all the way past
    // position 0 in one hold (worst case ~58 units of belt / speed 3 ~ 20
    // ticks) - too short a pulse (confirmed empirically) only nudges the
    // item partway back, it resumes forward, re-triggers the sensor, and
    // the whole thing oscillates forever without ever actually exiting.
    solution: reversePulseSolution(20),
  },
  // ---- 86-88: Traffic light ----
  {
    levelNumber: 86,
    title: "แนะนำไฟจราจร",
    description: "ประตูไฟจราจรปิดอยู่ก่อน (ไฟแดง) - หน่วงเวลาแล้วเปิดไฟเขียว (Y7) ให้สายพานผ่านประตูไปได้",
    hints: GATE_HINTS,
    factoryInitial: factory([item("a", 0)], { gateEnabled: true }),
    successConditions: [{ kind: "process_items", target: 1 }],
    timeLimitTicks: 45,
    solution: gateDelayedOpenSolution(10),
  },
  {
    levelNumber: 87,
    title: "วงจรไฟจราจรวนซ้ำ",
    description: "สร้างวงจรไฟจราจรที่วนซ้ำเอง (เขียว -> เหลือง -> แดง -> เขียว) ให้ชิ้นงานผ่านประตูไปได้ในช่วงไฟเขียว",
    hints: GATE_HINTS,
    factoryInitial: factory([item("a", 0)], { gateEnabled: true }),
    successConditions: [{ kind: "process_items", target: 1 }],
    timeLimitTicks: 60,
    solution: gateCycleSolution(8, 3, 6),
  },
  {
    levelNumber: 88,
    title: "บทสรุปไฟจราจร (หลายชิ้น)",
    description: "ด่านสรุป: ชิ้นงานหลายชิ้นต้องผ่านประตูให้ครบ โดยบางชิ้นอาจต้องรอไฟเขียวรอบถัดไป",
    hints: GATE_HINTS,
    factoryInitial: factory([item("a", 0), item("b", 15), item("c", 30)], { gateEnabled: true }),
    successConditions: [{ kind: "process_items", target: 3 }],
    timeLimitTicks: 110,
    solution: gateCycleSolution(8, 3, 6),
  },
  // ---- 89-90: Sorting robot + traffic light combined ----
  {
    levelNumber: 89,
    title: "คัดแยกผ่านประตูไฟจราจร",
    description: "รวมสองกลไก: ชิ้นงานต้องผ่านประตูไฟจราจรก่อน แล้วจึงถูกคัดแยกตามหมวดหมู่",
    hints: [...GATE_HINTS, ...SORT_HINTS],
    factoryInitial: factory([item("a", 0, 1), item("b", 15, 2), item("c", 30, 1)], { gateEnabled: true }),
    successConditions: [{ kind: "sort_items", target: 3 }],
    timeLimitTicks: 100,
    solution: sortWithGateSolution(8, 3, 6, 5, 11),
  },
  {
    levelNumber: 90,
    title: "บทสรุปหมวดขั้นสูง (สายการผลิตอัตโนมัติเต็มรูปแบบ)",
    description: "ด่านสรุปฝั่งสายการผลิตของหมวดขั้นสูง: ชิ้นงานครบ 3 หมวดหมู่ต้องผ่านประตูไฟจราจรแล้วถูกคัดแยกให้ถูกถังทุกชิ้น",
    hints: [...GATE_HINTS, ...SORT_HINTS],
    // Same 4-item/15-spacing layout level 83 already proved reliable (its
    // pusher hold needs ~11 ticks to reach position 78 - at 5 items packed
    // into the 58-unit sensing cutoff, adjacent items are only 4 ticks
    // apart, well inside that hold, so the pusher started catching the
    // WRONG item entirely - confirmed empirically, not a spacing tweak
    // away). Keeping the finale at 4 items, gate added on top.
    factoryInitial: factory([item("a", 0, 0), item("b", 15, 1), item("c", 30, 2), item("d", 45, 1)], { gateEnabled: true }),
    successConditions: [{ kind: "sort_items", target: 4 }],
    timeLimitTicks: 100,
    solution: sortWithGateSolution(8, 3, 6, 5, 11),
  },
];

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
  const outcome = runFactory(spec, def.factoryInitial, def.solution, def.timeLimitTicks + 10);
  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): reference solution did not win within ${def.timeLimitTicks + 10} ticks - final outcome ${JSON.stringify(outcome)}`;
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

  console.log(`Self-verified ${levels.length} factory-mechanics levels: ${levels.map((l) => l.levelNumber).join(",")}`);

  const rows = levels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-factory-mechanics.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
