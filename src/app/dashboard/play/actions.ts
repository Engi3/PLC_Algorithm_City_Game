"use server";

import { generateGeminiText, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import { programToStructuredText } from "@/lib/ladder/render-st";
import { isComparisonBlock, type Inputs, type LadderProgram, type SimMemory } from "@/lib/ladder/types";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type HintResult =
  | { hint: string; hintCreditsRemaining: number | null; error?: undefined }
  | { error: string; hint?: undefined };

function hasUnassignedAddress(program: LadderProgram): boolean {
  return program.rungs.some(
    (r) =>
      r.branches.some((b) =>
        b.cells.some((c) => c && (isComparisonBlock(c) ? !c.sourceA : !c.address))
      ) || r.outputs.some((o) => !o.address)
  );
}

export async function getHintAction(
  program: LadderProgram,
  inputs: Inputs,
  memory: SimMemory
): Promise<HintResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };

    // Teachers get unlimited hints (previewing/testing content); everyone
    // else spends a hint_credit, purchasable in the shop once exhausted.
    const isEconomySubject = profile.role !== "teacher";
    if (isEconomySubject && profile.hint_credits <= 0) {
      return { error: "คุณใช้คำใบ้ครบแล้ว กรุณาซื้อ Hint Unlocker จากร้านค้า" };
    }

    const st = programToStructuredText(program);
    const unassignedNote = hasUnassignedAddress(program)
      ? "หมายเหตุ: มีบาง contact หรือ output ที่ยังไม่ได้กำหนดแอดเดรส (address)"
      : "";

    const prompt = `คุณเป็นติวเตอร์สอน PLC Ladder Logic ให้กับนักศึกษาเมคคาทรอนิกส์ที่กำลังฝึกในแซนด์บ็อกซ์

โปรแกรมปัจจุบัน (แปลงเป็น Structured Text โดยประมาณ):
${st}

สถานะ Input: ${JSON.stringify(inputs)}
สถานะ Coil: ${JSON.stringify(memory.coils)}
สถานะ Timer: ${JSON.stringify(memory.timers)}
สถานะ Counter: ${JSON.stringify(memory.counters)}
${unassignedNote}

ให้คำแนะนำสั้นๆ เพียง 1 ข้อ (ไม่เกิน 3 ประโยค) แบบโค้ชชิ่ง ชี้ให้นักเรียนสังเกตและคิดเอง
ห้ามเฉลยคำตอบหรือบอกวิธีแก้ตรงๆ ให้ถามคำถามหรือชี้จุดสังเกตแทน ตอบเป็นภาษาไทย`;

    const hint = await generateGeminiText(prompt);

    let hintCreditsRemaining: number | null = null;
    if (isEconomySubject) {
      hintCreditsRemaining = profile.hint_credits - 1;
      try {
        const admin = createAdminClient();
        const { error } = await admin
          .from("users")
          .update({ hint_credits: hintCreditsRemaining })
          .eq("id", profile.id);
        if (error) console.error("getHintAction: failed to deduct hint credit", error);
      } catch (err) {
        console.error("getHintAction: hint credit deduction crashed", err);
      }
    }

    return { hint, hintCreditsRemaining };
  } catch (err) {
    console.error("getHintAction failed:", err);
    if (err instanceof GeminiConfigError) {
      return { error: "AI hints are not configured on this server yet." };
    }
    if (err instanceof GeminiRequestError) {
      return { error: "Could not reach the AI service. Please try again." };
    }
    return { error: "Something went wrong getting a hint." };
  }
}
