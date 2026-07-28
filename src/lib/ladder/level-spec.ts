import type { Inputs } from "./types";

/** Skill category a level is tagged with, used for the teacher's radar chart. */
export type SkillCategory = "basic_logic" | "latching" | "timers" | "counters" | "efficiency";

export type LevelFrame = {
  /** Full input state for this frame (not a diff from the previous frame). */
  inputs: Inputs;
  /** How many Step ticks to run after applying `inputs`, for timers/counters. */
  ticks: number;
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
