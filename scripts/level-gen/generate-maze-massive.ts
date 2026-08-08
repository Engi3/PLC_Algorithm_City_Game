/**
 * Task 4c: "massive grid" finale tiers for the Maze Explorer track - levels
 * 51-68, APPENDED after the existing 1-50 (generate-maze-50.ts, untouched)
 * rather than replacing anything, so existing levels/play_logs are
 * unaffected. 3 tiers of 6 levels each, sizes 31x31/41x41/51x51 - the spec
 * asked for 30x30/40x40/50x50, but maze-gen.ts's room-doubling scheme
 * requires an ODD size, so these ship as the nearest odd sizes instead (see
 * MAZE_CHAPTERS's comment in game-level-types.ts).
 *
 * Reuses maze-gen.ts's exported `decisionProgram` (the Task 4b hazard-aware
 * "Pattern D+H" circuit) directly rather than hand-duplicating it a third
 * time - generate-maze-50.ts's own local `basicDecision()` predates this
 * export and is left as-is (already shipped/self-verified).
 *
 * Every level is self-verified against the real engine before being
 * written out, same as generate-maze-50.ts.
 *
 * Usage:
 *   npx tsx scripts/level-gen/generate-maze-massive.ts
 */
import { writeFileSync } from "fs";
import { generateDifficultyMaze, generateHazardMaze, decisionProgram, type GeneratedMaze } from "./maze-gen";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory } from "../../src/lib/ladder/types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import { createMazeGameState, mazeBinding } from "../../src/lib/games/maze-plc-binding";
import type { MazeMap, MazeRobotState } from "../../src/lib/games/maze-types";
import type { SuccessCondition } from "../../src/lib/games/game-level-types";

const FIRST_LEVEL_NUMBER = 51;

type Tier = { size: number; count: number };
const TIERS: Tier[] = [
  { size: 31, count: 6 },
  { size: 41, count: 6 },
  { size: 51, count: 6 },
];

type PlannedLevel = { levelNumber: number; size: number; tierNumber: number; tierIndex: number; tierLength: number; hazard: boolean };

const plannedLevels: PlannedLevel[] = [];
{
  let levelNumber = FIRST_LEVEL_NUMBER;
  TIERS.forEach((tier, tierNumber) => {
    for (let tierIndex = 0; tierIndex < tier.count; tierIndex++) {
      plannedLevels.push({
        levelNumber,
        size: tier.size,
        tierNumber: tierNumber + 8, // continues after the existing 7 tiers (1-50)
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

const levels: LevelDef[] = plannedLevels.map((p) => {
  const [minTicks, maxTicks] = tickBand(p.size, p.tierIndex, p.tierLength);
  const seed = 900000 + p.levelNumber * 7919;
  const base: GeneratedMaze = p.hazard
    ? generateHazardMaze(seed, p.size, minTicks, maxTicks, 500)
    : generateDifficultyMaze(seed, p.size, minTicks, maxTicks, 500);

  const title = `เขาวงกตยักษ์ ${p.size}x${p.size} ด่านที่ ${p.levelNumber}${p.hazard ? " (ระวังกับดัก)" : ""}`;
  const description = p.hazard
    ? `เขาวงกตขนาดยักษ์ ${p.size}x${p.size} มีกับดักซ่อนอยู่ตามทางเลี้ยว เขียนวงจรควบคุมหุ่นยนต์ AGV ให้ใช้เซนเซอร์กำแพง (X0-X2) ร่วมกับเซนเซอร์กับดัก (X3) หาทางออกไปให้ถึงธงเป้าหมายให้ได้ โดยห้ามพลาดเข้ากับดักเด็ดขาด`
    : `เขาวงกตขนาดยักษ์ ${p.size}x${p.size} เขียนวงจรควบคุมหุ่นยนต์ AGV ให้ใช้เซนเซอร์ตรวจกำแพงรอบตัว ตัดสินใจเดินหน้าหรือเลี้ยว จนหาทางออกไปถึงธงเป้าหมายให้ได้`;
  const hints = p.hazard
    ? [
        "สำคัญ: ด่านนี้มีกับดัก (HAZARD) วางอยู่บนเส้นทางจริงตรงจุดที่ต้องเลี้ยว - เซนเซอร์ X0 ตรวจไม่พบกับดัก ต้องใช้ X3 เพิ่มด้วย ไม่งั้นหุ่นยนต์จะเดินหน้าพลาดเข้ากับดักทันที",
        "แนะนำ: สร้างรีเลย์ภายใน M0 = \"ข้างหน้าถูกกั้น\" โดยต่อ NO(X0) ขนานกับ NO(X3) แล้วให้ M0 เป็นตัวเดียวที่ตัดสินใจเดินหน้า/เลี้ยว แทนที่จะเช็ค X0 ตรงๆ",
        "เดินหน้า: NC(M0) -> Y0 | เลี้ยวขวา: NO(M0) อนุกรมกับ NC(X2) -> Y2 | เลี้ยวซ้าย: NO(M0) อนุกรมกับ NO(X2) -> Y1",
        "แผนที่ใหญ่มาก - ใช้ AI0 (ระยะทางถึงเป้าหมาย) ช่วยตรวจสอบว่าวงจรของคุณกำลังเข้าใกล้เป้าหมายจริงหรือไม่ระหว่างทดสอบ",
      ]
    : [
        "ใช้หน้าสัมผัส NC ต่อกับ X0 แล้วต่อไปยัง Y0 เพื่อเดินหน้าตลอดเวลาที่ไม่มีกำแพง",
        "ที่ทางแยก: NO(X0) อนุกรมกับ NC(X2) -> Y2 (เลี้ยวขวาเมื่อขวาว่าง), NO(X0) อนุกรมกับ NO(X2) -> Y1 (เลี้ยวซ้ายเมื่อขวาไม่ว่าง)",
        "แผนที่ใหญ่มาก - วงจรเดียวกันกับเขาวงกตทั่วไปยังใช้ได้ แค่ใช้เวลานานขึ้นเพราะระยะทางไกลกว่า",
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
    const { memory: nextMemory } = runGridScan(decisionProgram, inputs, memory, { tick: true }, analogInputs);
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
    reference_grid_program_json: decisionProgram,
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

  console.log(`Self-verified ${levels.length} massive maze levels (sizes ${TIERS.map((t) => t.size).join(",")}), levels ${FIRST_LEVEL_NUMBER}-${FIRST_LEVEL_NUMBER + levels.length - 1}.`);

  const rows = levels.map(toRow);
  const outPath = "./scripts/level-gen/game-levels-maze-massive.json";
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows to ${outPath}.`);
}

main();
