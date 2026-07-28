import {
  contact,
  branch,
  rung,
  coilOutput,
  setOutput,
  resetOutput,
  timerOutput,
  counterOutput,
  program,
  deriveTestCase,
  allBooleanCombos,
  combinationalCase,
} from "./builders";
import type { LadderProgram, Inputs } from "../../src/lib/ladder/types";
import type { LevelTestCase } from "../../src/lib/ladder/level-spec";

export type ShapeResult = {
  program: LadderProgram;
  allowedInputs: string[];
  allowedOutputs: string[];
  testCases: LevelTestCase[];
};

// ============================================================
// Category 1: Basic Logic (NO, NC, COIL)
// ============================================================

/** Series AND of `inputs` (all NO) -> coil. Exhaustively tested (2^n cases). */
export function shapeAnd(inputs: string[], output: string): ShapeResult {
  const cells = inputs.map((a) => contact("NO", a));
  const prog = program(rung("r1", [branch(...cells)], coilOutput(output)));
  const testCases = allBooleanCombos(inputs.length).map((combo) =>
    combinationalCase(prog, inputs, combo, [output])
  );
  return { program: prog, allowedInputs: inputs, allowedOutputs: [output], testCases };
}

/** Parallel OR of `inputs` (all NO, one per branch) -> coil. */
export function shapeOr(inputs: string[], output: string): ShapeResult {
  const branches = inputs.map((a) => branch(contact("NO", a)));
  const prog = program(rung("r1", branches, coilOutput(output)));
  const testCases = allBooleanCombos(inputs.length).map((combo) =>
    combinationalCase(prog, inputs, combo, [output])
  );
  return { program: prog, allowedInputs: inputs, allowedOutputs: [output], testCases };
}

/** Q = NOT(input) - a single NC contact -> coil (e.g. safety door interlock). */
export function shapeNot(input: string, output: string): ShapeResult {
  const prog = program(rung("r1", [branch(contact("NC", input))], coilOutput(output)));
  const testCases = [false, true].map((v) => combinationalCase(prog, [input], [v], [output]));
  return { program: prog, allowedInputs: [input], allowedOutputs: [output], testCases };
}

/** Q = a AND NOT(b) - run unless a trip/overload input is active. */
export function shapeAndNot(a: string, bNc: string, output: string): ShapeResult {
  const prog = program(
    rung("r1", [branch(contact("NO", a), contact("NC", bNc))], coilOutput(output))
  );
  const testCases = allBooleanCombos(2).map((combo) => combinationalCase(prog, [a, bNc], combo, [output]));
  return { program: prog, allowedInputs: [a, bNc], allowedOutputs: [output], testCases };
}

/** Q = NOT(a) AND NOT(b) - series NC chain, e.g. two emergency-stop buttons in series. */
export function shapeSeriesNot(inputs: string[], output: string): ShapeResult {
  const cells = inputs.map((a) => contact("NC", a));
  const prog = program(rung("r1", [branch(...cells)], coilOutput(output)));
  const testCases = allBooleanCombos(inputs.length).map((combo) =>
    combinationalCase(prog, inputs, combo, [output])
  );
  return { program: prog, allowedInputs: inputs, allowedOutputs: [output], testCases };
}

/** Q = (a AND b) OR c - two-branch mixed AND/OR. */
export function shapeAndOrMix(a: string, b: string, c: string, output: string): ShapeResult {
  const prog = program(
    rung("r1", [branch(contact("NO", a), contact("NO", b)), branch(contact("NO", c))], coilOutput(output))
  );
  const inputs = [a, b, c];
  const testCases = allBooleanCombos(3).map((combo) => combinationalCase(prog, inputs, combo, [output]));
  return { program: prog, allowedInputs: inputs, allowedOutputs: [output], testCases };
}

// ============================================================
// Category 2: Latching (SET/RESET)
// ============================================================

/** Classic start/stop latch: SET on `start`, RESET on `stop`. */
export function shapeLatch(start: string, stop: string, output: string): ShapeResult {
  const prog = program(
    rung("r1", [branch(contact("NO", start))], setOutput(output)),
    rung("r2", [branch(contact("NO", stop))], resetOutput(output))
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [start]: true, [stop]: false }, ticks: 0 }], [output]),
    deriveTestCase(
      prog,
      [
        { inputs: { [start]: true, [stop]: false }, ticks: 0 },
        { inputs: { [start]: false, [stop]: false }, ticks: 0 },
      ],
      [output]
    ),
    deriveTestCase(
      prog,
      [
        { inputs: { [start]: true, [stop]: false }, ticks: 0 },
        { inputs: { [start]: false, [stop]: false }, ticks: 0 },
        { inputs: { [start]: false, [stop]: true }, ticks: 0 },
      ],
      [output]
    ),
  ];
  return { program: prog, allowedInputs: [start, stop], allowedOutputs: [output], testCases };
}

/** Latch with two independent stop buttons (RESET on stop1 OR stop2), e.g. two-station stop. */
export function shapeLatchMultiStop(
  start: string,
  stop1: string,
  stop2: string,
  output: string
): ShapeResult {
  const prog = program(
    rung("r1", [branch(contact("NO", start))], setOutput(output)),
    rung(
      "r2",
      [branch(contact("NO", stop1)), branch(contact("NO", stop2))],
      resetOutput(output)
    )
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [start]: true }, ticks: 0 }], [output]),
    deriveTestCase(
      prog,
      [
        { inputs: { [start]: true }, ticks: 0 },
        { inputs: { [start]: false, [stop1]: true }, ticks: 0 },
      ],
      [output]
    ),
    deriveTestCase(
      prog,
      [
        { inputs: { [start]: true }, ticks: 0 },
        { inputs: { [start]: false, [stop2]: true }, ticks: 0 },
      ],
      [output]
    ),
  ];
  return {
    program: prog,
    allowedInputs: [start, stop1, stop2],
    allowedOutputs: [output],
    testCases,
  };
}

/** Latch that only sets when (start AND enable) are both true, reset by stop. */
export function shapeLatchGated(
  start: string,
  enable: string,
  stop: string,
  output: string
): ShapeResult {
  const prog = program(
    rung("r1", [branch(contact("NO", start), contact("NO", enable))], setOutput(output)),
    rung("r2", [branch(contact("NO", stop))], resetOutput(output))
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [start]: true, [enable]: false }, ticks: 0 }], [output]),
    deriveTestCase(prog, [{ inputs: { [start]: true, [enable]: true }, ticks: 0 }], [output]),
    deriveTestCase(
      prog,
      [
        { inputs: { [start]: true, [enable]: true }, ticks: 0 },
        { inputs: { [start]: false, [enable]: false, [stop]: true }, ticks: 0 },
      ],
      [output]
    ),
  ];
  return {
    program: prog,
    allowedInputs: [start, enable, stop],
    allowedOutputs: [output],
    testCases,
  };
}

// ============================================================
// Category 3: Timers (TON, TOF, RTO)
// ============================================================

/** TON on-delay: input -> timer -> coil, energizes `preset` ticks after input goes true. */
export function shapeTonDelay(input: string, output: string, preset: number): ShapeResult {
  const timerAddr = "T0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], timerOutput(timerAddr, "TON", preset)),
    rung("r2", [branch(contact("NO", `${timerAddr}.DN`))], coilOutput(output))
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [input]: true }, ticks: preset - 1 }], [output]),
    deriveTestCase(prog, [{ inputs: { [input]: true }, ticks: preset }], [output]),
    deriveTestCase(
      prog,
      [
        { inputs: { [input]: true }, ticks: preset },
        { inputs: { [input]: false }, ticks: 0 },
      ],
      [output]
    ),
  ];
  return { program: prog, allowedInputs: [input], allowedOutputs: [output], testCases };
}

/** TOF off-delay: coil energizes immediately with input, stays on `preset` ticks after input drops. */
export function shapeTofDelay(input: string, output: string, preset: number): ShapeResult {
  const timerAddr = "T0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], timerOutput(timerAddr, "TOF", preset)),
    rung("r2", [branch(contact("NO", `${timerAddr}.DN`))], coilOutput(output))
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [input]: true }, ticks: 0 }], [output]),
    deriveTestCase(
      prog,
      [
        { inputs: { [input]: true }, ticks: 0 },
        { inputs: { [input]: false }, ticks: preset - 1 },
      ],
      [output]
    ),
    deriveTestCase(
      prog,
      [
        { inputs: { [input]: true }, ticks: 0 },
        { inputs: { [input]: false }, ticks: preset },
      ],
      [output]
    ),
  ];
  return { program: prog, allowedInputs: [input], allowedOutputs: [output], testCases };
}

/** RTO retentive timer + explicit reset input; accumulates across de-energize, only `reset` clears it. */
export function shapeRtoAccumulate(
  input: string,
  reset: string,
  output: string,
  preset: number
): ShapeResult {
  const timerAddr = "T0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], timerOutput(timerAddr, "RTO", preset)),
    rung("r2", [branch(contact("NO", reset))], resetOutput(timerAddr)),
    rung("r3", [branch(contact("NO", `${timerAddr}.DN`))], coilOutput(output))
  );
  const half = Math.max(1, Math.floor(preset / 2));
  const testCases: LevelTestCase[] = [
    // accumulate half, release, accumulate the rest -> still reaches done (retentive)
    deriveTestCase(
      prog,
      [
        { inputs: { [input]: true, [reset]: false }, ticks: half },
        { inputs: { [input]: false, [reset]: false }, ticks: 0 },
        { inputs: { [input]: true, [reset]: false }, ticks: preset - half },
      ],
      [output]
    ),
    // explicit reset clears accumulation
    deriveTestCase(
      prog,
      [
        { inputs: { [input]: true, [reset]: false }, ticks: preset },
        { inputs: { [input]: false, [reset]: true }, ticks: 0 },
      ],
      [output]
    ),
  ];
  return { program: prog, allowedInputs: [input, reset], allowedOutputs: [output], testCases };
}

/** TON gated by an AND condition - timer only runs while both `input` and `gate` are true. */
export function shapeTonGated(input: string, gate: string, output: string, preset: number): ShapeResult {
  const timerAddr = "T0";
  const prog = program(
    rung("r1", [branch(contact("NO", input), contact("NO", gate))], timerOutput(timerAddr, "TON", preset)),
    rung("r2", [branch(contact("NO", `${timerAddr}.DN`))], coilOutput(output))
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [input]: true, [gate]: false }, ticks: preset }], [output]),
    deriveTestCase(prog, [{ inputs: { [input]: true, [gate]: true }, ticks: preset }], [output]),
    deriveTestCase(prog, [{ inputs: { [input]: true, [gate]: true }, ticks: preset - 1 }], [output]),
  ];
  return { program: prog, allowedInputs: [input, gate], allowedOutputs: [output], testCases };
}

/** Two-stage sequential TON chain: stage1 -> (after preset1) stage2 -> (after preset2) output. */
export function shapeTwoStageSequence(
  input: string,
  stage1Output: string,
  output: string,
  preset1: number,
  preset2: number
): ShapeResult {
  const t0 = "T0";
  const t1 = "T1";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], timerOutput(t0, "TON", preset1)),
    rung("r2", [branch(contact("NO", `${t0}.DN`))], coilOutput(stage1Output)),
    rung("r3", [branch(contact("NO", `${t0}.DN`))], timerOutput(t1, "TON", preset2)),
    rung("r4", [branch(contact("NO", `${t1}.DN`))], coilOutput(output))
  );
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [input]: true }, ticks: preset1 - 1 }], [stage1Output, output]),
    deriveTestCase(prog, [{ inputs: { [input]: true }, ticks: preset1 }], [stage1Output, output]),
    deriveTestCase(prog, [{ inputs: { [input]: true }, ticks: preset1 + preset2 }], [stage1Output, output]),
  ];
  return {
    program: prog,
    allowedInputs: [input],
    allowedOutputs: [stage1Output, output],
    testCases,
  };
}

// ============================================================
// Category 4: Counters & Mixed Logic (CTU, CTD)
// ============================================================

/** CTU count-up: `input` pulses (rising edges) increment the counter; done at `preset`. */
export function shapeCtuCount(input: string, output: string, preset: number): ShapeResult {
  const counterAddr = "C0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], counterOutput(counterAddr, "CTU", preset)),
    rung("r2", [branch(contact("NO", `${counterAddr}.DN`))], coilOutput(output))
  );
  const pulses = (n: number): Inputs[] => {
    const frames: Inputs[] = [];
    for (let i = 0; i < n; i++) {
      frames.push({ [input]: true });
      frames.push({ [input]: false });
    }
    return frames;
  };
  const belowFrames = pulses(preset - 1).map((inputs) => ({ inputs, ticks: 0 }));
  const atPresetFrames = pulses(preset).map((inputs) => ({ inputs, ticks: 0 }));
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, belowFrames, [output]),
    deriveTestCase(prog, atPresetFrames, [output]),
  ];
  return { program: prog, allowedInputs: [input], allowedOutputs: [output], testCases };
}

/** CTU with an explicit reset input (e.g. clears the box count once full). */
export function shapeCtuWithReset(input: string, reset: string, output: string, preset: number): ShapeResult {
  const counterAddr = "C0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], counterOutput(counterAddr, "CTU", preset)),
    rung("r2", [branch(contact("NO", reset))], resetOutput(counterAddr)),
    rung("r3", [branch(contact("NO", `${counterAddr}.DN`))], coilOutput(output))
  );
  const pulseFrames = (n: number) => {
    const frames: { inputs: Inputs; ticks: number }[] = [];
    for (let i = 0; i < n; i++) {
      frames.push({ inputs: { [input]: true, [reset]: false }, ticks: 0 });
      frames.push({ inputs: { [input]: false, [reset]: false }, ticks: 0 });
    }
    return frames;
  };
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, pulseFrames(preset), [output]),
    deriveTestCase(
      prog,
      [...pulseFrames(preset), { inputs: { [input]: false, [reset]: true }, ticks: 0 }],
      [output]
    ),
  ];
  return { program: prog, allowedInputs: [input, reset], allowedOutputs: [output], testCases };
}

/** CTD count-down: pre-loaded at `preset`, each pulse decrements; done at 0. */
export function shapeCtdCount(input: string, output: string, preset: number): ShapeResult {
  const counterAddr = "C0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], counterOutput(counterAddr, "CTD", preset)),
    rung("r2", [branch(contact("NO", `${counterAddr}.DN`))], coilOutput(output))
  );
  const pulseFrames = (n: number) => {
    const frames: { inputs: Inputs; ticks: number }[] = [];
    for (let i = 0; i < n; i++) {
      frames.push({ inputs: { [input]: true }, ticks: 0 });
      frames.push({ inputs: { [input]: false }, ticks: 0 });
    }
    return frames;
  };
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, [{ inputs: { [input]: false }, ticks: 0 }], [output]),
    deriveTestCase(prog, pulseFrames(preset - 1), [output]),
    deriveTestCase(prog, pulseFrames(preset), [output]),
  ];
  return { program: prog, allowedInputs: [input], allowedOutputs: [output], testCases };
}

/** Mixed: counter gated by a run condition (only counts while `gate` is true). */
export function shapeCtuGated(input: string, gate: string, output: string, preset: number): ShapeResult {
  const counterAddr = "C0";
  const prog = program(
    rung("r1", [branch(contact("NO", input), contact("NO", gate))], counterOutput(counterAddr, "CTU", preset)),
    rung("r2", [branch(contact("NO", `${counterAddr}.DN`))], coilOutput(output))
  );
  const pulseFrames = (n: number, gateOn: boolean) => {
    const frames: { inputs: Inputs; ticks: number }[] = [];
    for (let i = 0; i < n; i++) {
      frames.push({ inputs: { [input]: true, [gate]: gateOn }, ticks: 0 });
      frames.push({ inputs: { [input]: false, [gate]: gateOn }, ticks: 0 });
    }
    return frames;
  };
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, pulseFrames(preset, false), [output]),
    deriveTestCase(prog, pulseFrames(preset, true), [output]),
  ];
  return { program: prog, allowedInputs: [input, gate], allowedOutputs: [output], testCases };
}

/** Mixed: counter -> gates a timer -> coil (e.g. pick-and-place: N picks, then a short settle delay). */
export function shapeCounterThenTimer(
  input: string,
  output: string,
  countPreset: number,
  timerPreset: number
): ShapeResult {
  const counterAddr = "C0";
  const timerAddr = "T0";
  const prog = program(
    rung("r1", [branch(contact("NO", input))], counterOutput(counterAddr, "CTU", countPreset)),
    rung("r2", [branch(contact("NO", `${counterAddr}.DN`))], timerOutput(timerAddr, "TON", timerPreset)),
    rung("r3", [branch(contact("NO", `${timerAddr}.DN`))], coilOutput(output))
  );
  const pulseFrames = (n: number) => {
    const frames: { inputs: Inputs; ticks: number }[] = [];
    for (let i = 0; i < n; i++) {
      frames.push({ inputs: { [input]: true }, ticks: 0 });
      frames.push({ inputs: { [input]: false }, ticks: 0 });
    }
    return frames;
  };
  const testCases: LevelTestCase[] = [
    deriveTestCase(prog, pulseFrames(countPreset), [output]),
    deriveTestCase(
      prog,
      [...pulseFrames(countPreset), { inputs: { [input]: false }, ticks: timerPreset }],
      [output]
    ),
  ];
  return { program: prog, allowedInputs: [input], allowedOutputs: [output], testCases };
}
