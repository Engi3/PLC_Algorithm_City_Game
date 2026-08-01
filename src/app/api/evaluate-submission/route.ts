import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { evaluateGridLevel, countGridBlocks } from "@/lib/ladder/level-eval";
import { isLevelSpec } from "@/lib/ladder/level-spec";
import { compileGridProgram, compiledProgramToStructuredText } from "@/lib/ladder/iec-compiler";
import { generateGeminiJSON, GeminiConfigError, GeminiRequestError } from "@/lib/ai/gemini";
import type { GridProgram } from "@/lib/ladder/grid-types";

type AiReviewScores = { correctness: number; conciseness: number; safety: number; approach: number; feedback: string };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    correctness: { type: "INTEGER" },
    conciseness: { type: "INTEGER" },
    safety: { type: "INTEGER" },
    approach: { type: "INTEGER" },
    feedback: { type: "STRING" },
  },
  required: ["correctness", "conciseness", "safety", "approach", "feedback"],
};

function clamp0to100(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Phase 13 AI code reviewer. Deliberately independent of submitLevelAction's
 * energy/coins/play_logs bookkeeping - the frontend calls this only after
 * its own local test-case check passes (Rule 1: reject early, save tokens),
 * and this route re-verifies that pass server-side before ever calling
 * Gemini, since it can award bonus coins. A Gemini outage never blocks or
 * penalizes the student (Rule 2): the base submission already succeeded via
 * the deterministic test-case gate before this endpoint is even called.
 */
export async function POST(request: Request) {
  let body: { levelId?: string; program?: GridProgram };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { levelId, program } = body;
  if (!levelId || !program) {
    return NextResponse.json({ error: "Missing levelId or program." }, { status: 400 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: level, error: levelError } = await supabase
    .from("levels")
    .select("id, optimal_blocks_count, map_layout_json")
    .eq("id", levelId)
    .single();

  if (levelError || !level || !isLevelSpec(level.map_layout_json)) {
    return NextResponse.json({ error: "Level not found or misconfigured." }, { status: 404 });
  }

  const evalResult = evaluateGridLevel(program, level.map_layout_json);
  if (!evalResult.passed) {
    return NextResponse.json(
      { error: "โปรแกรมยังไม่ผ่านชุดทดสอบของด่านนี้ กรุณาส่งคำตอบที่ถูกต้องก่อนขอรีวิวจาก AI" },
      { status: 400 }
    );
  }

  const blocksUsed = countGridBlocks(program);
  const structuredText = compiledProgramToStructuredText(compileGridProgram(program.grids));

  const prompt = `คุณเป็นวิศวกรอาวุโสที่ตรวจสอบโค้ด PLC Ladder Logic ของนักศึกษา

โจทย์: ${level.map_layout_json.description}

โปรแกรมของนักเรียน (Structured Text โดยประมาณ):
${structuredText}

จำนวนบล็อกที่ใช้: ${blocksUsed}${level.optimal_blocks_count ? ` (ค่าที่เหมาะสมที่สุดคือ ${level.optimal_blocks_count} บล็อก)` : ""}

โปรแกรมนี้ผ่านชุดทดสอบทั้งหมดแล้ว (ทำงานถูกต้องตามข้อกำหนด) กรุณาประเมิน 4 ด้านนี้เป็นคะแนน 0-100:
- correctness: ความถูกต้องเชิงตรรกะและความสมเหตุสมผลของวิธีแก้ปัญหา
- conciseness: ความกระชับ ใช้จำนวนรังคำสั่ง (rung) และบล็อกคำสั่งอย่างมีประสิทธิภาพ เทียบกับจำนวนบล็อกที่เหมาะสมที่สุด
- safety: การมี interlock ด้านความปลอดภัย การรีเซ็ตที่เหมาะสม หรือโครงสร้างที่อ่านง่าย
- approach: แนวทางและตรรกะการคิดแก้ปัญหาของนักเรียน (ไม่ใช่แค่ว่าผ่านหรือไม่ - ประเมินว่าวิธีคิดมีประสิทธิภาพหรืออ้อมค้อม ใช้เทคนิคที่ชาญฉลาด เช่น self-hold, interlock, การแบ่งแขนงที่เหมาะสม หรือมีรูปแบบที่ไม่ดี (antipattern) เช่น การต่อวนซ้ำซ้อนโดยไม่จำเป็น)

และ feedback: คำแนะนำเชิงสร้างสรรค์เป็นภาษาไทย อธิบายว่าโค้ดนี้ดีอย่างไรหรือควรปรับปรุงอย่างไรให้ดีขึ้น รวมถึงความเห็นต่อแนวทางการแก้ปัญหาของนักเรียน (2-4 ประโยค)`;

  let review: AiReviewScores;
  try {
    review = await generateGeminiJSON<AiReviewScores>(prompt, RESPONSE_SCHEMA);
  } catch (err) {
    console.error("evaluate-submission: Gemini call failed", err);
    const message =
      err instanceof GeminiConfigError
        ? "การประเมิน AI ยังไม่ได้ตั้งค่าไว้บนเซิร์ฟเวอร์นี้"
        : err instanceof GeminiRequestError
          ? "ไม่สามารถเชื่อมต่อบริการ AI ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง"
          : "เกิดข้อผิดพลาดในการประเมิน AI";
    return NextResponse.json({ available: false, message });
  }

  const correctness = clamp0to100(review.correctness);
  const conciseness = clamp0to100(review.conciseness);
  const safety = clamp0to100(review.safety);
  const approach = clamp0to100(review.approach);
  const feedback =
    typeof review.feedback === "string" && review.feedback.trim()
      ? review.feedback.trim()
      : "AI ไม่ได้ให้ความคิดเห็นเพิ่มเติม";

  // Teachers preview AI review quality while testing a level; their runs
  // must never award coins or land in ai_evaluations (same rule Phase 10-12
  // already apply to student_scores/game_logic_score for teacher test-plays).
  const isEconomySubject = profile.role !== "teacher";
  const coinsAwarded = isEconomySubject
    ? Math.max(0, Math.round((correctness + conciseness + safety) / 3 / 10))
    : 0;

  if (isEconomySubject) {
    try {
      const admin = createAdminClient();
      const { error: insertError } = await admin.from("ai_evaluations").insert({
        user_id: profile.id,
        level_id: levelId,
        correctness,
        conciseness,
        safety,
        approach,
        feedback,
        coins_awarded: coinsAwarded,
      });
      if (insertError) console.error("evaluate-submission: failed to insert ai_evaluations row", insertError);

      if (coinsAwarded > 0) {
        const { error: coinsError } = await admin
          .from("users")
          .update({ coins: profile.coins + coinsAwarded })
          .eq("id", profile.id);
        if (coinsError) console.error("evaluate-submission: failed to award bonus coins", coinsError);
      }
    } catch (err) {
      console.error("evaluate-submission: persistence crashed", err);
    }
  }

  return NextResponse.json({
    available: true,
    correctness,
    conciseness,
    safety,
    approach,
    feedback,
    coinsAwarded,
  });
}
