"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export type ActionState = { error: string | null };

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
