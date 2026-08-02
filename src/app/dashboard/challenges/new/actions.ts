"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { generateGeminiJSON, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import { isChallengeStagesJson, type ChallengeStagesJson, type RequiredCompetency } from "@/lib/ladder/challenge-types";

async function requireTeacher() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher") {
    throw new Error("Forbidden: teacher role required.");
  }
  return profile;
}

/**
 * Gemini can't express an arbitrary-keyed Record<string,boolean> in its
 * OpenAPI-subset response schema, so the AI's own output shape uses
 * address/value ARRAYS instead - converted to the real ChallengeStagesJson
 * shape (Record-keyed frame.inputs, StageExpectation[]) after the call.
 * Scoped to exactly one testCase and no safety constraints unless the
 * teacher's prompt clearly implies a hazard - multi-scenario generation
 * and reliable safety-constraint authoring are exactly the kind of subtle,
 * hard-to-verify content this session's own challenge authoring needed
 * hand-built reference solutions to catch bugs in, which an AI draft can't
 * self-verify the way generate.ts/generate-efficiency.ts do.
 */
const AI_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    hints: { type: "ARRAY", items: { type: "STRING" } },
    requiredCompetencies: {
      type: "ARRAY",
      items: { type: "STRING", enum: ["NO_NC", "TIMER", "COUNTER", "ANALOG", "INTERLOCK", "MATH"] },
    },
    maxOptimalBlocks: { type: "INTEGER" },
    stages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          name: { type: "STRING" },
          frames: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                ticks: { type: "INTEGER" },
                inputs: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { address: { type: "STRING" }, value: { type: "BOOLEAN" } },
                    required: ["address", "value"],
                  },
                },
                analogInputs: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { address: { type: "STRING" }, value: { type: "INTEGER" } },
                    required: ["address", "value"],
                  },
                },
              },
              required: ["ticks", "inputs"],
            },
          },
          expect: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                kind: { type: "STRING", enum: ["bit", "numeric"] },
                address: { type: "STRING" },
                expectedBit: { type: "BOOLEAN" },
                operator: { type: "STRING", enum: [">", "<", "==", ">=", "<="] },
                expectedValue: { type: "INTEGER" },
              },
              required: ["kind", "address"],
            },
          },
        },
        required: ["id", "name", "frames", "expect"],
      },
    },
  },
  required: ["title", "description", "hints", "requiredCompetencies", "maxOptimalBlocks", "stages"],
};

type AiExpectation = {
  kind: "bit" | "numeric";
  address: string;
  expectedBit?: boolean;
  operator?: ">" | "<" | "==" | ">=" | "<=";
  expectedValue?: number;
};
type AiDraft = {
  title: string;
  description: string;
  hints: string[];
  requiredCompetencies: RequiredCompetency[];
  maxOptimalBlocks: number;
  stages: {
    id: string;
    name: string;
    frames: { ticks: number; inputs: { address: string; value: boolean }[]; analogInputs?: { address: string; value: number }[] }[];
    expect: AiExpectation[];
  }[];
};

function convertExpectation(e: AiExpectation) {
  if (e.kind === "numeric") {
    return { kind: "numeric" as const, address: e.address, operator: e.operator ?? "==", value: e.expectedValue ?? 0 };
  }
  return { kind: "bit" as const, address: e.address, expected: e.expectedBit ?? true };
}

function draftToStagesJson(draft: AiDraft): ChallengeStagesJson {
  return {
    testCases: [
      {
        stages: draft.stages.map((s) => ({
          id: s.id,
          name: s.name,
          frames: s.frames.map((f) => ({
            ticks: f.ticks,
            inputs: Object.fromEntries(f.inputs.map((p) => [p.address, p.value])),
            ...(f.analogInputs && f.analogInputs.length > 0
              ? { analogInputs: Object.fromEntries(f.analogInputs.map((p) => [p.address, p.value])) }
              : {}),
          })),
          expect: s.expect.map(convertExpectation),
        })),
      },
    ],
  };
}

export type GenerateChallengeDraftResult =
  | {
      ok: true;
      title: string;
      description: string;
      hints: string[];
      requiredCompetencies: RequiredCompetency[];
      maxOptimalBlocks: number;
      stagesJson: ChallengeStagesJson;
    }
  | { ok: false; error: string };

/** AI-assist: teacher types a rough scenario, Gemini drafts title/description/hints/competencies and one scripted testCase. Always reviewed (and, ideally, test-run against a real solution in the embedded editor) by the teacher before saving - see AI_SCHEMA's doc comment for why this can't self-verify the way the hand-authored 50 challenges did. */
export async function generateChallengeDraftAction(roughIdea: string): Promise<GenerateChallengeDraftResult> {
  try {
    await requireTeacher();
  } catch {
    return { ok: false, error: "Forbidden." };
  }
  if (!roughIdea.trim()) return { ok: false, error: "กรุณาอธิบายโจทย์คร่าวๆ ก่อน" };

  const prompt = `คุณเป็นผู้ช่วยออกแบบโจทย์ Challenge Mode สำหรับหลักสูตร PLC Ladder Logic ระดับสูง (การจำลองโรงงานอุตสาหกรรม) เป็นภาษาไทยเชิงเทคนิค

แนวคิดโจทย์คร่าวๆ จากอาจารย์: "${roughIdea.trim()}"

สร้างโจทย์ที่มี:
- title: ชื่อโจทย์สั้นๆ กระชับ
- description: อธิบายสถานการณ์อุตสาหกรรมและเงื่อนไขการทำงานอย่างละเอียด ระบุแอดเดรส I/O ที่ใช้ (เช่น X0, X1, Y0) พร้อมความหมายของแต่ละแอดเดรส
- hints: คำใบ้ 2-3 ข้อ แนะแนวทางแก้โจทย์โดยไม่เฉลยตรงๆ
- requiredCompetencies: เลือกจาก NO_NC, TIMER, COUNTER, ANALOG, INTERLOCK, MATH ตามที่โจทย์นี้ต้องใช้จริง
- maxOptimalBlocks: จำนวนบล็อกลอจิกโดยประมาณที่ใช้แก้โจทย์นี้อย่างมีประสิทธิภาพ (เลขจำนวนเต็ม)
- stages: ลำดับขั้นตอนการทดสอบ (อย่างน้อย 2 ขั้นตอน) แต่ละขั้นตอนมี frames (สถานะอินพุตที่จะป้อนตามลำดับ พร้อมจำนวนรอบสแกน ticks ที่ต้องรอ) และ expect (เงื่อนไขที่ต้องเป็นจริงหลังจากขั้นตอนนี้จบ โดยอ้างอิงแอดเดรสเอาต์พุต Y หรือบิต .DN ของ Timer/Counter เท่านั้น ห้ามอ้างอิงแอดเดรสอินพุต X ใน expect)

ใช้แอดเดรสตามมาตรฐาน Mitsubishi/JIS เท่านั้น: X0-X7 (อินพุต), Y0-Y3 (เอาต์พุต), M0-M99 (รีเลย์ภายใน), T0-T99 (ไทม์เมอร์), C0-C99 (เคาน์เตอร์), AI0-AI15 (อินพุตอนาล็อก) ห้ามใช้ I หรือ Q เด็ดขาด`;

  try {
    const draft = await generateGeminiJSON<AiDraft>(prompt, AI_SCHEMA);
    return {
      ok: true,
      title: draft.title,
      description: draft.description,
      hints: draft.hints ?? [],
      requiredCompetencies: draft.requiredCompetencies ?? [],
      maxOptimalBlocks: draft.maxOptimalBlocks ?? 10,
      stagesJson: draftToStagesJson(draft),
    };
  } catch (err) {
    console.error("generateChallengeDraftAction: Gemini call failed", err);
    if (err instanceof GeminiConfigError) return { ok: false, error: "ระบบ AI ยังไม่ได้ตั้งค่าไว้บนเซิร์ฟเวอร์นี้" };
    if (err instanceof GeminiRequestError) return { ok: false, error: "ไม่สามารถเชื่อมต่อบริการ AI ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง" };
    return { ok: false, error: "เกิดข้อผิดพลาดที่ไม่คาดคิด" };
  }
}

export type CreateChallengeInput = {
  title: string;
  description: string;
  hints: string[];
  requiredCompetencies: RequiredCompetency[];
  maxOptimalBlocks: number;
  stagesJsonText: string;
};

export type CreateChallengeResult = { error: string | null; challengeLevelId?: string };

/** Level number (challenge_id) continues from the current max - never reuses or requires manual numbering. */
export async function createChallengeAction(input: CreateChallengeInput): Promise<CreateChallengeResult> {
  if (!input.title.trim()) return { error: "กรุณาระบุชื่อโจทย์" };
  if (!input.description.trim()) return { error: "กรุณาระบุคำอธิบายโจทย์" };
  if (input.requiredCompetencies.length === 0) return { error: "กรุณาเลือกทักษะที่เกี่ยวข้องอย่างน้อย 1 รายการ" };

  let stagesJson: unknown;
  try {
    stagesJson = JSON.parse(input.stagesJsonText);
  } catch {
    return { error: "รูปแบบ JSON ของเงื่อนไขการทดสอบไม่ถูกต้อง" };
  }
  if (!isChallengeStagesJson(stagesJson)) {
    return { error: "โครงสร้างเงื่อนไขการทดสอบไม่ถูกต้อง (ต้องมี testCases เป็นอาร์เรย์)" };
  }

  try {
    await requireTeacher();
    const supabase = await createClient();

    const { data: maxRow, error: maxError } = await supabase
      .from("challenge_levels")
      .select("challenge_id")
      .order("challenge_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) {
      console.error("createChallengeAction: failed to read max challenge_id", maxError);
      return { error: "ไม่สามารถกำหนดหมายเลขโจทย์ได้" };
    }
    const nextChallengeId = (maxRow?.challenge_id ?? 0) + 1;

    const { data, error } = await supabase
      .from("challenge_levels")
      .insert({
        challenge_id: nextChallengeId,
        title: input.title.trim(),
        description: input.description.trim(),
        required_competencies: input.requiredCompetencies,
        hints: input.hints.filter((h) => h.trim()),
        stages_json: stagesJson,
        max_optimal_blocks: input.maxOptimalBlocks,
      })
      .select("id")
      .single();

    if (error) {
      console.error("createChallengeAction: insert failed", error);
      return { error: "ไม่สามารถบันทึกโจทย์ได้" };
    }

    revalidatePath("/dashboard/challenges");
    return { error: null, challengeLevelId: data.id };
  } catch (err) {
    console.error("createChallengeAction crashed:", err);
    return { error: "เกิดข้อผิดพลาดที่ไม่คาดคิด" };
  }
}
