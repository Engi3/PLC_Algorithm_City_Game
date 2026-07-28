// Generates the 100-level dataset. Every level is self-verified against
// the real grading engine before being written - if evaluateLevel() would
// reject its own reference solution, generation fails loudly rather than
// producing a level nobody could ever pass.

import { writeFileSync } from "fs";
import { evaluateLevel } from "../../src/lib/ladder/level-eval";
import { countBlocks } from "./builders";
import { ALL_DESCRIPTORS } from "./descriptors";
import { HINTS } from "./hints";
import type { LevelSpec } from "../../src/lib/ladder/level-spec";

type OutputLevel = {
  level_number: number;
  title: string;
  optimal_blocks_count: number;
  map_layout_json: LevelSpec;
};

function main() {
  const output: OutputLevel[] = [];
  const errors: string[] = [];

  for (const desc of ALL_DESCRIPTORS) {
    const shape = desc.build();
    const spec: LevelSpec = {
      description: desc.description,
      skill: desc.skill,
      allowedInputs: shape.allowedInputs,
      allowedOutputs: shape.allowedOutputs,
      testCases: shape.testCases,
      hints: HINTS[desc.hintKey],
      referenceProgram: shape.program,
    };

    const result = evaluateLevel(shape.program, spec);
    if (!result.passed) {
      const failed = result.results.filter((r) => !r.passed).map((r) => r.index);
      errors.push(
        `Level ${desc.levelNumber} (${desc.title}): reference solution FAILED its own test case(s) ${failed.join(", ")}`
      );
      continue;
    }
    if (shape.testCases.length === 0) {
      errors.push(`Level ${desc.levelNumber} (${desc.title}): has zero test cases`);
      continue;
    }

    output.push({
      level_number: desc.levelNumber,
      title: desc.title,
      optimal_blocks_count: countBlocks(shape.program),
      map_layout_json: spec,
    });
  }

  // Level numbers must be unique and contiguous 1-100, or the DB's unique
  // constraint / the spec's category ranges would silently break.
  const numbers = output.map((o) => o.level_number).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      errors.push(`Level numbers are not contiguous 1..N: expected ${i + 1}, got ${numbers[i]}`);
      break;
    }
  }
  const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dupes.length > 0) errors.push(`Duplicate level numbers: ${[...new Set(dupes)].join(", ")}`);

  if (errors.length > 0) {
    console.error(`Generation FAILED with ${errors.length} error(s):\n`);
    errors.forEach((e) => console.error(" - " + e));
    process.exit(1);
  }

  const outPath = "./scripts/level-gen/levels-100.json";
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`OK: generated and self-verified ${output.length} levels -> ${outPath}`);

  const bySkill = new Map<string, number>();
  for (const desc of ALL_DESCRIPTORS) {
    bySkill.set(desc.skill, (bySkill.get(desc.skill) ?? 0) + 1);
  }
  console.log("By skill:", Object.fromEntries(bySkill));
}

main();
