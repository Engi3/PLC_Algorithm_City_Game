/**
 * New 50-level Hybrid track (own independent 1-50 number line, migration
 * 0014's 'hybrid' game slug) - combines Maze navigation and Factory item
 * processing in ONE program, gated behind size/item-count that grow
 * across 5 chapters. The Maze/AGV half uses hybridMazeBinding's addresses
 * (X10-X12/Y10-Y12/AI10, maze-plc-binding.ts), fully distinct from the
 * Factory half's (X0-X1/Y0-Y7/AI1-AI3) - the two halves of the circuit
 * are independent rungs, no phase-detection needed on the student's part
 * (contrast the earlier design, still described in old commit history,
 * where both halves shared X0-X2/Y0-Y2 and the circuit had to self-detect
 * which phase was live from counter/timer state alone).
 *
 * Deliberately scoped to the SIMPLE factory pattern only (plain item
 * count via CTD, no reject/tank/heater) - combining a hazard-maze phase
 * WITH a defect-reject or bang-bang-heater factory phase in one circuit
 * is a further compounding of untested risk (mirrors why generate-
 * factory-50.ts's finale chapter deliberately never combines sort with
 * reverse).
 *
 * Every level is self-verified against the real engine (the exact same
 * phase-switching harness run-game-level.ts already uses) before being
 * written out.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-hybrid-50.ts
 *   npx tsx scripts/replace-hybrid-levels.ts
 */
import { writeFileSync } from "fs";
import { NC, NO, COIL, CTD, seriesRung, program } from "./grid-builders";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, checkSuccessCondition, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, hybridMazeBinding } from "../../src/lib/games/maze-plc-binding";
import { createFactoryGameState, factoryBinding } from "../../src/lib/games/factory-plc-binding";
import { generateDifficultyMaze, generateHazardMaze, type GeneratedMaze } from "./maze-gen";
import type { MazeMap, MazeRobotState } from "../../src/lib/games/maze-types";
import type { ConveyorItem, FactoryState } from "../../src/lib/games/factory-types";
import type { GameLevelSpec, SuccessCondition } from "../../src/lib/games/game-level-types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `h50_${idCounter}`;
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

// The Factory half (X0/Y0) and the Maze/AGV half (X10-X12/Y10-Y12) are
// fully independent rungs - the belt just runs continuously (NC("X9") is a
// never-set address, so it's always energized, same trick generate-
// factory-50.ts's conveyorAlways() uses) while the AGV's wall-follow logic
// runs unconditionally alongside it. Neither half's outputs affect the
// other's world (the harness only ever advances one domain's simulation
// per tick, gated by which phase is live), so there's no read/write
// collision and no phase-detection needed in the circuit itself. C0 still
// counts items past the sensor via CTD, purely as its own counter exercise
// (the success condition checks C0.DN) - it no longer gates anything else.
function hybridSolution(itemCount: number): GridProgram {
  return program(
    rung([NC("X9")], COIL("Y0")),
    rung([NO("X0")], CTD("C0", itemCount)),
    rung([NC("X10")], COIL("Y10")),
    rung([NO("X10"), NC("X12")], COIL("Y12")),
    rung([NO("X10"), NO("X12")], COIL("Y11"))
  );
}

type Tier = { size: number; count: number };
const TIERS: Tier[] = [
  { size: 5, count: 10 },
  { size: 7, count: 10 },
  { size: 9, count: 10 },
  { size: 11, count: 10 },
  { size: 13, count: 10 },
];

type PlannedLevel = { levelNumber: number; size: number; itemCount: number; tierIndex: number; tierLength: number; hazard: boolean };

const plannedLevels: PlannedLevel[] = [];
{
  let levelNumber = 1;
  TIERS.forEach((tier, tierNumber) => {
    for (let tierIndex = 0; tierIndex < tier.count; tierIndex++) {
      plannedLevels.push({
        levelNumber,
        size: tier.size,
        itemCount: Math.min(5, 1 + tierNumber + Math.floor(tierIndex / 4)),
        tierIndex,
        tierLength: tier.count,
        hazard: tierIndex >= Math.ceil(tier.count / 2),
      });
      levelNumber++;
    }
  });
}

function mazeTickBand(size: number, tierIndex: number, tierLength: number): [number, number] {
  const t = tierLength > 1 ? tierIndex / (tierLength - 1) : 0;
  return [Math.round(size * (1 + 2 * t)), Math.round(size * (2 + 4 * t))];
}

type LevelDef = {
  levelNumber: number;
  title: string;
  description: string;
  hints: string[];
  mapLayout: MazeMap;
  robotStart: MazeRobotState;
  factoryInitial: FactoryState;
  successConditions: SuccessCondition[];
  timeLimitTicks: number;
  solution: GridProgram;
};

const HINTS = [
  "สายการผลิตกับหุ่นยนต์ AGV ใช้ Address คนละชุดไม่ซ้ำกัน: สายพาน/โรงงานใช้ X0-X1, Y0-Y7 เหมือนด่าน Factory ปกติ ส่วน AGV ใช้ X10-X12 (เซนเซอร์กำแพง), Y10-Y12 (เดินหน้า/เลี้ยว) แยกต่างหาก",
  "เขียนวงจรทั้งสองส่วนแยกกันได้เลย ไม่ต้องกังวลว่าจะชนกัน - ให้สายพาน (Y0) เดินตลอดเวลา และให้หุ่นยนต์ AGV เดินหน้า/เลี้ยวตามเซนเซอร์กำแพง (X10-X12) ไปพร้อมกันในวงจรเดียว",
  "ใช้ CTD (ตัวนับถอยหลัง) ชื่อ C0 นับจำนวนชิ้นงานที่ผ่านเซนเซอร์ (NO(X0)) จนครบ - C0.DN จะติดเมื่อนับครบ (เป็นส่วนหนึ่งของเงื่อนไขผ่านด่าน)",
  "หุ่นยนต์ AGV ใช้หลักการเดียวกับด่าน Maze Explorer: เดินหน้าตลอดเวลาที่ไม่มีกำแพงข้างหน้า (NC(X10) → Y10) ถ้ามีกำแพงข้างหน้าให้เลี้ยวขวาก่อน ถ้าขวาก็มีกำแพงอีกให้เลี้ยวซ้าย (X12/X11 → Y12/Y11)",
];

const levels: LevelDef[] = plannedLevels.map((p) => {
  const [minTicks, maxTicks] = mazeTickBand(p.size, p.tierIndex, p.tierLength);
  const seed = 800000 + p.levelNumber * 7919;
  const base: GeneratedMaze = p.hazard
    ? generateHazardMaze(seed, p.size, minTicks, maxTicks, 500)
    : generateDifficultyMaze(seed, p.size, minTicks, maxTicks, 500);

  // Spacing must keep every item's spawn position under the sensor window
  // (55 +/- 3) - a fixed 18-unit spacing put the 5th item of a 5-item batch
  // at position 72, already past the window at tick 0, so it could never
  // trigger X0 and C0.DN would never latch (mirrors the item-spawn-past-
  // sensor bug fixed in generate-factory-50.ts).
  const itemSpacing = Math.floor(50 / p.itemCount);
  const items: ConveyorItem[] = Array.from({ length: p.itemCount }, (_, i) => item(String.fromCharCode(97 + i), i * itemSpacing));

  const isFinale = p.levelNumber === 50;
  const title = isFinale
    ? "บทสรุปสุดท้าย: สายการผลิตและเขาวงกตผสาน"
    : `สายการผลิต + เขาวงกต ${p.size}x${p.size} ด่านที่ ${p.levelNumber}${p.hazard ? " (ระวังกับดัก)" : ""}`;
  const description = isFinale
    ? `ด่านสรุปสุดท้าย: ประมวลผลสินค้า ${p.itemCount} ชิ้นบนสายพานให้ครบ แล้วหุ่นยนต์ AGV จะออกเดินทางผ่านเขาวงกต ${p.size}x${p.size} ที่มีกับดักไปยังเป้าหมาย`
    : `ประมวลผลสินค้า ${p.itemCount} ชิ้นบนสายพานให้ครบก่อน แล้วหุ่นยนต์ AGV จะออกเดินทางผ่านเขาวงกต ${p.size}x${p.size}${p.hazard ? " (มีกับดัก)" : ""}ไปยังเป้าหมาย`;

  const factoryTicksEstimate = Math.ceil((100 + p.itemCount * 18) / 3) + 15;
  const timeLimitTicks = factoryTicksEstimate + base.solveTicks + p.size * 2 + 20;

  return {
    levelNumber: p.levelNumber,
    title,
    description,
    hints: HINTS,
    mapLayout: base.map,
    robotStart: base.start,
    factoryInitial: factory(items),
    successConditions: [
      { kind: "bit", address: "C0.DN", expected: true },
      { kind: "process_items", target: p.itemCount },
      { kind: "reach_goal" },
    ],
    timeLimitTicks,
    solution: hybridSolution(p.itemCount),
  };
});

// ============================================================
// Self-verify every level via the exact phase-switching harness
// run-game-level.ts uses (re-derived locally so this script has no
// runtime dependency on that module's DEFAULT_MAX_TICKS constant).
// ============================================================
function toSpec(def: LevelDef): GameLevelSpec {
  return {
    levelNumber: def.levelNumber,
    title: def.title,
    description: def.description,
    hints: def.hints,
    gameType: "HYBRID",
    mapLayout: def.mapLayout,
    robotStart: def.robotStart,
    factoryInitial: def.factoryInitial,
    successConditions: def.successConditions,
  };
}

function verifyLevel(def: LevelDef): string | null {
  const spec = toSpec(def);
  const maxTicks = def.timeLimitTicks + 15;

  let run: GameRunState = {
    maze: createMazeGameState(def.mapLayout, def.robotStart),
    factory: createFactoryGameState(def.factoryInitial),
  };
  let memory: SimMemory = createEmptyMemory();
  let phase: "factory" | "maze" = "factory";
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;

  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const usesMaze = phase === "maze";
    const binding = usesMaze ? hybridMazeBinding : factoryBinding;
    const state = usesMaze ? run.maze! : run.factory!;
    const { inputs, analogInputs } = binding.readInputs(state as never);
    const { memory: nextMemory } = runGridScan(def.solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = usesMaze
      ? { ...run, maze: hybridMazeBinding.step(run.maze!, memory.coils, memory) }
      : { ...run, factory: factoryBinding.step(run.factory!, memory.coils, memory) };

    if (phase === "factory") {
      const nonGoalConditions = spec.successConditions.filter((c) => !("kind" in c && c.kind === "reach_goal"));
      if (nonGoalConditions.every((c) => checkSuccessCondition(c, run, inputs, memory, analogInputs))) phase = "maze";
    }

    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }

  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): reference solution did not win within ${maxTicks} ticks - final outcome ${JSON.stringify(outcome)}`;
  }
  return null;
}

type GameLevelRowOut = {
  level_number: number;
  game_type: "HYBRID";
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
  reference_grid_program_json: unknown;
};

function toRow(def: LevelDef): GameLevelRowOut {
  return {
    level_number: def.levelNumber,
    game_type: "HYBRID",
    title: def.title,
    description: def.description,
    hints: def.hints,
    map_layout_json: def.mapLayout,
    robot_start_json: def.robotStart,
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

  console.log(`Self-verified ${levels.length} hybrid levels (sizes ${TIERS.map((t) => t.size).join(",")}).`);

  const rows = levels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-hybrid-50.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
