"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import type { LevelSpec } from "@/lib/ladder/level-spec";

async function requireTeacher() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher") {
    throw new Error("Forbidden: teacher role required.");
  }
  return profile;
}

export type SaveLevelInput = {
  /** Present = update an existing level; absent = create a new one. */
  levelId?: string;
  levelNumber: number;
  title: string;
  optimalBlocksCount: number | null;
  spec: LevelSpec;
};

export type SaveLevelResult = { error: string | null; levelId?: string };

export async function saveLevelAction(input: SaveLevelInput): Promise<SaveLevelResult> {
  if (!input.title.trim()) return { error: "Title is required." };
  if (!Number.isInteger(input.levelNumber) || input.levelNumber < 1) {
    return { error: "Level number must be a positive whole number." };
  }
  if (!input.spec.description.trim()) return { error: "Description is required." };
  if (input.spec.testCases.length === 0) {
    return { error: "Add at least one test case before saving." };
  }

  try {
    await requireTeacher();
    const supabase = await createClient();
    const row = {
      level_number: input.levelNumber,
      title: input.title.trim(),
      optimal_blocks_count: input.optimalBlocksCount,
      map_layout_json: input.spec,
    };

    if (input.levelId) {
      const { error } = await supabase.from("levels").update(row).eq("id", input.levelId);
      if (error) {
        console.error("saveLevelAction: update failed", error);
        if (error.code === "23505") return { error: "That level number is already used." };
        return { error: "Could not save the level." };
      }
      revalidatePath("/dashboard/levels");
      revalidatePath(`/dashboard/play/${input.levelId}`);
      return { error: null, levelId: input.levelId };
    }

    const { data, error } = await supabase.from("levels").insert(row).select("id").single();
    if (error) {
      console.error("saveLevelAction: insert failed", error);
      if (error.code === "23505") return { error: "That level number is already used." };
      return { error: "Could not create the level." };
    }
    revalidatePath("/dashboard/levels");
    return { error: null, levelId: data.id };
  } catch (err) {
    console.error("saveLevelAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function deleteLevelAction(levelId: string): Promise<{ error: string | null }> {
  try {
    await requireTeacher();
    const supabase = await createClient();
    const { error } = await supabase.from("levels").delete().eq("id", levelId);
    if (error) {
      console.error("deleteLevelAction: delete failed", error);
      return { error: "Could not delete the level." };
    }
  } catch (err) {
    console.error("deleteLevelAction crashed:", err);
    return { error: "Something went wrong." };
  }
  revalidatePath("/dashboard/levels");
  return { error: null };
}
