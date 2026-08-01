import type { AnalogInputs, ComparisonOperator, Inputs } from "./types";
import type { GridProgram } from "./grid-types";

/**
 * Challenge Mode (industrial simulation curriculum) - a harder, separate
 * track from the existing 100 Levels. A regular Level's LevelTestCase checks
 * a single fixed `expect` at the end of a frame sequence, which can't
 * express "stage 2 must hold only after stage 1 has already been satisfied"
 * or "fail immediately the instant an unsafe combination occurs, regardless
 * of where in the sequence it happens" - both of which real industrial
 * commissioning tests require. Challenges get their own parallel type/eval
 * stack (challenge-types.ts/challenge-eval.ts) rather than overloading
 * LevelSpec/evaluateGridLevel, so existing Levels grading is untouched.
 */

/** One condition on a single address - the two kinds an industrial test needs: a plain bit check (coil/input/M/.DN/.EN), or a numeric comparison (analog input, or a timer/counter's .ACC/.PRE) reusing the same ComparisonOperator vocabulary the CMP instruction block already uses. */
export type BitExpectation = { kind: "bit"; address: string; expected: boolean };
export type NumericExpectation = { kind: "numeric"; address: string; operator: ComparisonOperator; value: number };
export type StageExpectation = BitExpectation | NumericExpectation;

/**
 * One scripted moment in a challenge test case - same shape as LevelFrame
 * (full-state snapshot, not a diff), except `inputs` is required to be the
 * complete digital state and `analogInputs` explicitly defaults to `{}` when
 * omitted (nothing carries over between frames - a frame that wants AI0 to
 * stay at its previous value must repeat it).
 */
export type ChallengeFrame = {
  inputs: Inputs;
  analogInputs?: AnalogInputs;
  /** How many Step ticks to run after applying this frame's state, for timers/counters to accumulate. */
  ticks: number;
};

/**
 * A named checkpoint. `frames` are this stage's own scripted moments,
 * played back immediately after every prior stage's frames in the same test
 * case (so stage 2 always starts from wherever stage 1 left the simulated
 * process). `expect` is checked once, after the stage's last frame finishes
 * - every condition must hold (AND) for the stage to pass. A later stage
 * only ever runs if every earlier stage in the same test case passed.
 */
export type ChallengeStage = {
  id: string;
  /** Thai description of what this checkpoint represents, shown to the student on failure (e.g. "ขั้นที่ 1: เติมน้ำจนถึง AI0 >= 8000"). */
  name: string;
  frames: ChallengeFrame[];
  expect: StageExpectation[];
};

/**
 * A condition that must NEVER hold at any tick across the whole test case,
 * regardless of which stage is currently active - checked after every
 * single tick (and after every frame's initial settle), not just at stage
 * boundaries, so a momentary unsafe combination can't slip through between
 * checkpoints. `violatingWhen` uses AND semantics like a stage's `expect`:
 * every listed condition must hold simultaneously for this to count as a
 * violation (e.g. heater-on AND tank-empty both true at once).
 */
export type SafetyConstraint = {
  id: string;
  /** Thai explanation shown to the student on fault (e.g. "ห้ามเปิดฮีตเตอร์ขณะถังว่าง"). */
  description: string;
  violatingWhen: StageExpectation[];
};

export type ChallengeTestCase = {
  stages: ChallengeStage[];
  /** Optional - a test case with no safety-critical elements can omit this entirely. */
  safetyConstraints?: SafetyConstraint[];
};

/** Free-text competency tags for the teacher-facing curriculum browser (Task 3) - not consumed by the evaluator itself. */
export type RequiredCompetency = "NO_NC" | "TIMER" | "COUNTER" | "ANALOG" | "INTERLOCK" | "MATH";

/** Task 5.1: display labels/badge colors for competency tags on the Challenge Browser - same palette convention as level-spec.ts's SKILL_LABELS/SKILL_BADGE_CLASSES, picking colors distinct from that 5-skill set so the two badge systems don't visually blur together. */
export const COMPETENCY_TAG_LABELS: Record<RequiredCompetency, string> = {
  NO_NC: "NO/NC",
  TIMER: "Timer",
  COUNTER: "Counter",
  ANALOG: "Analog",
  INTERLOCK: "Interlock",
  MATH: "CMP/Math",
};

export const COMPETENCY_TAG_BADGE_CLASSES: Record<RequiredCompetency, string> = {
  NO_NC: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  TIMER: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  COUNTER: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  ANALOG: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  INTERLOCK: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  MATH: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
};

/**
 * Task 3: the 50-challenge curriculum's chapter architecture - see
 * CHALLENGE_CURRICULUM.md for the full design rationale and the
 * per-chapter difficulty-scaling matrix (stage/safety-constraint counts,
 * maxOptimalBlocks range) that Task 4+'s seed data is authored against.
 * Kept here as a typed constant (not just prose in the doc) so a future
 * curriculum browser or a seed-data linter can check a challenge's
 * chapter membership and competency emphasis programmatically.
 */
export type ChallengeChapter = {
  chapterNumber: number;
  idRange: readonly [number, number]; // inclusive
  titleTh: string;
  titleEn: string;
  competencyEmphasis: RequiredCompetency[];
};

export const CHALLENGE_CHAPTERS: ChallengeChapter[] = [
  {
    chapterNumber: 1,
    idRange: [1, 10],
    titleTh: "ความปลอดภัยขั้นสูงและระบบล็อคระหว่างกัน",
    titleEn: "Advanced Safety & Interlocks",
    competencyEmphasis: ["NO_NC", "INTERLOCK"],
  },
  {
    chapterNumber: 2,
    idRange: [11, 20],
    titleTh: "ระบบนิวเมติกส์แบบลำดับขั้นและการจับเวลา",
    titleEn: "Sequential Pneumatics & Timers",
    competencyEmphasis: ["TIMER", "INTERLOCK"],
  },
  {
    chapterNumber: 3,
    idRange: [21, 30],
    titleTh: "ระบบแบตช์และการนับจำนวน",
    titleEn: "Batching & Counting Systems",
    competencyEmphasis: ["COUNTER", "MATH"],
  },
  {
    chapterNumber: 4,
    idRange: [31, 40],
    titleTh: "การควบคุมกระบวนการแบบอนาล็อก",
    titleEn: "Analog Process Control",
    competencyEmphasis: ["ANALOG", "MATH"],
  },
  {
    chapterNumber: 5,
    idRange: [41, 50],
    titleTh: "การบูรณาการระบบโรงงานแบบเต็มรูปแบบ",
    titleEn: "Full Plant Integration",
    competencyEmphasis: ["ANALOG", "TIMER", "COUNTER", "INTERLOCK"],
  },
];

/** Which chapter a challenge ID belongs to, or undefined if out of the 1-50 range. */
export function chapterForChallengeId(challengeId: number): ChallengeChapter | undefined {
  return CHALLENGE_CHAPTERS.find(
    (c) => challengeId >= c.idRange[0] && challengeId <= c.idRange[1]
  );
}

export type ChallengeSpec = {
  challengeId: number; // 1-50
  title: string;
  description: string;
  requiredCompetencies: RequiredCompetency[];
  hints?: string[];
  maxOptimalBlocks: number;
  testCases: ChallengeTestCase[];
  referenceGridProgram?: GridProgram;
};

export function isChallengeSpec(value: unknown): value is ChallengeSpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.challengeId === "number" &&
    typeof v.title === "string" &&
    typeof v.description === "string" &&
    Array.isArray(v.requiredCompetencies) &&
    typeof v.maxOptimalBlocks === "number" &&
    Array.isArray(v.testCases)
  );
}

/**
 * Task 2: what public.challenge_levels.stages_json holds - just the
 * sequential/safety logic, kept separate from the title/description/etc.
 * that live as real columns (see 0008_challenge_levels.sql) so the
 * curriculum browser can list/filter challenges without parsing JSON.
 */
export type ChallengeStagesJson = { testCases: ChallengeTestCase[] };

export function isChallengeStagesJson(value: unknown): value is ChallengeStagesJson {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as Record<string, unknown>).testCases);
}

/** Raw shape of a public.challenge_levels row exactly as Supabase returns it (snake_case, JSONB columns untyped) - see 0008_challenge_levels.sql. */
export type ChallengeLevelRow = {
  id: string;
  challenge_id: number;
  title: string;
  description: string;
  required_competencies: string[];
  hints: string[];
  stages_json: unknown;
  max_optimal_blocks: number;
  reference_grid_program_json: unknown;
};

/**
 * Assembles a DB row into the app-facing ChallengeSpec, validating
 * stages_json's shape at this one boundary (same "trust JSONB only after a
 * shape check, then use the typed value everywhere else" pattern
 * isLevelSpec already established for levels.map_layout_json). Returns null
 * for a row whose stages_json is malformed, so a caller can skip/report a
 * broken challenge instead of crashing on it.
 */
export type ProcessAddressGroups = {
  digitalInputs: string[];
  analogInputs: string[];
  actuators: string[];
  timers: string[];
  counters: string[];
};

/**
 * Task 5.2: derives the Process Visualization Panel's address inventory
 * straight from real data instead of new per-challenge authoring - which
 * sensor/button addresses the script drives (every frame lists the complete
 * digital state, so the union of its keys across all frames IS exactly the
 * process's sensor/button inventory) plus which actuator/timer/counter
 * addresses the student has actually wired into their own live GridProgram.
 */
export function collectProcessAddresses(testCase: ChallengeTestCase, program: GridProgram): ProcessAddressGroups {
  const digitalInputs = new Set<string>();
  const analogInputs = new Set<string>();

  for (const stage of testCase.stages) {
    for (const frame of stage.frames) {
      for (const addr of Object.keys(frame.inputs)) digitalInputs.add(addr);
      for (const addr of Object.keys(frame.analogInputs ?? {})) analogInputs.add(addr);
    }
    for (const exp of stage.expect) {
      if (exp.kind === "numeric" && exp.address.startsWith("AI")) analogInputs.add(exp.address);
    }
  }
  for (const constraint of testCase.safetyConstraints ?? []) {
    for (const exp of constraint.violatingWhen) {
      if (exp.kind === "numeric" && exp.address.startsWith("AI")) analogInputs.add(exp.address);
    }
  }

  const actuators = new Set<string>();
  const timers = new Set<string>();
  const counters = new Set<string>();
  for (const grid of program.grids) {
    for (const row of grid.cells) {
      for (const cell of row) {
        const node = cell.node;
        if (!node) continue;
        if (node.kind === "COIL" || node.kind === "SET" || node.kind === "RESET") {
          if (node.address) actuators.add(node.address);
        } else if (node.kind === "TIMER") {
          if (node.address) timers.add(node.address);
        } else if (node.kind === "COUNTER") {
          if (node.address) counters.add(node.address);
        }
      }
    }
  }

  return {
    digitalInputs: [...digitalInputs].sort(),
    analogInputs: [...analogInputs].sort(),
    actuators: [...actuators].sort(),
    timers: [...timers].sort(),
    counters: [...counters].sort(),
  };
}

export function challengeRowToSpec(row: ChallengeLevelRow): ChallengeSpec | null {
  if (!isChallengeStagesJson(row.stages_json)) return null;
  return {
    challengeId: row.challenge_id,
    title: row.title,
    description: row.description,
    requiredCompetencies: row.required_competencies as RequiredCompetency[],
    hints: row.hints.length > 0 ? row.hints : undefined,
    maxOptimalBlocks: row.max_optimal_blocks,
    testCases: row.stages_json.testCases,
    referenceGridProgram: (row.reference_grid_program_json as GridProgram | null) ?? undefined,
  };
}
