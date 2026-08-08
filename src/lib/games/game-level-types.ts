import type { SafetyConstraint, StageExpectation } from "@/lib/ladder/challenge-types";
import type { GridProgram } from "@/lib/ladder/grid-types";
import type { MazeMap, MazeRobotState } from "./maze-types";
import type { FactoryState } from "./factory-types";

export type GameType = "MAZE" | "FACTORY" | "HYBRID";

/**
 * What ends a Game Level in success - ALL listed conditions must hold (AND),
 * same semantics as a Challenge stage's `expect`. Reuses StageExpectation
 * (challenge-types.ts) directly for "some PLC address reads a specific
 * bit/numeric value" - the same condition vocabulary Challenges already use,
 * so authoring a Game Level doesn't mean learning a second language for the
 * same idea. `reach_goal`/`process_items` cover the two cases that genuinely
 * aren't a single address read: they're derived from the simulated game
 * world itself (robot position, belt throughput), not a PLC bit/register.
 */
export type SuccessCondition =
  | StageExpectation
  | { kind: "reach_goal" }
  | { kind: "process_items"; target: number }
  /** Sorting-robot levels: how many items have been routed into their genuinely correct bin (factory-plc-binding.ts's sortedCorrectCount) - a wrongly-sorted item never counts, so this can't be gamed by just diverting everything. */
  | { kind: "sort_items"; target: number }
  /** Reversible-conveyor levels: how many items have been kicked back off the spawn end while running in reverse (factory-plc-binding.ts's returnedCount). */
  | { kind: "return_items"; target: number };

type GameLevelCommon = {
  levelNumber: number;
  title: string;
  description: string;
  hints?: string[];
  successConditions: SuccessCondition[];
  /** Any one of these being true at any tick ends the level in failure immediately - same shape as ChallengeSpec's SafetyConstraint, reused directly so the live Factory process-panel/fault-modal UI built for Challenge Mode (Task 5.2) can eventually read Game Level faults the same way. */
  safetyConstraints?: SafetyConstraint[];
  /** Optional tick budget - exceeding it without meeting successConditions also fails the level. Omit for an untimed level. */
  timeLimitTicks?: number;
  ticksPerSecond?: number;
  /** A worked-example GridProgram that solves this level - not necessarily THE optimal answer, just one that self-verified during generation. Shown on demand via the "example solution" viewer (Game Mode only, for now). */
  referenceGridProgram?: GridProgram;
};

/**
 * 100-Level JSON schema for Maze/Factory/Hybrid levels (see the
 * 0011_game_levels.sql migration for the DB-facing column layout).
 * A discriminated union on `gameType`, not a bag of optional fields - MAZE
 * requires a `mapLayout`/`robotStart`, FACTORY a `factoryInitial`, HYBRID
 * both, and TypeScript enforces exactly that at every call site (no runtime
 * "was this level actually a maze?" guessing in use-game-level-play.ts). A
 * HYBRID level runs its Factory phase first, then switches to its Maze phase
 * once every non-`reach_goal` success condition is met.
 */
export type GameLevelSpec =
  | (GameLevelCommon & { gameType: "MAZE"; mapLayout: MazeMap; robotStart: MazeRobotState })
  | (GameLevelCommon & { gameType: "FACTORY"; factoryInitial: FactoryState })
  | (GameLevelCommon & { gameType: "HYBRID"; mapLayout: MazeMap; robotStart: MazeRobotState; factoryInitial: FactoryState });

export function isGameLevelSpec(value: unknown): value is GameLevelSpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.levelNumber !== "number" || typeof v.title !== "string" || typeof v.description !== "string" || !Array.isArray(v.successConditions)) {
    return false;
  }
  if (v.gameType === "MAZE") return !!v.mapLayout && !!v.robotStart;
  if (v.gameType === "FACTORY") return !!v.factoryInitial;
  if (v.gameType === "HYBRID") return !!v.mapLayout && !!v.robotStart && !!v.factoryInitial;
  return false;
}

/** Raw shape of a public.game_levels row exactly as Supabase returns it (snake_case, JSONB columns untyped) - see 0011_game_levels.sql. */
export type GameLevelRow = {
  id: string;
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
  reference_grid_program_json?: unknown;
};

/** Validates and assembles a DB row into the app-facing GameLevelSpec, same "trust JSONB only after a shape check, then use the typed value everywhere else" boundary isLevelSpec/isChallengeStagesJson already establish for their own tables. Returns null for a row missing the fields its own gameType requires, so a caller can skip/report a broken level instead of crashing on a `!`-asserted field later. */
export function gameLevelRowToSpec(row: GameLevelRow): GameLevelSpec | null {
  if (!Array.isArray(row.success_conditions_json)) return null;
  const common: GameLevelCommon = {
    levelNumber: row.level_number,
    title: row.title,
    description: row.description,
    hints: row.hints.length > 0 ? row.hints : undefined,
    successConditions: row.success_conditions_json as SuccessCondition[],
    safetyConstraints: Array.isArray(row.safety_constraints_json) ? (row.safety_constraints_json as SafetyConstraint[]) : undefined,
    timeLimitTicks: row.time_limit_ticks ?? undefined,
    ticksPerSecond: row.ticks_per_second ?? undefined,
    referenceGridProgram: (row.reference_grid_program_json as GridProgram | null) ?? undefined,
  };

  const mapLayout = row.map_layout_json as MazeMap | null;
  const robotStart = row.robot_start_json as MazeRobotState | null;
  const factoryInitial = row.factory_initial_json as FactoryState | null;

  if (row.game_type === "MAZE") {
    if (!mapLayout || !robotStart) return null;
    return { ...common, gameType: "MAZE", mapLayout, robotStart };
  }
  if (row.game_type === "FACTORY") {
    if (!factoryInitial) return null;
    return { ...common, gameType: "FACTORY", factoryInitial };
  }
  if (row.game_type === "HYBRID") {
    if (!mapLayout || !robotStart || !factoryInitial) return null;
    return { ...common, gameType: "HYBRID", mapLayout, robotStart, factoryInitial };
  }
  return null;
}

export type GameChapter = {
  chapterNumber: number;
  levelRange: [number, number];
  titleTh: string;
  titleEn: string;
};

/**
 * Legacy shared chapters from the original 100-level curriculum (scripts/
 * level-gen/generate-game-levels*.ts), where Maze/Factory/Hybrid all shared
 * one 1-100 number line. Only Hybrid still uses this (until its own
 * independent-numbering pass lands) - Maze and Factory each have their own
 * chapter set now (MAZE_CHAPTERS / FACTORY_CHAPTERS below).
 */
export const GAME_CHAPTERS: GameChapter[] = [
  { chapterNumber: 1, levelRange: [1, 20], titleTh: "พื้นฐานดิจิทัล", titleEn: "Basic Digital" },
  { chapterNumber: 2, levelRange: [21, 40], titleTh: "ตัวจับเวลา", titleEn: "Timers" },
  { chapterNumber: 3, levelRange: [41, 60], titleTh: "ตัวนับ", titleEn: "Counters" },
  { chapterNumber: 4, levelRange: [61, 80], titleTh: "อนาล็อกและคณิตศาสตร์", titleEn: "Analog & Math" },
  { chapterNumber: 5, levelRange: [81, 100], titleTh: "ประยุกต์ขั้นสูง", titleEn: "Advanced Applied" },
];

/**
 * The Maze Explorer track's own independent 1-N number line, grouped by
 * tile-size tier rather than by PLC concept, since difficulty comes purely
 * from maze size/complexity plus (Task 4b) hazard-sensor usage. Tiers 1-7
 * (levels 1-50, scripts/level-gen/generate-maze-50.ts) are the original
 * 9x9->21x21 progression. Tiers 8-10 (levels 51-68, scripts/level-gen/
 * generate-maze-massive.ts, Task 4c) are the "massive grid" finale the spec
 * asked for as 30x30/40x40/50x50 - the generator requires an ODD size (see
 * maze-gen.ts's room-doubling scheme), so these ship as the nearest odd
 * sizes, 31x31/41x41/51x51, instead.
 */
export const MAZE_CHAPTERS: GameChapter[] = [
  { chapterNumber: 1, levelRange: [1, 7], titleTh: "เขาวงกต 9x9", titleEn: "9x9 Maze" },
  { chapterNumber: 2, levelRange: [8, 14], titleTh: "เขาวงกต 11x11", titleEn: "11x11 Maze" },
  { chapterNumber: 3, levelRange: [15, 21], titleTh: "เขาวงกต 13x13", titleEn: "13x13 Maze" },
  { chapterNumber: 4, levelRange: [22, 28], titleTh: "เขาวงกต 15x15", titleEn: "15x15 Maze" },
  { chapterNumber: 5, levelRange: [29, 35], titleTh: "เขาวงกต 17x17", titleEn: "17x17 Maze" },
  { chapterNumber: 6, levelRange: [36, 42], titleTh: "เขาวงกต 19x19", titleEn: "19x19 Maze" },
  { chapterNumber: 7, levelRange: [43, 50], titleTh: "เขาวงกต 21x21", titleEn: "21x21 Maze" },
  { chapterNumber: 8, levelRange: [51, 56], titleTh: "เขาวงกตยักษ์ 31x31", titleEn: "31x31 Giant Maze" },
  { chapterNumber: 9, levelRange: [57, 62], titleTh: "เขาวงกตยักษ์ 41x41", titleEn: "41x41 Giant Maze" },
  { chapterNumber: 10, levelRange: [63, 68], titleTh: "เขาวงกตยักษ์ 51x51 (ขั้นสูงสุด)", titleEn: "51x51 Giant Maze (Finale)" },
];

/**
 * The Factory Simulator track's own independent 1-N number line, grouped by
 * scenario rather than by PLC concept. Chapters 1-6 (levels 1-50, scripts/
 * level-gen/generate-factory-50.ts) are the original track: basic conveyor,
 * tank & heater, sorting robot, reversible conveyor, traffic light, then a
 * combined finale layering several mechanics onto one program at once.
 * Chapter 7 (levels 51-58, scripts/level-gen/generate-factory-count-
 * dispatch.ts, Task 4d) fills the one gap the original 50 left: Counters
 * (CTU/CTD) never appeared combined with Timers+Analog anywhere in that
 * track (only Timer+Analog, in chapter 3's sorting robot) - this chapter
 * requires all three gating one output at once.
 */
export const FACTORY_CHAPTERS: GameChapter[] = [
  { chapterNumber: 1, levelRange: [1, 8], titleTh: "สายพานพื้นฐาน", titleEn: "Basic Conveyor" },
  { chapterNumber: 2, levelRange: [9, 16], titleTh: "ถังน้ำและฮีตเตอร์", titleEn: "Tank & Heater" },
  { chapterNumber: 3, levelRange: [17, 24], titleTh: "หุ่นยนต์คัดแยก", titleEn: "Sorting Robot" },
  { chapterNumber: 4, levelRange: [25, 32], titleTh: "สายพานย้อนกลับ", titleEn: "Reversible Conveyor" },
  { chapterNumber: 5, levelRange: [33, 40], titleTh: "ไฟจราจร", titleEn: "Traffic Light" },
  { chapterNumber: 6, levelRange: [41, 50], titleTh: "บทสรุปขั้นสูง", titleEn: "Advanced Finale" },
  { chapterNumber: 7, levelRange: [51, 58], titleTh: "นับและจ่ายสินค้า (ตัวนับ+ตัวจับเวลา+อนาล็อก)", titleEn: "Count & Dispatch (Counter+Timer+Analog)" },
];

/** The new 50-level Hybrid track (scripts/level-gen/generate-hybrid-50.ts) - its own independent 1-50 number line, grouped by maze-size tier (5x5 -> 13x13) same as Maze, since difficulty scales with both maze size and item count together within each tier. */
export const HYBRID_CHAPTERS: GameChapter[] = [
  { chapterNumber: 1, levelRange: [1, 10], titleTh: "สายการผลิต + เขาวงกต 5x5", titleEn: "Line + 5x5 Maze" },
  { chapterNumber: 2, levelRange: [11, 20], titleTh: "สายการผลิต + เขาวงกต 7x7", titleEn: "Line + 7x7 Maze" },
  { chapterNumber: 3, levelRange: [21, 30], titleTh: "สายการผลิต + เขาวงกต 9x9", titleEn: "Line + 9x9 Maze" },
  { chapterNumber: 4, levelRange: [31, 40], titleTh: "สายการผลิต + เขาวงกต 11x11", titleEn: "Line + 11x11 Maze" },
  { chapterNumber: 5, levelRange: [41, 50], titleTh: "สายการผลิต + เขาวงกต 13x13 (ขั้นสูงสุด)", titleEn: "Line + 13x13 Maze (Finale)" },
];

/** Which chapter set a game's own level list/detail pages should use - Maze, Factory, and Hybrid each have their own independent-numbering chapter sets now. */
export function chaptersForGameSlug(gameSlug: string): GameChapter[] {
  if (gameSlug === "maze") return MAZE_CHAPTERS;
  if (gameSlug === "factory") return FACTORY_CHAPTERS;
  if (gameSlug === "hybrid") return HYBRID_CHAPTERS;
  return GAME_CHAPTERS;
}

export function chapterForGameLevel(gameSlug: string, levelNumber: number): GameChapter | undefined {
  return chaptersForGameSlug(gameSlug).find((c) => levelNumber >= c.levelRange[0] && levelNumber <= c.levelRange[1]);
}
