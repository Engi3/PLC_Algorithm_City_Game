/**
 * New independently-numbered 50-level Maze Explorer track (levels 1-50,
 * own number line per migration 0014 - no longer shares 1-100 with
 * Factory), replacing the old 49-level 9x9-only track entirely. Size
 * progresses 9x9 -> 21x21 across 7 tiers; within each tier, difficulty
 * (measured solve-tick count, via the real engine - never hand-guessed)
 * ramps from ~1x-2x the tile size up to ~3x-6x it, and the harder half of
 * each tier is a hazard maze. See maze-gen.ts for the generator itself and
 * generate-maze-9x9.ts for the original single-size version this
 * generalizes.
 *
 * Every level is self-verified against the real engine (runGridScan +
 * evaluateGameLevelTick) before being written out.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-maze-50.ts
 *   npx tsx scripts/update-maze9x9-levels.ts ./scripts/level-gen/game-levels-maze-50.json   (after deleting old maze rows - see delete-old-maze-levels.ts)
 */
import { writeFileSync } from "fs";
import { NC, NO, COIL, seriesRung, program } from "./grid-builders";
import { generateDifficultyMaze, generateHazardMaze, type GeneratedMaze } from "./maze-gen";
import type { GridNode, GridProgram, LadderGrid } from "../../src/lib/ladder/grid-types";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, mazeBinding } from "../../src/lib/games/maze-plc-binding";
import type { MazeMap, MazeRobotState } from "../../src/lib/games/maze-types";
import type { SuccessCondition } from "../../src/lib/games/game-level-types";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m50_${idCounter}`;
}
function rung(instructions: GridNode[], coilNode: GridNode): LadderGrid {
  return seriesRung(nextId(), instructions, coilNode);
}
function basicDecision(): GridProgram {
  return program(
    rung([NC("X0")], COIL("Y0")),
    rung([NO("X0"), NC("X2")], COIL("Y2")),
    rung([NO("X0"), NO("X2")], COIL("Y1"))
  );
}

type Tier = { size: number; count: number };
const TIERS: Tier[] = [
  { size: 9, count: 7 },
  { size: 11, count: 7 },
  { size: 13, count: 7 },
  { size: 15, count: 7 },
  { size: 17, count: 7 },
  { size: 19, count: 7 },
  { size: 21, count: 8 },
];

type PlannedLevel = { levelNumber: number; size: number; tierNumber: number; tierIndex: number; tierLength: number; hazard: boolean };

const plannedLevels: PlannedLevel[] = [];
{
  let levelNumber = 1;
  TIERS.forEach((tier, tierNumber) => {
    for (let tierIndex = 0; tierIndex < tier.count; tierIndex++) {
      plannedLevels.push({
        levelNumber,
        size: tier.size,
        tierNumber: tierNumber + 1,
        tierIndex,
        tierLength: tier.count,
        hazard: tierIndex >= Math.ceil(tier.count / 2),
      });
      levelNumber++;
    }
  });
}

function tickBand(size: number, tierIndex: number, tierLength: number): [number, number] {
  const t = tierLength > 1 ? tierIndex / (tierLength - 1) : 0;
  const minTicks = Math.round(size * (1 + 2 * t));
  const maxTicks = Math.round(size * (2 + 4 * t));
  return [minTicks, maxTicks];
}

type LevelDef = { levelNumber: number; title: string; description: string; hints: string[]; mapLayout: MazeMap; robotStart: MazeRobotState; timeLimitTicks: number };

const solution = basicDecision();

const levels: LevelDef[] = plannedLevels.map((p) => {
  const [minTicks, maxTicks] = tickBand(p.size, p.tierIndex, p.tierLength);
  const seed = 500000 + p.levelNumber * 7919;
  const base: GeneratedMaze = p.hazard
    ? generateHazardMaze(seed, p.size, minTicks, maxTicks, 500)
    : generateDifficultyMaze(seed, p.size, minTicks, maxTicks, 500);

  const title = `เขาวงกต ${p.size}x${p.size} ด่านที่ ${p.levelNumber}${p.hazard ? " (ระวังกับดัก)" : ""}`;
  const description = p.hazard
    ? `หุ่นยนต์ AGV ของคุณติดอยู่ในเขาวงกตขนาด ${p.size}x${p.size} ที่มีกับดักซ่อนอยู่ตามทาง เขียนวงจรควบคุมให้หุ่นยนต์ใช้เซนเซอร์ตรวจกำแพงรอบตัว หาทางออกไปให้ถึงธงเป้าหมายให้ได้ โดยห้ามพลาดเข้ากับดักเด็ดขาด`
    : `หุ่นยนต์ AGV ของคุณติดอยู่ในเขาวงกตขนาด ${p.size}x${p.size} เขียนวงจรควบคุมให้หุ่นยนต์ใช้เซนเซอร์ตรวจกำแพงรอบตัว ตัดสินใจเดินหน้าหรือเลี้ยว จนหาทางออกไปถึงธงเป้าหมายให้ได้`;
  const hints = [
    "ใช้หน้าสัมผัส NC ต่อกับ X0 แล้วต่อไปยัง Y0 เพื่อเดินหน้าตลอดเวลาที่ไม่มีกำแพง",
    "ที่ทางแยก: NO(X0) อนุกรมกับ NC(X2) -> Y2 (เลี้ยวขวาเมื่อขวาว่าง), NO(X0) อนุกรมกับ NO(X2) -> Y1 (เลี้ยวซ้ายเมื่อขวาไม่ว่าง)",
    ...(p.hazard ? ["ระวัง! มีกับดัก (HAZARD) ซ่อนอยู่ข้างเส้นทาง ถ้าเดินผิดทางจะพลาดเข้ากับดักทันที"] : []),
  ];

  return {
    levelNumber: p.levelNumber,
    title,
    description,
    hints,
    mapLayout: base.map,
    robotStart: base.start,
    timeLimitTicks: base.solveTicks + p.size * 2,
  };
});

function verifyLevel(def: LevelDef): string | null {
  const successConditions: SuccessCondition[] = [{ kind: "reach_goal" }];
  let run: GameRunState = { maze: createMazeGameState(def.mapLayout, def.robotStart) };
  let memory = createEmptyMemory();
  const spec = {
    levelNumber: def.levelNumber,
    gameType: "MAZE" as const,
    title: def.title,
    description: def.description,
    mapLayout: def.mapLayout,
    robotStart: def.robotStart,
    successConditions,
  };
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  const maxTicks = def.timeLimitTicks + 10;
  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const { inputs, analogInputs } = mazeBinding.readInputs(run.maze!);
    const { memory: nextMemory } = runGridScan(solution, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = { maze: mazeBinding.step(run.maze!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }
  if (outcome.status !== "won") {
    return `level ${def.levelNumber} (${def.title}): reference solution did not win within ${maxTicks} ticks - final outcome ${JSON.stringify(outcome)}`;
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
  reference_grid_program_json: unknown;
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
    success_conditions_json: [{ kind: "reach_goal" }],
    safety_constraints_json: [],
    reference_grid_program_json: solution,
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

  console.log(`Self-verified ${levels.length} maze levels (sizes ${TIERS.map((t) => t.size).join(",")}).`);

  const rows = levels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-maze-50.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
