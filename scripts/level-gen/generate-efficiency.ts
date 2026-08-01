// Generates 30 new "Efficiency" skill levels (level_number 101-130) -
// self-verified against the real grading engine (evaluateGridLevel) before
// being written, same safety net as generate.ts used for the original 100.
// Levels 101-130 don't exist yet (efficiency has 0 levels in the current
// dataset) - this is purely additive, never touches 1-100.
import { writeFileSync } from "fs";
import { evaluateGridLevel, countGridBlocks } from "../../src/lib/ladder/level-eval";
import type { LevelSpec, LevelTestCase } from "../../src/lib/ladder/level-spec";
import type { Inputs, AnalogInputs } from "../../src/lib/ladder/types";
import type { GridProgram } from "../../src/lib/ladder/grid-types";
import { NO, NC, COIL, SET, RESET, TON, CTU, CMPCONST, grid, place, wireH, feedLeftRail, tieVertical, program, nextId } from "./grid-builders";
import { COIL_COLUMN } from "../../src/lib/ladder/grid-types";

function f(inputs: Inputs, ticks = 0, analogInputs?: AnalogInputs) {
  return analogInputs ? { inputs, ticks, analogInputs } : { inputs, ticks };
}

type Descriptor = {
  levelNumber: number;
  title: string;
  description: string;
  hints: string[];
  allowedInputs: string[];
  allowedOutputs: string[];
  testCases: LevelTestCase[];
  buildProgram: () => GridProgram;
};

const DESCRIPTORS: Descriptor[] = [];

// ---------------------------------------------------------------------------
// 101 - Conveyor E-Stop latch (SET/RESET + internal relay + multi-rung)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 101,
  title: "สายพานลำเลียงพร้อมล็อคฉุกเฉินและรีเซ็ตด้วยมือ",
  description:
    "X0=Start (กดค้าง), X1=Stop (กดค้าง), X2=สวิตช์ฉุกเฉิน (จริง=ถูกกด), X3=ปุ่มรีเซ็ตข้อผิดพลาด (กดค้าง). เมื่อกด E-Stop ต้องล็อคมอเตอร์ Y0 ไว้ถาวรแม้ปล่อย E-Stop แล้ว จนกว่าจะกด Reset. ใช้ M0 เป็นตัวจดจำสถานะข้อผิดพลาด",
  hints: [
    "สร้าง M0 = SET เมื่อ X2 จริง, RESET เมื่อ X3 จริง - นี่คือตัวจดจำข้อผิดพลาด",
    "Y0 เปิดได้ก็ต่อเมื่อ X0 จริง และ M0 เป็นเท็จ (ยังไม่มีข้อผิดพลาด)",
    "Y0 ปิดเมื่อ X1 จริง หรือ M0 เป็นจริง (ข้อผิดพลาดเกิดขึ้น)",
  ],
  allowedInputs: ["X0", "X1", "X2", "X3"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false, X3: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false, X2: false, X3: false })], expect: { Y0: true } },
    {
      frames: [f({ X0: true, X1: false, X2: false, X3: false }), f({ X0: false, X1: false, X2: false, X3: false })],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false, X3: false }),
        f({ X0: false, X1: false, X2: false, X3: false }),
        f({ X0: false, X1: true, X2: false, X3: false }),
      ],
      expect: { Y0: false },
    },
    {
      frames: [f({ X0: false, X1: false, X2: true, X3: false }), f({ X0: true, X1: false, X2: false, X3: false })],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: false, X1: false, X2: true, X3: false }),
        f({ X0: false, X1: false, X2: false, X3: false }),
        f({ X0: false, X1: false, X2: false, X3: true }),
        f({ X0: true, X1: false, X2: false, X3: false }),
      ],
      expect: { Y0: true },
    },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 1);
    place(gSet, 0, 0, NO("X2"));
    place(gSet, 0, COIL_COLUMN, SET("M0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X3"));
    place(gReset, 0, COIL_COLUMN, RESET("M0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    const gQSet = grid(nextId(), 1);
    place(gQSet, 0, 0, NO("X0"));
    place(gQSet, 0, 1, NC("M0"));
    place(gQSet, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gQSet, 0);
    wireH(gQSet, 0, 0, COIL_COLUMN);

    const gQReset = grid(nextId(), 2);
    place(gQReset, 0, 0, NO("X1"));
    place(gQReset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gQReset, 0);
    wireH(gQReset, 0, 0, COIL_COLUMN);
    place(gQReset, 1, 0, NO("M0"));
    feedLeftRail(gQReset, 1);
    wireH(gQReset, 1, 0, COIL_COLUMN);
    tieVertical(gQReset, 0, COIL_COLUMN);

    return program(gSet, gReset, gQSet, gQReset);
  },
});

// ---------------------------------------------------------------------------
// 102 - Two-stage motor start with timer delay
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 102,
  title: "มอเตอร์สองสเตจพร้อมหน่วงเวลาก่อนเริ่มสเตจ 2",
  description:
    "X0=Start (กดค้าง), X1=Stop (กดค้าง). กด Start แล้ว Y0 (สเตจ 1) ต้องค้างทำงานทันทีจนกว่าจะกด Stop. หลังจาก Y0 ทำงานครบ 3 รอบสแกน (ticks) ให้ Y1 (สเตจ 2) เริ่มทำงานด้วย",
  hints: ["ใช้ Self-Hold กับ X0/X1 เพื่อให้ Y0 ค้างสถานะ", "ใช้ TON (T0) หน่วงเวลา 3 นับจาก Y0", "Y1 = T0.DN"],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true, X1: false })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true, X1: false }, 1)], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true, X1: false }, 3)], expect: { Y0: true, Y1: true } },
    {
      frames: [f({ X0: true, X1: false }, 3), f({ X0: false, X1: true })],
      expect: { Y0: false, Y1: false },
    },
  ],
  buildProgram: () => {
    const gQ0 = grid(nextId(), 2);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, NC("X1"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);
    place(gQ0, 1, 0, NO("Y0"));
    feedLeftRail(gQ0, 1);
    wireH(gQ0, 1, 0, 1);
    tieVertical(gQ0, 0, 1);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("Y0"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 3));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("T0.DN"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gQ0, gT0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 103 - Batch piece counter with self-gated CTU and manual reset
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 103,
  title: "ตัวนับชิ้นงานพร้อมรีเซ็ตด้วยมือ",
  description:
    "X0=เซนเซอร์ตรวจจับชิ้นงาน (พัลส์), X1=ปุ่มรีเซ็ตตัวนับ. เมื่อครบ 3 ชิ้น ให้ Y0 (สัญญาณครบชุด) ติดค้างไว้จนกว่าจะกด Reset",
  hints: [
    "ใช้ CTU (C0) นับพัลส์จาก X0 ตั้งค่า Preset = 3",
    "ใส่หน้าสัมผัส NC ของ C0.DN ในอนุกรมก่อนตัวนับเอง เพื่อไม่ให้นับเกิน",
    "Y0 = C0.DN, และ RESET C0 ด้วย X1",
  ],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false } },
    {
      frames: [f({ X0: true, X1: false }), f({ X0: false, X1: false })],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
      ],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: false, X1: true }),
      ],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gCount = grid(nextId(), 1);
    place(gCount, 0, 0, NO("X0"));
    place(gCount, 0, 1, NC("C0.DN"));
    place(gCount, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gCount, 0);
    wireH(gCount, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X1"));
    place(gReset, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("C0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gCount, gReset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 104 - High-temperature alarm latch (AI + CMP)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 104,
  title: "สัญญาณเตือนอุณหภูมิสูงเกินค้างสถานะ",
  description:
    "AI0=อุณหภูมิ, X0=ปุ่มรับทราบ/รีเซ็ต. เมื่ออุณหภูมิเกิน 8000 ให้ Y0 (ไฟเตือน) ติดค้างไว้แม้อุณหภูมิจะลดลงแล้ว จนกว่าจะกด X0",
  hints: ["ใช้บล็อกเปรียบเทียบ CMP (AI0 > 8000) ต่อกับ SET (Y0)", "ใช้ X0 เป็นเงื่อนไข RESET (Y0)"],
  allowedInputs: ["X0", "AI0"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false }, 0, { AI0: 0 })], expect: { Y0: false } },
    { frames: [f({ X0: false }, 0, { AI0: 8000 })], expect: { Y0: false } },
    { frames: [f({ X0: false }, 0, { AI0: 9000 })], expect: { Y0: true } },
    {
      frames: [f({ X0: false }, 0, { AI0: 9000 }), f({ X0: false }, 0, { AI0: 0 })],
      expect: { Y0: true },
    },
    {
      frames: [f({ X0: false }, 0, { AI0: 9000 }), f({ X0: false }, 0, { AI0: 0 }), f({ X0: true }, 0, { AI0: 0 })],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 1);
    place(gSet, 0, 0, CMPCONST(">", "AI0", 8000));
    place(gSet, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X0"));
    place(gReset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    return program(gSet, gReset);
  },
});

// ---------------------------------------------------------------------------
// 105 - Tank fill valve hysteresis (dual AI threshold)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 105,
  title: "วาล์วเติมถังพร้อมระดับสองจุด (Hysteresis)",
  description:
    "AI0=ระดับน้ำในถัง. Y0=วาล์วเติมน้ำ ต้องเปิดเมื่อระดับต่ำกว่า 2000 และค้างเปิดไว้จนกว่าระดับจะถึง 8000 จึงปิด (ป้องกันวาล์วเปิดปิดถี่เกินไป)",
  hints: ["CMP (AI0 < 2000) -> SET (Y0)", "CMP (AI0 >= 8000) -> RESET (Y0)"],
  allowedInputs: ["AI0"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({}, 0, { AI0: 5000 })], expect: { Y0: false } },
    { frames: [f({}, 0, { AI0: 1000 })], expect: { Y0: true } },
    { frames: [f({}, 0, { AI0: 1000 }), f({}, 0, { AI0: 5000 })], expect: { Y0: true } },
    { frames: [f({}, 0, { AI0: 1000 }), f({}, 0, { AI0: 5000 }), f({}, 0, { AI0: 9000 })], expect: { Y0: false } },
    {
      frames: [f({}, 0, { AI0: 1000 }), f({}, 0, { AI0: 5000 }), f({}, 0, { AI0: 9000 }), f({}, 0, { AI0: 5000 })],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 1);
    place(gSet, 0, 0, CMPCONST("<", "AI0", 2000));
    place(gSet, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, CMPCONST(">=", "AI0", 8000));
    place(gReset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    return program(gSet, gReset);
  },
});

// ---------------------------------------------------------------------------
// 106 - Motor overload fault latch (toggle enable + trip relay)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 106,
  title: "มอเตอร์พร้อมล็อคป้องกันโหลดเกินและปุ่มรีเซ็ต",
  description:
    "X0=สวิตช์เปิดใช้งาน (ค้างสถานะ), X1=สัญญาณโหลดเกิน (จริง=เกิดปัญหา), X2=ปุ่มรีเซ็ตข้อผิดพลาด. Y0 ทำงานได้ก็ต่อเมื่อ X0 เปิดอยู่ และไม่มีข้อผิดพลาดค้าง (ข้อผิดพลาดต้องกด Reset จึงจะหายไป)",
  hints: ["ใช้ M0 = SET เมื่อ X1 จริง, RESET เมื่อ X2 จริง", "Y0 = X0 AND NC(M0)"],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false, X2: false })], expect: { Y0: true } },
    { frames: [f({ X0: true, X1: true, X2: false })], expect: { Y0: false } },
    {
      frames: [f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false })],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: true, X1: true, X2: false }),
        f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: true }),
      ],
      expect: { Y0: true },
    },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 1);
    place(gSet, 0, 0, NO("X1"));
    place(gSet, 0, COIL_COLUMN, SET("M0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X2"));
    place(gReset, 0, COIL_COLUMN, RESET("M0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, NC("M0"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gSet, gReset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 107 - Star-Delta simulated 2-stage motor sequence
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 107,
  title: "สตาร์ทมอเตอร์แบบสตาร์-เดลต้าจำลอง",
  description:
    "X0=Start (กดค้าง), X1=Stop (กดค้าง). เมื่อสตาร์ท Y0 (คอนแทคเตอร์ Star) ทำงานทันที หลังจากผ่านไป 3 รอบสแกน ให้สลับเป็น Y1 (คอนแทคเตอร์ Delta) แทน โดย Y0 และ Y1 ห้ามทำงานพร้อมกันเด็ดขาด",
  hints: [
    "ใช้ Self-Hold กับ X0/X1 เป็นตัวจดจำสถานะทำงาน (M0)",
    "ใช้ TON (T0) หน่วงเวลา 3 นับจาก M0",
    "M1 = SET เมื่อ T0.DN, RESET เมื่อ M0 เป็นเท็จ - ใช้ M1 แยก Y0/Y1",
  ],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true, X1: false })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true, X1: false }, 3)], expect: { Y0: false, Y1: true } },
    {
      frames: [f({ X0: true, X1: false }, 3), f({ X0: false, X1: true })],
      expect: { Y0: false, Y1: false },
    },
    {
      frames: [f({ X0: true, X1: false }, 3), f({ X0: false, X1: true }), f({ X0: true, X1: false })],
      expect: { Y0: true, Y1: false },
    },
  ],
  buildProgram: () => {
    const gM0 = grid(nextId(), 2);
    place(gM0, 0, 0, NO("X0"));
    place(gM0, 0, 1, NC("X1"));
    place(gM0, 0, COIL_COLUMN, COIL("M0"));
    feedLeftRail(gM0, 0);
    wireH(gM0, 0, 0, COIL_COLUMN);
    place(gM0, 1, 0, NO("M0"));
    feedLeftRail(gM0, 1);
    wireH(gM0, 1, 0, 1);
    tieVertical(gM0, 0, 1);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("M0"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 3));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gM1Set = grid(nextId(), 1);
    place(gM1Set, 0, 0, NO("T0.DN"));
    place(gM1Set, 0, COIL_COLUMN, SET("M1"));
    feedLeftRail(gM1Set, 0);
    wireH(gM1Set, 0, 0, COIL_COLUMN);

    const gM1Reset = grid(nextId(), 1);
    place(gM1Reset, 0, 0, NC("M0"));
    place(gM1Reset, 0, COIL_COLUMN, RESET("M1"));
    feedLeftRail(gM1Reset, 0);
    wireH(gM1Reset, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("M0"));
    place(gQ0, 0, 1, NC("M1"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("M0"));
    place(gQ1, 0, 1, NO("M1"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gM0, gT0, gM1Set, gM1Reset, gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 108 - Access-controlled door with open-count limit
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 108,
  title: "ประตูควบคุมการเข้าถึงพร้อมจำกัดจำนวนครั้งเปิด",
  description:
    "X0=สิทธิ์เข้าถึง (ค้างสถานะ), X1=เซนเซอร์ประตู (พัลส์เมื่อเปิด), X2=ปุ่มรีเซ็ตของหัวหน้างาน. Y0 (ปลดล็อคประตู) ทำงานได้เมื่อ X0 จริง และประตูยังเปิดไม่ครบ 3 ครั้ง",
  hints: ["ใช้ CTU (C0) นับพัลส์จาก X1 ตั้งค่า Preset = 3 พร้อม NC(C0.DN) กันนับเกิน", "Y0 = X0 AND NC(C0.DN)", "RESET C0 ด้วย X2"],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false, X2: false })], expect: { Y0: true } },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
      ],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: true }),
      ],
      expect: { Y0: true },
    },
  ],
  buildProgram: () => {
    const gCount = grid(nextId(), 1);
    place(gCount, 0, 0, NO("X1"));
    place(gCount, 0, 1, NC("C0.DN"));
    place(gCount, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gCount, 0);
    wireH(gCount, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X2"));
    place(gReset, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, NC("C0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gCount, gReset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 109 - Mixing cycle with self-terminating dwell timer
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 109,
  title: "รอบผสมสารพร้อมหยุดอัตโนมัติเมื่อครบเวลาแช่",
  description:
    "X0=Start (กดค้าง), X1=Stop ฉุกเฉิน (กดค้าง). กด Start แล้ว Y0 (มอเตอร์ผสม) ทำงานและหยุดเองอัตโนมัติหลังจากผ่านไป 3 รอบสแกน (ไม่ต้องกด Stop) หรือหยุดทันทีถ้ากด Stop ก่อนครบเวลา",
  hints: ["M0 = SET เมื่อ X0, RESET เมื่อ T0.DN หรือ X1", "T0 = TON หน่วงเวลา 3 จาก M0", "Y0 = M0 AND NC(T0.DN)"],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false })], expect: { Y0: true } },
    { frames: [f({ X0: true, X1: false }, 3)], expect: { Y0: false } },
    {
      frames: [f({ X0: true, X1: false }, 1), f({ X0: false, X1: true })],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gM0Set = grid(nextId(), 1);
    place(gM0Set, 0, 0, NO("X0"));
    place(gM0Set, 0, COIL_COLUMN, SET("M0"));
    feedLeftRail(gM0Set, 0);
    wireH(gM0Set, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("M0"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 3));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gM0Reset = grid(nextId(), 2);
    place(gM0Reset, 0, 0, NO("T0.DN"));
    place(gM0Reset, 0, COIL_COLUMN, RESET("M0"));
    feedLeftRail(gM0Reset, 0);
    wireH(gM0Reset, 0, 0, COIL_COLUMN);
    place(gM0Reset, 1, 0, NO("X1"));
    feedLeftRail(gM0Reset, 1);
    wireH(gM0Reset, 1, 0, COIL_COLUMN);
    tieVertical(gM0Reset, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("M0"));
    place(gQ0, 0, 1, NC("T0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gM0Set, gT0, gM0Reset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 110 - Two-shift production counter using custom X/Y addressing
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 110,
  title: "ตัวนับผลผลิตสองกะพร้อมสวิตช์เลือกกะ (ใช้ X/Y)",
  description:
    "X0=สวิตช์กะกลางวันทำงาน, X1=เซนเซอร์นับชิ้นงาน (พัลส์), X2=ปุ่มรีเซ็ตตัวนับ. Y0=สัญญาณครบชุด 3 ชิ้น - นับได้เฉพาะช่วงกะกลางวัน (X0 จริง) เท่านั้น ใช้ตัวแปรที่ประกาศเอง (X/Y) แทน I/Q",
  hints: [
    "กด + Add Variable เพื่อประกาศ X0, X1, X2 (Input) และ Y0 (Output) ก่อนเริ่มต่อวงจร",
    "CTU (C0) นับ X1 แต่ต้องมี X0 เป็นเงื่อนไขอนุกรมร่วมด้วย พร้อม NC(C0.DN) กันนับเกิน",
    "Y0 = C0.DN, RESET C0 ด้วย X2",
  ],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false, X2: false })], expect: { Y0: false } },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
      ],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
      ],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }), f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: true }),
      ],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gCount = grid(nextId(), 1);
    place(gCount, 0, 0, NO("X0"));
    place(gCount, 0, 1, NO("X1"));
    place(gCount, 0, 2, NC("C0.DN"));
    place(gCount, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gCount, 0);
    wireH(gCount, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X2"));
    place(gReset, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    const gY0 = grid(nextId(), 1);
    place(gY0, 0, 0, NO("C0.DN"));
    place(gY0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gY0, 0);
    wireH(gY0, 0, 0, COIL_COLUMN);

    return program(gCount, gReset, gY0);
  },
});

// ---------------------------------------------------------------------------
// 111 - Dual-stage oven: heater + safety cooling fan (AI + CMP)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 111,
  title: "เตาอบพร้อมพัดลมระบายความร้อนฉุกเฉิน",
  description:
    "AI0=อุณหภูมิ, X0=สวิตช์เปิดใช้งานเตา. Y0 (ฮีตเตอร์) ทำงานเมื่อเปิดใช้งานและอุณหภูมิต่ำกว่า 7000 เท่านั้น. Y1 (พัดลมระบายความร้อน) ต้องทำงานทันทีเมื่ออุณหภูมิถึง 7000 ขึ้นไป ไม่ว่าจะเปิดใช้งานเตาหรือไม่",
  hints: ["Y0 = X0 AND CMP(AI0 < 7000)", "Y1 = CMP(AI0 >= 7000) เท่านั้น ไม่ต้องพึ่ง X0"],
  allowedInputs: ["X0", "AI0"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false }, 0, { AI0: 5000 })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true }, 0, { AI0: 5000 })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true }, 0, { AI0: 7000 })], expect: { Y0: false, Y1: true } },
    { frames: [f({ X0: false }, 0, { AI0: 8000 })], expect: { Y0: false, Y1: true } },
    { frames: [f({ X0: true }, 0, { AI0: 6999 })], expect: { Y0: true, Y1: false } },
  ],
  buildProgram: () => {
    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, CMPCONST("<", "AI0", 7000));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, CMPCONST(">=", "AI0", 7000));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 112 - Redundant dual-sensor pressure safety latch
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 112,
  title: "ระบบความปลอดภัยแรงดันสองเซนเซอร์",
  description:
    "AI0, AI1=เซนเซอร์แรงดัน 2 ตัว, X0=ปุ่มรีเซ็ต. หากเซนเซอร์ตัวใดตัวหนึ่งเกิน 9000 ให้ M0 (ล็อคข้อผิดพลาด) ค้างสถานะไว้ แม้แรงดันจะลดลงแล้ว จนกว่าจะกด Reset. Y0 (พร้อมทำงาน) เป็นจริงเมื่อไม่มีข้อผิดพลาดค้าง",
  hints: ["ใช้ CMP สองตัว (AI0>9000 และ AI1>9000) ต่อแบบขนาน (OR) เข้า SET (M0)", "Y0 = NC(M0)"],
  allowedInputs: ["X0", "AI0", "AI1"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false }, 0, { AI0: 5000, AI1: 5000 })], expect: { Y0: true } },
    { frames: [f({ X0: false }, 0, { AI0: 9500, AI1: 5000 })], expect: { Y0: false } },
    { frames: [f({ X0: false }, 0, { AI0: 5000, AI1: 9500 })], expect: { Y0: false } },
    {
      frames: [f({ X0: false }, 0, { AI0: 9500, AI1: 5000 }), f({ X0: false }, 0, { AI0: 5000, AI1: 5000 })],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: false }, 0, { AI0: 9500, AI1: 5000 }),
        f({ X0: false }, 0, { AI0: 5000, AI1: 5000 }),
        f({ X0: true }, 0, { AI0: 5000, AI1: 5000 }),
      ],
      expect: { Y0: true },
    },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 2);
    place(gSet, 0, 0, CMPCONST(">", "AI0", 9000));
    place(gSet, 0, COIL_COLUMN, SET("M0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);
    place(gSet, 1, 0, CMPCONST(">", "AI1", 9000));
    feedLeftRail(gSet, 1);
    wireH(gSet, 1, 0, COIL_COLUMN);
    tieVertical(gSet, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X0"));
    place(gReset, 0, COIL_COLUMN, RESET("M0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NC("M0"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gSet, gReset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 113 - 3-zone conveyor downstream-clear interlock chain
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 113,
  title: "สายพานลำเลียง 3 โซนล็อคระหว่างกัน",
  description:
    "X0=เปิดใช้งานระบบ, X1=เซนเซอร์ติดขัดโซน 1, X2=เซนเซอร์ติดขัดโซน 2, X3=เซนเซอร์ติดขัดโซน 3. แต่ละโซนทำงานได้ก็ต่อเมื่อระบบเปิดใช้งาน, โซนตัวเองไม่ติดขัด, และทุกโซนที่อยู่ถัดไป (downstream) ต้องไม่ติดขัดด้วย (Y0=โซน1 อยู่ต้นสุด, Y2=โซน3 อยู่ปลายสุด)",
  hints: [
    "Y2 (โซนปลายสุด) = X0 AND NC(X3)",
    "Y1 = X0 AND NC(X2) AND NC(X3)",
    "Y0 (โซนต้นสุด) = X0 AND NC(X1) AND NC(X2) AND NC(X3)",
  ],
  allowedInputs: ["X0", "X1", "X2", "X3"],
  allowedOutputs: ["Y0", "Y1", "Y2"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false, X3: false })], expect: { Y0: false, Y1: false, Y2: false } },
    { frames: [f({ X0: true, X1: false, X2: false, X3: false })], expect: { Y0: true, Y1: true, Y2: true } },
    { frames: [f({ X0: true, X1: false, X2: false, X3: true })], expect: { Y0: false, Y1: false, Y2: false } },
    { frames: [f({ X0: true, X1: false, X2: true, X3: false })], expect: { Y0: false, Y1: false, Y2: true } },
    { frames: [f({ X0: true, X1: true, X2: false, X3: false })], expect: { Y0: false, Y1: true, Y2: true } },
  ],
  buildProgram: () => {
    const gQ2 = grid(nextId(), 1);
    place(gQ2, 0, 0, NO("X0"));
    place(gQ2, 0, 1, NC("X3"));
    place(gQ2, 0, COIL_COLUMN, COIL("Y2"));
    feedLeftRail(gQ2, 0);
    wireH(gQ2, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("X0"));
    place(gQ1, 0, 1, NC("X2"));
    place(gQ1, 0, 2, NC("X3"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, NC("X1"));
    place(gQ0, 0, 2, NC("X2"));
    place(gQ0, 0, 3, NC("X3"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gQ2, gQ1, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 114 - Timed auto-relocking access door
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 114,
  title: "ประตูควบคุมการเข้าถึงพร้อมปลดล็อคชั่วคราว",
  description:
    "X0=บัตรผ่านได้รับอนุมัติ (กดค้าง). เมื่อ X0 จริง ให้ Y0 (ปลดล็อค) ทำงานทันที และให้ล็อคกลับอัตโนมัติเองหลังจากผ่านไป 3 รอบสแกน โดยไม่ต้องมีสัญญาณอื่นมาสั่งปิด",
  hints: ["SET (Y0) เมื่อ X0", "TON (T0) หน่วงเวลา 3 จาก Y0", "RESET (Y0) เมื่อ T0.DN"],
  allowedInputs: ["X0"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false })], expect: { Y0: false } },
    { frames: [f({ X0: true })], expect: { Y0: true } },
    { frames: [f({ X0: true }, 3)], expect: { Y0: false } },
    { frames: [f({ X0: true }), f({ X0: false }, 3)], expect: { Y0: false } },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 1);
    place(gSet, 0, 0, NO("X0"));
    place(gSet, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("Y0"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 3));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("T0.DN"));
    place(gReset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    return program(gSet, gT0, gReset);
  },
});

// ---------------------------------------------------------------------------
// 115 - Batch counter with cooldown-triggered auto-reset
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 115,
  title: "ตัวนับชุดผลิตพร้อมคูลดาวน์รีเซ็ตอัตโนมัติ",
  description:
    "X0=เซนเซอร์ตรวจจับชิ้นงาน (พัลส์), X1=ปุ่มรีเซ็ตฉุกเฉิน. เมื่อครบ 3 ชิ้น Y0 (ครบชุด) ติดขึ้น และให้ตัวนับรีเซ็ตอัตโนมัติเองหลังจากครบ 2 รอบสแกนถัดไป (คูลดาวน์) โดยไม่ต้องกด Reset",
  hints: [
    "CTU (C0) preset=3 นับ X0 พร้อม NC(C0.DN) กันนับเกิน",
    "TON (T0) preset=2 หน่วงเวลาเริ่มจาก C0.DN",
    "RESET (C0) เมื่อ T0.DN หรือ X1",
  ],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false } },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
      ],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: false, X1: false }, 2),
      ],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: false, X1: true }),
      ],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gCount = grid(nextId(), 1);
    place(gCount, 0, 0, NO("X0"));
    place(gCount, 0, 1, NC("C0.DN"));
    place(gCount, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gCount, 0);
    wireH(gCount, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("C0.DN"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 2));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 2);
    place(gReset, 0, 0, NO("T0.DN"));
    place(gReset, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);
    place(gReset, 1, 0, NO("X1"));
    feedLeftRail(gReset, 1);
    wireH(gReset, 1, 0, COIL_COLUMN);
    tieVertical(gReset, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("C0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gCount, gT0, gReset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 116 - Auto/Manual mode selector
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 116,
  title: "สวิตช์เลือกโหมด Auto/Manual พร้อมเซนเซอร์วัดค่า",
  description:
    "X0=เลือกโหมด (เท็จ=Manual, จริง=Auto), X1=ปุ่มสั่งทำงานด้วยมือ, AI0=ค่าจากเซนเซอร์. โหมด Manual: Y0 ทำงานตาม X1. โหมด Auto: Y0 ทำงานเมื่อ AI0 เกิน 5000 เท่านั้น (ไม่สนใจ X1)",
  hints: ["Y0 = (NC(X0) AND X1) OR (X0 AND CMP(AI0 > 5000))"],
  allowedInputs: ["X0", "X1", "AI0"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false }, 0, { AI0: 0 })], expect: { Y0: false } },
    { frames: [f({ X0: false, X1: true }, 0, { AI0: 0 })], expect: { Y0: true } },
    { frames: [f({ X0: true, X1: true }, 0, { AI0: 0 })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false }, 0, { AI0: 6000 })], expect: { Y0: true } },
    { frames: [f({ X0: false, X1: false }, 0, { AI0: 6000 })], expect: { Y0: false } },
  ],
  buildProgram: () => {
    const g = grid(nextId(), 2);
    place(g, 0, 0, NC("X0"));
    place(g, 0, 1, NO("X1"));
    place(g, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(g, 0);
    wireH(g, 0, 0, COIL_COLUMN);
    place(g, 1, 0, NO("X0"));
    place(g, 1, 1, CMPCONST(">", "AI0", 5000));
    feedLeftRail(g, 1);
    wireH(g, 1, 0, COIL_COLUMN);
    tieVertical(g, 0, COIL_COLUMN);

    return program(g);
  },
});

// ---------------------------------------------------------------------------
// 117 - First-out alarm annunciator (mutual-exclusion latch)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 117,
  title: "สัญญาณเตือนแหล่งที่มาลำดับแรก (First-Out Annunciator)",
  description:
    "X0=แหล่งสัญญาณผิดพลาด 1, X1=แหล่งสัญญาณผิดพลาด 2, X2=ปุ่มรีเซ็ต. ต้องระบุได้ว่าแหล่งใดเกิดขึ้น 'ก่อน' - Y0 ค้างสถานะถ้า X0 เกิดก่อน, Y1 ค้างสถานะถ้า X1 เกิดก่อน โดยห้ามค้างพร้อมกันทั้งคู่",
  hints: [
    "M0 (Y0) = SET เมื่อ X0 AND NC(M1) - ล็อคได้ก็ต่อเมื่ออีกฝั่งยังไม่ล็อค",
    "M1 (Y1) = SET เมื่อ X1 AND NC(M0)",
    "ทั้งคู่ RESET ด้วย X2",
  ],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true, X1: false, X2: false })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: false, X1: true, X2: false })], expect: { Y0: false, Y1: true } },
    {
      frames: [f({ X0: true, X1: false, X2: false }), f({ X0: true, X1: true, X2: false })],
      expect: { Y0: true, Y1: false },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }),
        f({ X0: true, X1: true, X2: false }),
        f({ X0: false, X1: false, X2: true }),
      ],
      expect: { Y0: false, Y1: false },
    },
  ],
  buildProgram: () => {
    const gM0 = grid(nextId(), 1);
    place(gM0, 0, 0, NO("X0"));
    place(gM0, 0, 1, NC("M1"));
    place(gM0, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gM0, 0);
    wireH(gM0, 0, 0, COIL_COLUMN);

    const gM1 = grid(nextId(), 1);
    place(gM1, 0, 0, NO("X1"));
    place(gM1, 0, 1, NC("Y0"));
    place(gM1, 0, COIL_COLUMN, SET("M1"));
    feedLeftRail(gM1, 0);
    wireH(gM1, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("M1"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 2);
    place(gReset, 0, 0, NO("X2"));
    place(gReset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);
    place(gReset, 1, 0, NO("X2"));
    place(gReset, 1, COIL_COLUMN, RESET("M1"));
    feedLeftRail(gReset, 1);
    wireH(gReset, 1, 0, COIL_COLUMN);

    return program(gM0, gM1, gQ1, gReset);
  },
});

// ---------------------------------------------------------------------------
// 118 - Duty/Standby pump failover
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 118,
  title: "ปั๊มสำรอง Duty/Standby พร้อม Failover อัตโนมัติ",
  description:
    "X0=คำสั่งให้ทำงาน, X1=สัญญาณปั๊มหลักเสีย. Y0 (ปั๊มหลัก) ทำงานเมื่อสั่งทำงานและปั๊มหลักไม่เสีย. Y1 (ปั๊มสำรอง) ทำงานแทนทันทีเมื่อสั่งทำงานแต่ปั๊มหลักเสีย",
  hints: ["Y0 = X0 AND NC(X1)", "Y1 = X0 AND X1"],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true, X1: false })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true, X1: true })], expect: { Y0: false, Y1: true } },
    { frames: [f({ X0: false, X1: true })], expect: { Y0: false, Y1: false } },
  ],
  buildProgram: () => {
    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, NC("X1"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("X0"));
    place(gQ1, 0, 1, NO("X1"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 119 - Pressure relief valve (auto CMP + manual override)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 119,
  title: "วาล์วระบายความดันฉุกเฉินพร้อมควบคุมด้วยมือ",
  description:
    "AI0=แรงดัน, X0=เปิดวาล์วด้วยมือ, X1=ปิด/รีเซ็ตวาล์ว. Y0 (วาล์วเปิด) ต้องเปิดค้างอัตโนมัติเมื่อแรงดันเกิน 9000 หรือเมื่อกด X0 และต้องค้างไว้จนกว่าจะกด X1",
  hints: ["SET (Y0) เมื่อ CMP(AI0 > 9000) OR X0", "RESET (Y0) เมื่อ X1"],
  allowedInputs: ["X0", "X1", "AI0"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false }, 0, { AI0: 5000 })], expect: { Y0: false } },
    { frames: [f({ X0: false, X1: false }, 0, { AI0: 9500 })], expect: { Y0: true } },
    { frames: [f({ X0: true, X1: false }, 0, { AI0: 5000 })], expect: { Y0: true } },
    {
      frames: [f({ X0: false, X1: false }, 0, { AI0: 9500 }), f({ X0: false, X1: false }, 0, { AI0: 5000 })],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: false, X1: false }, 0, { AI0: 9500 }),
        f({ X0: false, X1: false }, 0, { AI0: 5000 }),
        f({ X0: false, X1: true }, 0, { AI0: 5000 }),
      ],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gSet = grid(nextId(), 2);
    place(gSet, 0, 0, CMPCONST(">", "AI0", 9000));
    place(gSet, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gSet, 0);
    wireH(gSet, 0, 0, COIL_COLUMN);
    place(gSet, 1, 0, NO("X0"));
    feedLeftRail(gSet, 1);
    wireH(gSet, 1, 0, COIL_COLUMN);
    tieVertical(gSet, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 1);
    place(gReset, 0, 0, NO("X1"));
    place(gReset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);

    return program(gSet, gReset);
  },
});

// ---------------------------------------------------------------------------
// 120 - Auto-fill tank with latched critical-low alarm
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 120,
  title: "ถังเติมอัตโนมัติพร้อมสัญญาณเตือนระดับวิกฤตค้าง",
  description:
    "AI0=ระดับถัง, X0=ปุ่มรับทราบสัญญาณเตือน. Y0 (วาล์วเติม) ทำงานแบบ Hysteresis: เปิดเมื่อระดับต่ำกว่า 2000, ปิดเมื่อถึง 8000. Y1 (สัญญาณเตือนวิกฤต) ค้างสถานะเมื่อระดับต่ำกว่า 500 จนกว่าจะกด X0",
  hints: ["Y0: CMP(AI0<2000)->SET, CMP(AI0>=8000)->RESET", "Y1: CMP(AI0<500)->SET, X0->RESET"],
  allowedInputs: ["X0", "AI0"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false }, 0, { AI0: 5000 })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: false }, 0, { AI0: 1000 })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: false }, 0, { AI0: 300 })], expect: { Y0: true, Y1: true } },
    {
      frames: [f({ X0: false }, 0, { AI0: 300 }), f({ X0: false }, 0, { AI0: 9000 })],
      expect: { Y0: false, Y1: true },
    },
    {
      frames: [f({ X0: false }, 0, { AI0: 300 }), f({ X0: false }, 0, { AI0: 9000 }), f({ X0: true }, 0, { AI0: 9000 })],
      expect: { Y0: false, Y1: false },
    },
  ],
  buildProgram: () => {
    const gQ0Set = grid(nextId(), 1);
    place(gQ0Set, 0, 0, CMPCONST("<", "AI0", 2000));
    place(gQ0Set, 0, COIL_COLUMN, SET("Y0"));
    feedLeftRail(gQ0Set, 0);
    wireH(gQ0Set, 0, 0, COIL_COLUMN);

    const gQ0Reset = grid(nextId(), 1);
    place(gQ0Reset, 0, 0, CMPCONST(">=", "AI0", 8000));
    place(gQ0Reset, 0, COIL_COLUMN, RESET("Y0"));
    feedLeftRail(gQ0Reset, 0);
    wireH(gQ0Reset, 0, 0, COIL_COLUMN);

    const gQ1Set = grid(nextId(), 1);
    place(gQ1Set, 0, 0, CMPCONST("<", "AI0", 500));
    place(gQ1Set, 0, COIL_COLUMN, SET("Y1"));
    feedLeftRail(gQ1Set, 0);
    wireH(gQ1Set, 0, 0, COIL_COLUMN);

    const gQ1Reset = grid(nextId(), 1);
    place(gQ1Reset, 0, 0, NO("X0"));
    place(gQ1Reset, 0, COIL_COLUMN, RESET("Y1"));
    feedLeftRail(gQ1Reset, 0);
    wireH(gQ1Reset, 0, 0, COIL_COLUMN);

    return program(gQ0Set, gQ0Reset, gQ1Set, gQ1Reset);
  },
});

// ---------------------------------------------------------------------------
// 121 - Two-hand anti-tie-down with timing window
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 121,
  title: "วงจรกดสองมือพร้อมหน้าต่างเวลา (Anti-Tie-Down)",
  description:
    "X0=ปุ่มมือ 1, X1=ปุ่มมือ 2. ต้องกดปุ่มทั้งสองข้างภายใน 2 รอบสแกนของกันและกัน จึงจะให้ Y0 (สั่งเครื่องอัด) ทำงาน - ถ้ากดข้างเดียวค้างไว้เกินเวลาโดยไม่กดอีกข้าง ต้องยกเลิกอัตโนมัติ (ป้องกันการผูกปุ่มค้าง)",
  hints: [
    "M0 = SET เมื่อ X0 - เป็นตัวจดจำว่ากดมือแรกแล้ว",
    "TON (T0) preset=2 หน่วงเวลาหน้าต่างจาก M0",
    "Y0 = M0 AND X1 AND NC(T0.DN)",
    "RESET (M0) เมื่อ T0.DN (หมดเวลา) หรือ Y0 (สำเร็จแล้ว)",
  ],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false })], expect: { Y0: false } },
    {
      frames: [f({ X0: true, X1: false }), f({ X0: false, X1: true })],
      expect: { Y0: true },
    },
    {
      frames: [f({ X0: true, X1: false }, 2), f({ X0: false, X1: true })],
      expect: { Y0: false },
    },
    { frames: [f({ X0: true, X1: true })], expect: { Y0: true } },
  ],
  buildProgram: () => {
    const gM0Set = grid(nextId(), 1);
    place(gM0Set, 0, 0, NO("X0"));
    place(gM0Set, 0, COIL_COLUMN, SET("M0"));
    feedLeftRail(gM0Set, 0);
    wireH(gM0Set, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("M0"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 2));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("M0"));
    place(gQ0, 0, 1, NO("X1"));
    place(gQ0, 0, 2, NC("T0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gM0Reset = grid(nextId(), 2);
    place(gM0Reset, 0, 0, NO("T0.DN"));
    place(gM0Reset, 0, COIL_COLUMN, RESET("M0"));
    feedLeftRail(gM0Reset, 0);
    wireH(gM0Reset, 0, 0, COIL_COLUMN);
    place(gM0Reset, 1, 0, NO("Y0"));
    feedLeftRail(gM0Reset, 1);
    wireH(gM0Reset, 1, 0, COIL_COLUMN);
    tieVertical(gM0Reset, 0, COIL_COLUMN);

    return program(gM0Set, gT0, gQ0, gM0Reset);
  },
});

// ---------------------------------------------------------------------------
// 122 - 2-floor lift call logic with position limits
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 122,
  title: "ลิฟต์ขนของสองชั้นพร้อมตรวจสอบตำแหน่ง",
  description:
    "X0=เรียกขึ้น, X1=เรียกลง, X2=เซนเซอร์อยู่ชั้นบนสุด, X3=เซนเซอร์อยู่ชั้นล่างสุด. Y0 (มอเตอร์ขึ้น) ทำงานเมื่อเรียกขึ้นและยังไม่ถึงชั้นบนสุด. Y1 (มอเตอร์ลง) ทำงานเมื่อเรียกลงและยังไม่ถึงชั้นล่างสุด",
  hints: ["Y0 = X0 AND NC(X2)", "Y1 = X1 AND NC(X3)"],
  allowedInputs: ["X0", "X1", "X2", "X3"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false, X3: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true, X1: false, X2: false, X3: false })], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true, X1: false, X2: true, X3: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: false, X1: true, X2: false, X3: false })], expect: { Y0: false, Y1: true } },
    { frames: [f({ X0: false, X1: true, X2: false, X3: true })], expect: { Y0: false, Y1: false } },
  ],
  buildProgram: () => {
    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("X0"));
    place(gQ0, 0, 1, NC("X2"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("X1"));
    place(gQ1, 0, 1, NC("X3"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 123 - Feeder with total-count and reject-count tracking
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 123,
  title: "ระบบป้อนชิ้นงานพร้อมนับรวมและนับของเสีย",
  description:
    "X0=เซนเซอร์นับชิ้นงานรวม (พัลส์), X1=เซนเซอร์ตรวจพบของเสีย (พัลส์), X2=ปุ่มรีเซ็ต. Y0 ติดเมื่อครบชุด 3 ชิ้น. Y1 ติดเมื่อพบของเสียครบ 2 ชิ้น (หยุดสายการผลิตเพื่อตรวจสอบ)",
  hints: ["ใช้ CTU (C0) preset=3 นับ X0 และ CTU (C1) preset=2 นับ X1 แยกกัน อย่าลืม NC ของแต่ละ .DN กันนับเกิน", "Y0=C0.DN, Y1=C1.DN, RESET ทั้งคู่ด้วย X2"],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false, Y1: false } },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
      ],
      expect: { Y0: true, Y1: false },
    },
    {
      frames: [
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
      ],
      expect: { Y0: false, Y1: true },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: false, X2: true }),
      ],
      expect: { Y0: false, Y1: false },
    },
  ],
  buildProgram: () => {
    const gC0 = grid(nextId(), 1);
    place(gC0, 0, 0, NO("X0"));
    place(gC0, 0, 1, NC("C0.DN"));
    place(gC0, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gC0, 0);
    wireH(gC0, 0, 0, COIL_COLUMN);

    const gC1 = grid(nextId(), 1);
    place(gC1, 0, 0, NO("X1"));
    place(gC1, 0, 1, NC("C1.DN"));
    place(gC1, 0, COIL_COLUMN, CTU("C1", 2));
    feedLeftRail(gC1, 0);
    wireH(gC1, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 2);
    place(gReset, 0, 0, NO("X2"));
    place(gReset, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);
    place(gReset, 1, 0, NO("X2"));
    place(gReset, 1, COIL_COLUMN, RESET("C1"));
    feedLeftRail(gReset, 1);
    wireH(gReset, 1, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("C0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("C1.DN"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gC0, gC1, gReset, gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 124 - Welding station cycle limit + cooldown lockout
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 124,
  title: "สถานีเชื่อมพร้อมจำกัดรอบและคูลดาวน์",
  description:
    "X0=ทริกเกอร์เชื่อม (พัลส์), X1=ปุ่มรีเซ็ตด้วยมือ. Y0 (อนุญาตให้เชื่อม) เป็นจริงตลอดเวลา จนกว่าจะเชื่อมครบ 3 ครั้งติดต่อกัน ซึ่งจะบล็อคการเชื่อมจนกว่าจะผ่านไป 2 รอบสแกน (คูลดาวน์) หรือกด Reset",
  hints: ["CTU (C0) preset=3 นับ X0 พร้อม NC(C0.DN) กันนับเกิน", "Y0 = NC(C0.DN)", "TON (T0) preset=2 จาก C0.DN, RESET C0 เมื่อ T0.DN หรือ X1"],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: true } },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
      ],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: false, X1: false }, 2),
      ],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: true, X1: false }), f({ X0: false, X1: false }),
        f({ X0: false, X1: true }),
      ],
      expect: { Y0: true },
    },
  ],
  buildProgram: () => {
    const gCount = grid(nextId(), 1);
    place(gCount, 0, 0, NO("X0"));
    place(gCount, 0, 1, NC("C0.DN"));
    place(gCount, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gCount, 0);
    wireH(gCount, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("C0.DN"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 2));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gReset = grid(nextId(), 2);
    place(gReset, 0, 0, NO("T0.DN"));
    place(gReset, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gReset, 0);
    wireH(gReset, 0, 0, COIL_COLUMN);
    place(gReset, 1, 0, NO("X1"));
    feedLeftRail(gReset, 1);
    wireH(gReset, 1, 0, COIL_COLUMN);
    tieVertical(gReset, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NC("C0.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gCount, gT0, gReset, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 125 - Two-key high-voltage cabinet interlock
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 125,
  title: "ระบบล็อคตู้ไฟฟ้าแรงสูงด้วยกุญแจนิรภัย 2 ดอก",
  description:
    "X0=กุญแจดอกที่ 1, X1=กุญแจดอกที่ 2, X2=เซนเซอร์ประตูตู้ (จริง=เปิดอยู่). Y0 (จ่ายไฟ) ทำงานได้ก็ต่อเมื่อไขกุญแจทั้งสองดอกพร้อมกัน และประตูตู้ปิดสนิทเท่านั้น",
  hints: ["ใช้หน้าสัมผัสอนุกรม 3 ตัวในรังเดียว: X0, X1, และ NC ของ X2"],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: false, X2: false })], expect: { Y0: false } },
    { frames: [f({ X0: true, X1: true, X2: false })], expect: { Y0: true } },
    { frames: [f({ X0: true, X1: true, X2: true })], expect: { Y0: false } },
    { frames: [f({ X0: false, X1: true, X2: false })], expect: { Y0: false } },
  ],
  buildProgram: () => {
    const g = grid(nextId(), 1);
    place(g, 0, 0, NO("X0"));
    place(g, 0, 1, NO("X1"));
    place(g, 0, 2, NC("X2"));
    place(g, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(g, 0);
    wireH(g, 0, 0, COIL_COLUMN);

    return program(g);
  },
});

// ---------------------------------------------------------------------------
// 126 - Conveyor jam detection via sensor-timeout
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 126,
  title: "ตรวจจับสายพานติดขัดด้วยเวลา (Jam Detection)",
  description:
    "X0=Start (กดค้าง), X1=Stop (กดค้าง), X2=เซนเซอร์พบวัสดุไหลผ่าน (จริง=ปกติ), X3=ปุ่มรีเซ็ตข้อผิดพลาด. หากมอเตอร์ทำงานอยู่แต่ไม่พบวัสดุไหลผ่านนาน 3 รอบสแกน ให้ถือว่าสายพานติดขัด: ปิดมอเตอร์ Y0 และติดสัญญาณเตือน Y1 ค้างไว้จนกว่าจะกด Reset",
  hints: [
    "M0 = Self-Hold ของ X0/X1 (คำสั่งให้ทำงาน)",
    "TON (T0) preset=3 จาก (M0 AND NC(X2)) - นับเวลาที่วัสดุขาดหายไป",
    "M1 = SET เมื่อ T0.DN, RESET เมื่อ X3",
    "Y0 = M0 AND NC(M1), Y1 = M1",
  ],
  allowedInputs: ["X0", "X1", "X2", "X3"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false, X3: false })], expect: { Y0: false, Y1: false } },
    { frames: [f({ X0: true, X1: false, X2: true, X3: false }, 5)], expect: { Y0: true, Y1: false } },
    { frames: [f({ X0: true, X1: false, X2: false, X3: false }, 3)], expect: { Y0: false, Y1: true } },
    {
      frames: [
        f({ X0: true, X1: false, X2: false, X3: false }, 3),
        f({ X0: true, X1: false, X2: true, X3: true }),
      ],
      expect: { Y0: true, Y1: false },
    },
  ],
  buildProgram: () => {
    const gM0 = grid(nextId(), 2);
    place(gM0, 0, 0, NO("X0"));
    place(gM0, 0, 1, NC("X1"));
    place(gM0, 0, COIL_COLUMN, COIL("M0"));
    feedLeftRail(gM0, 0);
    wireH(gM0, 0, 0, COIL_COLUMN);
    place(gM0, 1, 0, NO("M0"));
    feedLeftRail(gM0, 1);
    wireH(gM0, 1, 0, 1);
    tieVertical(gM0, 0, 1);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("M0"));
    place(gT0, 0, 1, NC("X2"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 3));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gM1Set = grid(nextId(), 1);
    place(gM1Set, 0, 0, NO("T0.DN"));
    place(gM1Set, 0, COIL_COLUMN, SET("M1"));
    feedLeftRail(gM1Set, 0);
    wireH(gM1Set, 0, 0, COIL_COLUMN);

    const gM1Reset = grid(nextId(), 1);
    place(gM1Reset, 0, 0, NO("X3"));
    place(gM1Reset, 0, COIL_COLUMN, RESET("M1"));
    feedLeftRail(gM1Reset, 0);
    wireH(gM1Reset, 0, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("M0"));
    place(gQ0, 0, 1, NC("M1"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("M1"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gM0, gT0, gM1Set, gM1Reset, gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 127 - Sequential dual-ingredient dosing (dual AI + CMP)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 127,
  title: "ผสมสารสองชนิดตามลำดับด้วยเซนเซอร์เปรียบเทียบ",
  description:
    "AI0=ระดับสาร A, AI1=ระดับสาร B. Y0 (วาล์ว A) เปิดจนกว่า AI0 จะถึง 5000. หลังจากนั้น Y1 (วาล์ว B) จึงเปิดจนกว่า AI1 จะถึง 3000 (วาล์ว B ต้องไม่เปิดก่อนสาร A เสร็จ)",
  hints: ["Y0 = CMP(AI0 < 5000)", "Y1 = CMP(AI0 >= 5000) AND CMP(AI1 < 3000)"],
  allowedInputs: ["AI0", "AI1"],
  allowedOutputs: ["Y0", "Y1"],
  testCases: [
    { frames: [f({}, 0, { AI0: 0, AI1: 0 })], expect: { Y0: true, Y1: false } },
    { frames: [f({}, 0, { AI0: 6000, AI1: 0 })], expect: { Y0: false, Y1: true } },
    { frames: [f({}, 0, { AI0: 6000, AI1: 4000 })], expect: { Y0: false, Y1: false } },
    { frames: [f({}, 0, { AI0: 3000, AI1: 1000 })], expect: { Y0: true, Y1: false } },
  ],
  buildProgram: () => {
    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, CMPCONST("<", "AI0", 5000));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, CMPCONST(">=", "AI0", 5000));
    place(gQ1, 0, 1, CMPCONST("<", "AI1", 3000));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    return program(gQ0, gQ1);
  },
});

// ---------------------------------------------------------------------------
// 128 - Cumulative reject-rate alarm with batch-complete auto-reset
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 128,
  title: "สัญญาณเตือนของเสียสะสมพร้อมรีเซ็ตเมื่อครบชุด",
  description:
    "X0=เซนเซอร์นับชิ้นงานรวม (พัลส์), X1=เซนเซอร์ของเสีย (พัลส์), X2=ปุ่มรีเซ็ตด้วยมือ. Y0 ติดเมื่อของเสียครบ 2 ชิ้น. เมื่อนับครบชุด 3 ชิ้น (รวม) ให้ตัวนับทั้งสองรีเซ็ตอัตโนมัติเพื่อเริ่มชุดใหม่",
  hints: ["CTU (C0) preset=3 นับรวม, CTU (C1) preset=2 นับของเสีย", "Y0 = C1.DN", "RESET ทั้งคู่เมื่อ C0.DN หรือ X2"],
  allowedInputs: ["X0", "X1", "X2"],
  allowedOutputs: ["Y0"],
  testCases: [
    { frames: [f({ X0: false, X1: false, X2: false })], expect: { Y0: false } },
    {
      frames: [
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
      ],
      expect: { Y0: true },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: true, X1: false, X2: false }), f({ X0: false, X1: false, X2: false }),
      ],
      expect: { Y0: false },
    },
    {
      frames: [
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: true, X2: false }), f({ X0: false, X1: false, X2: false }),
        f({ X0: false, X1: false, X2: true }),
      ],
      expect: { Y0: false },
    },
  ],
  buildProgram: () => {
    const gC0 = grid(nextId(), 1);
    place(gC0, 0, 0, NO("X0"));
    place(gC0, 0, 1, NC("C0.DN"));
    place(gC0, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gC0, 0);
    wireH(gC0, 0, 0, COIL_COLUMN);

    const gC1 = grid(nextId(), 1);
    place(gC1, 0, 0, NO("X1"));
    place(gC1, 0, 1, NC("C1.DN"));
    place(gC1, 0, COIL_COLUMN, CTU("C1", 2));
    feedLeftRail(gC1, 0);
    wireH(gC1, 0, 0, COIL_COLUMN);

    const gResetC0 = grid(nextId(), 2);
    place(gResetC0, 0, 0, NO("C0.DN"));
    place(gResetC0, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gResetC0, 0);
    wireH(gResetC0, 0, 0, COIL_COLUMN);
    place(gResetC0, 1, 0, NO("X2"));
    feedLeftRail(gResetC0, 1);
    wireH(gResetC0, 1, 0, COIL_COLUMN);
    tieVertical(gResetC0, 0, COIL_COLUMN);

    const gResetC1 = grid(nextId(), 2);
    place(gResetC1, 0, 0, NO("C0.DN"));
    place(gResetC1, 0, COIL_COLUMN, RESET("C1"));
    feedLeftRail(gResetC1, 0);
    wireH(gResetC1, 0, 0, COIL_COLUMN);
    place(gResetC1, 1, 0, NO("X2"));
    feedLeftRail(gResetC1, 1);
    wireH(gResetC1, 1, 0, COIL_COLUMN);
    tieVertical(gResetC1, 0, COIL_COLUMN);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("C1.DN"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    return program(gC0, gC1, gResetC0, gResetC1, gQ0);
  },
});

// ---------------------------------------------------------------------------
// 129 - 3-step sequential machine start (2 cascaded timers)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 129,
  title: "สตาร์ทเครื่องจักรตามลำดับ 3 ขั้นตอน",
  description:
    "X0=Start (กดค้าง), X1=Stop (กดค้าง). กด Start แล้ว Y0 (ปั๊มน้ำมันหล่อลื่น) ทำงานทันที. หลังจากผ่านไป 2 รอบสแกน ให้ Y1 (มอเตอร์หลัก) เริ่มทำงาน. หลังจากมอเตอร์หลักทำงานครบอีก 1 รอบสแกน ให้ Y2 (สายพานลำเลียง) เริ่มทำงานด้วย ทั้งหมดหยุดพร้อมกันเมื่อกด Stop",
  hints: [
    "M0 = Self-Hold ของ X0/X1, Y0 = M0",
    "TON (T0) preset=2 จาก M0, Y1 = M0 AND T0.DN",
    "TON (T1) preset=2 จาก Y1, Y2 = Y1 AND T1.DN",
  ],
  allowedInputs: ["X0", "X1"],
  allowedOutputs: ["Y0", "Y1", "Y2"],
  testCases: [
    { frames: [f({ X0: false, X1: false })], expect: { Y0: false, Y1: false, Y2: false } },
    { frames: [f({ X0: true, X1: false })], expect: { Y0: true, Y1: false, Y2: false } },
    { frames: [f({ X0: true, X1: false }, 2)], expect: { Y0: true, Y1: true, Y2: false } },
    { frames: [f({ X0: true, X1: false }, 3)], expect: { Y0: true, Y1: true, Y2: true } },
    {
      frames: [f({ X0: true, X1: false }, 3), f({ X0: false, X1: true })],
      expect: { Y0: false, Y1: false, Y2: false },
    },
  ],
  buildProgram: () => {
    const gM0 = grid(nextId(), 2);
    place(gM0, 0, 0, NO("X0"));
    place(gM0, 0, 1, NC("X1"));
    place(gM0, 0, COIL_COLUMN, COIL("M0"));
    feedLeftRail(gM0, 0);
    wireH(gM0, 0, 0, COIL_COLUMN);
    place(gM0, 1, 0, NO("M0"));
    feedLeftRail(gM0, 1);
    wireH(gM0, 1, 0, 1);
    tieVertical(gM0, 0, 1);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("M0"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("M0"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 2));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("M0"));
    place(gQ1, 0, 1, NO("T0.DN"));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    const gT1 = grid(nextId(), 1);
    place(gT1, 0, 0, NO("Y1"));
    place(gT1, 0, COIL_COLUMN, TON("T1", 2));
    feedLeftRail(gT1, 0);
    wireH(gT1, 0, 0, COIL_COLUMN);

    const gQ2 = grid(nextId(), 1);
    place(gQ2, 0, 0, NO("Y1"));
    place(gQ2, 0, 1, NO("T1.DN"));
    place(gQ2, 0, COIL_COLUMN, COIL("Y2"));
    feedLeftRail(gQ2, 0);
    wireH(gQ2, 0, 0, COIL_COLUMN);

    return program(gM0, gQ0, gT0, gQ1, gT1, gQ2);
  },
});

// ---------------------------------------------------------------------------
// 130 - Full automated packaging line (capstone)
// ---------------------------------------------------------------------------
DESCRIPTORS.push({
  levelNumber: 130,
  title: "ระบบบรรจุภัณฑ์อัตโนมัติแบบครบวงจร",
  description:
    "X0=Start (กดค้าง), X1=Stop (กดค้าง), X2=เซนเซอร์กล่องผ่าน (พัลส์), X3=ปุ่มรีเซ็ตพาเลท. AI0=น้ำหนักกล่อง. Y0=สายพาน ทำงานตาม Start/Stop. Y1=ประตูคัดออก เปิดเมื่อกล่องน้ำหนักต่ำกว่า 3000 (ของเสีย). นับเฉพาะกล่องดีครบ 3 กล่อง/พาเลท (Y2) แล้วหน่วงเวลา 2 รอบก่อนส่งสัญญาณส่งออกพาเลท (Y3) และรีเซ็ตตัวนับเองสำหรับพาเลทถัดไป",
  hints: [
    "M0 = Self-Hold ของ X0/X1, Y0 = M0",
    "Y1 = M0 AND CMP(AI0 < 3000)",
    "CTU (C0) preset=3 นับ X2 โดยมีเงื่อนไข M0 AND NC(Y1) AND NC(C0.DN) (นับเฉพาะกล่องดีที่ไม่ถูกคัดออก)",
    "Y2 = C0.DN, TON (T0) preset=2 จาก Y2, Y3 = Y2 AND T0.DN",
    "RESET C0 เมื่อ Y3 หรือ X3",
  ],
  allowedInputs: ["X0", "X1", "X2", "X3", "AI0"],
  allowedOutputs: ["Y0", "Y1", "Y2", "Y3"],
  testCases: [
    {
      frames: [f({ X0: false, X1: false, X2: false, X3: false }, 0, { AI0: 5000 })],
      expect: { Y0: false, Y1: false, Y2: false, Y3: false },
    },
    {
      frames: [f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 })],
      expect: { Y0: true, Y1: false, Y2: false, Y3: false },
    },
    {
      frames: [f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 2000 })],
      expect: { Y0: true, Y1: true, Y2: false, Y3: false },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: true, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: true, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: true, X3: false }, 0, { AI0: 5000 }),
      ],
      expect: { Y0: true, Y1: false, Y2: true, Y3: false },
    },
    {
      frames: [
        f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: true, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: true, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: false, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: true, X3: false }, 0, { AI0: 5000 }),
        f({ X0: true, X1: false, X2: false, X3: false }, 2, { AI0: 5000 }),
      ],
      expect: { Y2: true, Y3: true },
    },
  ],
  buildProgram: () => {
    const gM0 = grid(nextId(), 2);
    place(gM0, 0, 0, NO("X0"));
    place(gM0, 0, 1, NC("X1"));
    place(gM0, 0, COIL_COLUMN, COIL("M0"));
    feedLeftRail(gM0, 0);
    wireH(gM0, 0, 0, COIL_COLUMN);
    place(gM0, 1, 0, NO("M0"));
    feedLeftRail(gM0, 1);
    wireH(gM0, 1, 0, 1);
    tieVertical(gM0, 0, 1);

    const gQ0 = grid(nextId(), 1);
    place(gQ0, 0, 0, NO("M0"));
    place(gQ0, 0, COIL_COLUMN, COIL("Y0"));
    feedLeftRail(gQ0, 0);
    wireH(gQ0, 0, 0, COIL_COLUMN);

    const gQ1 = grid(nextId(), 1);
    place(gQ1, 0, 0, NO("M0"));
    place(gQ1, 0, 1, CMPCONST("<", "AI0", 3000));
    place(gQ1, 0, COIL_COLUMN, COIL("Y1"));
    feedLeftRail(gQ1, 0);
    wireH(gQ1, 0, 0, COIL_COLUMN);

    const gC0 = grid(nextId(), 1);
    place(gC0, 0, 0, NO("M0"));
    place(gC0, 0, 1, NC("Y1"));
    place(gC0, 0, 2, NO("X2"));
    place(gC0, 0, 3, NC("C0.DN"));
    place(gC0, 0, COIL_COLUMN, CTU("C0", 3));
    feedLeftRail(gC0, 0);
    wireH(gC0, 0, 0, COIL_COLUMN);

    const gQ2 = grid(nextId(), 1);
    place(gQ2, 0, 0, NO("C0.DN"));
    place(gQ2, 0, COIL_COLUMN, COIL("Y2"));
    feedLeftRail(gQ2, 0);
    wireH(gQ2, 0, 0, COIL_COLUMN);

    const gT0 = grid(nextId(), 1);
    place(gT0, 0, 0, NO("Y2"));
    place(gT0, 0, COIL_COLUMN, TON("T0", 2));
    feedLeftRail(gT0, 0);
    wireH(gT0, 0, 0, COIL_COLUMN);

    const gQ3 = grid(nextId(), 1);
    place(gQ3, 0, 0, NO("Y2"));
    place(gQ3, 0, 1, NO("T0.DN"));
    place(gQ3, 0, COIL_COLUMN, COIL("Y3"));
    feedLeftRail(gQ3, 0);
    wireH(gQ3, 0, 0, COIL_COLUMN);

    const gResetC0 = grid(nextId(), 2);
    place(gResetC0, 0, 0, NO("Y3"));
    place(gResetC0, 0, COIL_COLUMN, RESET("C0"));
    feedLeftRail(gResetC0, 0);
    wireH(gResetC0, 0, 0, COIL_COLUMN);
    place(gResetC0, 1, 0, NO("X3"));
    feedLeftRail(gResetC0, 1);
    wireH(gResetC0, 1, 0, COIL_COLUMN);
    tieVertical(gResetC0, 0, COIL_COLUMN);

    return program(gM0, gQ0, gQ1, gC0, gQ2, gT0, gQ3, gResetC0);
  },
});

function main() {
  const output: { level_number: number; title: string; optimal_blocks_count: number; map_layout_json: LevelSpec }[] = [];
  const errors: string[] = [];

  for (const desc of DESCRIPTORS) {
    const gridProgram = desc.buildProgram();
    const spec: LevelSpec = {
      description: desc.description,
      skill: "efficiency",
      allowedInputs: desc.allowedInputs,
      allowedOutputs: desc.allowedOutputs,
      testCases: desc.testCases,
      hints: desc.hints,
    };
    const result = evaluateGridLevel(gridProgram, spec);
    if (!result.passed) {
      const failed = result.results.filter((r) => !r.passed).map((r) => r.index);
      errors.push(`Level ${desc.levelNumber} (${desc.title}): reference solution FAILED test case(s) ${failed.join(", ")}`);
      continue;
    }
    output.push({
      level_number: desc.levelNumber,
      title: desc.title,
      optimal_blocks_count: countGridBlocks(gridProgram),
      map_layout_json: spec,
    });
  }

  if (errors.length > 0) {
    console.error(`Generation FAILED with ${errors.length} error(s):\n`);
    errors.forEach((e) => console.error(" - " + e));
    process.exit(1);
  }

  const outPath = "./scripts/level-gen/efficiency-levels.json";
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`OK: generated and self-verified ${output.length} levels -> ${outPath}`);
}

main();
