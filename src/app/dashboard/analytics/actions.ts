"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export type ActionState = { error: string | null; success?: string };

export async function updatePracticalScoreAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = formData.get("userId")?.toString() ?? "";
  const raw = formData.get("score")?.toString() ?? "";
  const score = raw === "" ? null : Number(raw);

  if (!userId) return { error: "Missing user." };
  if (raw !== "" && (Number.isNaN(score) || score! < 0 || score! > 100)) {
    return { error: "Score must be between 0 and 100." };
  }

  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "teacher") {
      return { error: "Forbidden." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("student_scores")
      .upsert({ user_id: userId, onsite_practical_score: score }, { onConflict: "user_id" });

    if (error) {
      console.error("updatePracticalScoreAction: upsert failed", error);
      return { error: "Could not save the score." };
    }
  } catch (err) {
    console.error("updatePracticalScoreAction crashed:", err);
    return { error: "Something went wrong." };
  }

  revalidatePath("/dashboard/analytics");
  return { error: null };
}

const MAX_BONUS_COINS = 1000;

/**
 * Teacher-only manual coin grant, e.g. rewarding a student who helped a
 * classmate or did something noteworthy outside of level scoring. Uses the
 * normal RLS-checked client, not the admin client: the `coins` column is
 * protected against self-updates, but the update policy and the
 * protect_system_managed_columns trigger both explicitly allow a teacher
 * (via is_teacher(auth.uid())) to write it directly.
 */
export async function grantBonusCoinsAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = formData.get("userId")?.toString() ?? "";
  const amountRaw = formData.get("amount")?.toString() ?? "";
  const amount = Number(amountRaw);

  if (!userId) return { error: "Missing user." };
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_BONUS_COINS) {
    return { error: `จำนวนเหรียญต้องเป็นจำนวนเต็มระหว่าง 1-${MAX_BONUS_COINS}` };
  }

  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "teacher") {
      return { error: "Forbidden." };
    }

    const supabase = await createClient();
    const { data: student, error: fetchError } = await supabase
      .from("users")
      .select("coins, role")
      .eq("id", userId)
      .single();
    if (fetchError || !student) {
      console.error("grantBonusCoinsAction: failed to load student", fetchError);
      return { error: "ไม่พบนักเรียนคนนี้" };
    }
    if (student.role !== "student") {
      return { error: "สามารถมอบเหรียญพิเศษได้เฉพาะบัญชีนักเรียนเท่านั้น" };
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ coins: student.coins + amount })
      .eq("id", userId);
    if (updateError) {
      console.error("grantBonusCoinsAction: failed to grant coins", updateError);
      return { error: "ไม่สามารถมอบเหรียญได้ กรุณาลองใหม่" };
    }
  } catch (err) {
    console.error("grantBonusCoinsAction crashed:", err);
    return { error: "Something went wrong." };
  }

  revalidatePath("/dashboard/analytics");
  return { error: null, success: `มอบ ${amount} เหรียญเรียบร้อยแล้ว` };
}
