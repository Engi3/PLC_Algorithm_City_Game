import type { AnalogInputs, Inputs, LadderProgram } from "./types";
import type { GridProgram } from "./grid-types";

/** Skill category a level is tagged with, used for the teacher's radar chart. */
export type SkillCategory = "basic_logic" | "latching" | "timers" | "counters" | "efficiency";

export type LevelFrame = {
  /** Full input state for this frame (not a diff from the previous frame). */
  inputs: Inputs;
  /** How many Step ticks to run after applying `inputs`, for timers/counters. */
  ticks: number;
  /** Full analog input state for this frame (AI0-AI15), for levels whose test cases exercise a comparison block. Optional - existing digital-only test cases omit it and default to {}. */
  analogInputs?: AnalogInputs;
};

export type LevelTestCase = {
  frames: LevelFrame[];
  /** Checked after the last frame. Keys are coil addresses or timer/counter done-bit addresses (e.g. "Y0", "T0.DN"). */
  expect: Record<string, boolean>;
};

export type LevelSpec = {
  description: string;
  skill: SkillCategory;
  allowedInputs: string[];
  allowedOutputs: string[];
  testCases: LevelTestCase[];
  /** Progressive hints (index 0 = revealed first), shown to students on request. Optional for backward compatibility. */
  hints?: string[];
  /**
   * The teacher's model solution, kept only so re-opening the level in the
   * authoring editor restores their work. Never read by grading - students
   * never see this, and evaluateLevel only ever runs the student's program.
   * Legacy field - no longer written once the authoring editor moved onto
   * the grid model (see referenceGridProgram below), but old level rows
   * saved before that migration still carry this shape, so it stays here
   * purely for LevelAuthoringEditor to read-and-convert on load.
   */
  referenceProgram?: LadderProgram;
  /**
   * The teacher's model solution in the grid-editor's native shape - what
   * LevelAuthoringEditor now reads and writes. Preferred over
   * `referenceProgram` when both are present (never happens in practice,
   * since a save always writes exactly one of the two depending on which
   * editor made it).
   */
  referenceGridProgram?: GridProgram;
};

export function isLevelSpec(value: unknown): value is LevelSpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.description === "string" &&
    typeof v.skill === "string" &&
    Array.isArray(v.allowedInputs) &&
    Array.isArray(v.allowedOutputs) &&
    Array.isArray(v.testCases)
  );
}

export const SKILL_LABELS: Record<SkillCategory, string> = {
  basic_logic: "Basic Logic",
  latching: "Latching",
  timers: "Timers",
  counters: "Counters",
  efficiency: "Efficiency",
};

/** Tailwind classes for each skill category's badge - explicit per-category colors requested directly. */
export const SKILL_BADGE_CLASSES: Record<SkillCategory, string> = {
  basic_logic: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  latching: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
  timers: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
  counters: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  efficiency: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};
