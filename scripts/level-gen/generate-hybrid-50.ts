/**
 * New 50-level Hybrid track (own independent 1-50 number line, migration
 * 0014's 'hybrid' game slug) - combines Maze navigation and Factory item
 * processing in ONE program, gated behind size/item-count that grow
 * across 5 chapters. Harder than either standalone track not by being a
 * bigger maze or a bigger factory batch alone, but because the student's
 * single GridProgram must SELF-DETECT when the factory phase is actually
 * done (there's no dedicated "phase" input address - see the header
 * comment on bossSolution() in the now-deleted generate-game-levels-
 * 81-100.ts's Level 100, which this reuses the exact proven technique
 * from) and switch its own behavior accordingly, on shared addresses
 * (X0-X2, Y0-Y2 mean completely different physical things per phase).
 *
 * Deliberately scoped to the SIMPLE factory pattern only (plain item
 * count via CTD, no reject/tank/heater) - combining a hazard-maze phase
 * WITH a defect-reject or bang-bang-heater factory phase in one circuit
 * is a further compounding of untested risk (mirrors why generate-
 * factory-50.ts's finale chapter deliberately never combines sort with
 * reverse). The genuinely new pedagogical challenge here - self-
 * sequencing two physical systems on shared addresses - is difficulty
 * enough on its own, proven out across 50 levels below.
 *
 * The phase-gate technique:
 *   CTD("C0", itemCount) on NO(X0) - counts every item that crosses the
 *   sensor, DN goes true once the whole batch has passed the sensor. But
 *   the LAST item still needs ~15 more ticks to physically clear the belt
 *   (position 55 -> 100 at 3/tick) before processedCount actually reaches
 *   itemCount - so gating Y0 off C0.DN directly stops the belt mid-
 *   transit, stranding that item forever. TON("T0", 18) started by C0.DN
 *   buffers that transit time; Y0/Y1/Y2 only switch to their maze meaning
 *   once T0.DN is true.
 *   Y0 is built as ONE orRung (grid-builders.ts) with two branches - belt
 *   runs while NOT T0.DN, move-forward runs while T0.DN - since two
 *   separate COIL(Y0) grids would fight every tick (a coil write happens
 *   even when its own rung doesn't conduct, so whichever grid is LAST in
 *   program order always wins - see the deleted boss level's comment).
 *   Y1/Y2 (turn commands) don't need the same orRung treatment here,
 *   since this track's factory phase never uses Y1/Y2 for anything (no
 *   reject, no heater) - there's no second writer to collide with.
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
import { NC, NO, COIL, CTD, TON, seriesRung, program, grid, place, wireH, feedLeftRail, tieVertical } from "./grid-builders";
import { COIL_COLUMN } from "../../src/lib/ladder/grid-types";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory, type SimMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, checkSuccessCondition, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, mazeBinding } from "../../src/lib/games/maze-plc-binding";
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
/** Same technique the deleted boss level used: N parallel series-AND branches, all vertically tied at the coil column, so the grid engine ORs them into one single coil write per tick instead of two independent grids fighting. */
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
function factory(items: ConveyorItem[]): FactoryState {
  return { conveyorRunning: false, items, tankLevel: 0, pusherExtended: false, heaterOn: false, temperature: 0 };
}
function item(id: string, position: number): ConveyorItem {
  return { id, position };
}

// C0.DN latches the instant the LAST item crosses the sensor (position 55),
// but that item still needs ~15 more ticks (45 units / 3 per tick) to reach
// the belt end at position 100 and actually bump processedCount - the
// success condition the harness waits on before switching phase to maze.
// Gating Y0 off C0.DN directly stops the belt mid-transit (X0 misread as a
// maze "wall ahead" signal while still physically in the factory phase),
// permanently stranding the last item and never reaching "won". T0 (TON,
// started by C0.DN) buffers 18 ticks - room for the item to clear the belt
// - before Y0/Y1/Y2 switch over to their maze meaning.
function hybridSolution(itemCount: number): GridProgram {
  return program(
    orRung([[NC("T0.DN")], [NO("T0.DN"), NC("X0")]], COIL("Y0")),
    rung([NO("T0.DN"), NO("X0"), NC("X2")], COIL("Y2")),
    rung([NO("T0.DN"), NO("X0"), NO("X2")], COIL("Y1")),
    rung([NO("X0")], CTD("C0", itemCount)),
    rung([NO("C0.DN")], TON("T0", 18))
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
  "โปรแกรมเดียวกันควบคุมทั้งสายพานและหุ่นยนต์ AGV (ใช้ X0-X2, Y0-Y2 ซ้ำกัน) - ต้องให้วงจรรู้เองว่าตอนนี้อยู่เฟสไหน",
  "ใช้ CTD (ตัวนับถอยหลัง) ชื่อ C0 นับจำนวนชิ้นงานที่ผ่านเซนเซอร์ (NO(X0)) จนครบ - C0.DN จะติดเมื่อครบเฟสโรงงาน แต่ชิ้นสุดท้ายยังต้องเดินทางบนสายพานอีกพักหนึ่งกว่าจะสุดสาย",
  "ใช้ TON ชื่อ T0 หน่วงเวลาหลัง C0.DN ติด ให้สายพาน (Y0) ยังเดินต่ออีกพักเพื่อให้ชิ้นสุดท้ายไปถึงปลายสาย จากนั้นหุ่นยนต์เดินหน้า/เลี้ยว (Y0/Y1/Y2) จึงเริ่มทำงานเมื่อ T0.DN ติดเท่านั้น",
  "Y0 ต้องรวมเงื่อนไขทั้งสองเฟสไว้ในบล็อกเดียว (ต่อขนานสองแขนงเข้าคอยล์เดียว) ห้ามสร้างรุ้งแยกสองอันที่ต่อ Y0 คนละที่ เพราะจะแย่งกันเขียนค่าทุกรอบสแกน",
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
    const binding = usesMaze ? mazeBinding : factoryBinding;
    const state = usesMaze ? run.maze! : run.factory!;
    const { inputs, analogInputs } = binding.readInputs(state as never);
    const { memory: nextMemory } = runGridScan(def.solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = usesMaze
      ? { ...run, maze: mazeBinding.step(run.maze!, memory.coils, memory) }
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
