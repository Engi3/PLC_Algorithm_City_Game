"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import type { GridProgram } from "./grid-types";

export type DraftContextKind = "level" | "challenge" | "game";

/**
 * "Save my in-progress circuit, come back to it later" - one mutable slot
 * per (user, context_kind, context_id), not an attempt log. Shared across
 * Levels/Challenge Mode/Game Mode rather than three separate tables, since
 * the shape (a GridProgram + who + which context) never varies. RLS on
 * ladder_drafts already restricts every row to its own user_id, so a plain
 * authenticated client is enough - no service-role client needed.
 */
export async function saveDraftAction(
  contextKind: DraftContextKind,
  contextId: string,
  program: GridProgram
): Promise<{ ok: true } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  if (!contextId) return { error: "Missing context." };

  const supabase = await createClient();
  const { error } = await supabase.from("ladder_drafts").upsert(
    {
      user_id: profile.id,
      context_kind: contextKind,
      context_id: contextId,
      program_json: program,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,context_kind,context_id" }
  );
  if (error) {
    console.error("saveDraftAction: upsert failed", error);
    return { error: "บันทึกวงจรไม่สำเร็จ กรุณาลองใหม่ภายหลัง" };
  }
  return { ok: true };
}

export async function loadDraftAction(
  contextKind: DraftContextKind,
  contextId: string
): Promise<{ program: GridProgram | null } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not signed in." };
  if (!contextId) return { error: "Missing context." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ladder_drafts")
    .select("program_json")
    .eq("user_id", profile.id)
    .eq("context_kind", contextKind)
    .eq("context_id", contextId)
    .maybeSingle();
  if (error) {
    console.error("loadDraftAction: query failed", error);
    return { error: "โหลดวงจรที่บันทึกไว้ไม่สำเร็จ" };
  }
  return { program: (data?.program_json as GridProgram | undefined) ?? null };
}
