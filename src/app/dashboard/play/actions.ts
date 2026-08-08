"use server";

import { generateGeminiText, GeminiConfigError } from "@/lib/ai/gemini";
import { checkAiRateLimit, rateLimitMessage } from "@/lib/ai/rate-limit";
import { compileGridProgram, compiledProgramToStructuredText } from "@/lib/ladder/iec-compiler";
import type { GridProgram } from "@/lib/ladder/grid-types";
import type { Inputs, SimMemory } from "@/lib/ladder/types";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type HintResult =
  | { hint: string; hintCreditsRemaining: number | null; source: "ai" | "fallback"; error?: undefined }
  | { error: string; hint?: undefined };

/** Deterministic, non-AI hint - never leaves a student stuck with just an error when Gemini is unavailable. Generic on purpose (no per-level reference to draw from here), but still points at concrete next steps. */
function fallbackHint(program: GridProgram): string {
  if (hasUnassignedGridAddress(program)) {
    return "สังเกตว่ามีบางบล็อกที่ยังไม่ได้กำหนดแอดเดรส (ขึ้น \"?\") ลองกำหนดแอดเดรสให้ครบทุกบล็อกก่อน แล้วกด Step ทีละรอบเพื่อดูว่าค่าที่ได้ตรงกับที่คาดไว้หรือไม่";
  }
  return "ลองกด Step ทีละรอบสแกนแทน Run เพื่อดูว่าคอยล์แต่ละตัวติด/ดับตรงจังหวะที่คาดไว้หรือไม่ แล้วไล่ดูว่ารังไหนที่ผลลัพธ์ไม่ตรงกับโจทย์";
}

/** Grid-native counterpart of the legacy hasUnassignedAddress - true if any placed node (contact/comparison/coil) still has a "?" (null) address. */
function hasUnassignedGridAddress(program: GridProgram): boolean {
  for (const grid of program.grids) {
    for (const row of grid.cells) {
      for (const cell of row) {
        const node = cell.node;
        if (!node) continue;
        if (node.kind === "COMPARE" ? !node.sourceA : !node.address) return true;
      }
    }
  }
  return false;
}

export async function getHintAction(
  program: GridProgram,
  inputs: Inputs,
  memory: SimMemory
): Promise<HintResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };

  // Teachers get unlimited hints (previewing/testing content); everyone
  // else spends a hint_credit, purchasable in the shop once exhausted.
  const isEconomySubject = profile.role !== "teacher";
  if (isEconomySubject && profile.hint_credits <= 0) {
    return { error: "คุณใช้คำใบ้ครบแล้ว กรุณาซื้อ Hint Unlocker จากร้านค้า" };
  }

  const rateLimit = checkAiRateLimit("hint", profile.id);
  if (!rateLimit.allowed) return { error: rateLimitMessage(rateLimit.retryAfterSeconds) };

  try {
    const st = compiledProgramToStructuredText(compileGridProgram(program.grids));
    const unassignedNote = hasUnassignedGridAddress(program)
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

    let hint: string;
    try {
      hint = await generateGeminiText(prompt);
    } catch (err) {
      console.error("getHintAction: Gemini call failed, using local fallback", err);
      if (err instanceof GeminiConfigError) {
        return { error: "AI hints are not configured on this server yet." };
      }
      // A Gemini outage never costs the student a hint credit - fall back to
      // a generic-but-useful local hint instead of a dead end.
      return { hint: fallbackHint(program), hintCreditsRemaining: isEconomySubject ? profile.hint_credits : null, source: "fallback" };
    }

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

    return { hint, hintCreditsRemaining, source: "ai" };
  } catch (err) {
    console.error("getHintAction crashed:", err);
    return { error: "Something went wrong getting a hint." };
  }
}
