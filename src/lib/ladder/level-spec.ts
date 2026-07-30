import type { AnalogInputs, Inputs, LadderProgram } from "./types";

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
  /** Checked after the last frame. Keys are coil addresses or timer/counter done-bit addresses (e.g. "Q0", "T0.DN"). */
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
   */
  referenceProgram?: LadderProgram;
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

/**
 * Tailwind classes for each skill category's badge, chosen to stay visually
 * distinct from colors that already carry meaning elsewhere in the app
 * (green = pass/success, red = error/unassigned, amber = coins/certificates,
 * purple = AI features).
 */
export const SKILL_BADGE_CLASSES: Record<SkillCategory, string> = {
  basic_logic: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  latching: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  timers: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  counters: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  efficiency: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
};
