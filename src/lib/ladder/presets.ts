import { COLS_PER_BRANCH, type AnalogInputs, type Branch, type DeclaredVariable, type LadderProgram, type Rung } from "./types";

export type SandboxPreset = {
  name: string;
  description: string;
  program: LadderProgram;
  /** Variables the preset expects declared in the pool so its addresses appear in the palette and AnalogInputPanel. */
  variables: DeclaredVariable[];
  analogInputs: AnalogInputs;
};

function emptyCells(...filled: (Branch["cells"][number])[]): Branch["cells"] {
  const cells: Branch["cells"] = Array.from({ length: COLS_PER_BRANCH }, () => null);
  filled.forEach((cell, i) => {
    cells[i] = cell;
  });
  return cells;
}

/**
 * Phase 11 deliverable: an example sandbox preset demonstrating a
 * temperature sensor threshold trigger, using a comparison block against an
 * analog input - AI0 (temperature, 0-32767) drives a cooling-fan coil (Y0)
 * once it crosses a "too hot" threshold.
 */
export function buildTemperatureThresholdPreset(): SandboxPreset {
  const threshold = 20000; // ~61% of the 0-32767 range

  const rung: Rung = {
    id: crypto.randomUUID(),
    branches: [
      {
        cells: emptyCells({
          kind: "COMPARE",
          operator: ">=",
          sourceA: "AI0",
          sourceB: { kind: "constant", value: threshold },
        }),
      },
    ],
    output: { kind: "COIL", address: "Y0" },
  };

  return {
    name: "Temperature Threshold",
    description: `เซนเซอร์วัดอุณหภูมิ (AI0) จะสั่งเปิดพัดลมระบายความร้อน (Y0) โดยอัตโนมัติเมื่อค่าที่อ่านได้สูงกว่าหรือเท่ากับเกณฑ์ที่ตั้งไว้ (${threshold} จาก 0-32767) ลองเลื่อนสไลเดอร์ AI0 เพื่อดูพัดลมทำงาน`,
    program: { rungs: [rung] },
    variables: [
      { address: "AI0", kind: "analog_input" },
      { address: "Y0", kind: "output" },
    ],
    analogInputs: { AI0: 0 },
  };
}
