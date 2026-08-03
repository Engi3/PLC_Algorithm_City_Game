import { createClient } from "@/lib/supabase/server";

export type UserRole = "student" | "teacher" | "guest";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ModeOverride = "locked" | "unlocked" | null;

export type Profile = {
  id: string;
  username: string;
  role: UserRole;
  student_id: string | null;
  first_name: string | null;
  last_name: string | null;
  is_guest: boolean;
  coins: number;
  energy: number;
  energy_updated_at: string;
  hint_credits: number;
  skip_tokens: number;
  approval_status: ApprovalStatus;
  game_mode_override: ModeOverride;
  challenge_mode_override: ModeOverride;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, username, role, student_id, first_name, last_name, is_guest, coins, energy, energy_updated_at, hint_credits, skip_tokens, approval_status"
      )
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("getCurrentProfile: failed to load profile row", error);
      return null;
    }

    // Queried separately: until migration 0013 runs, these columns don't
    // exist yet - a PostgREST select() is all-or-nothing, so folding them
    // into the query above would break EVERY page (getCurrentProfile runs
    // on every authenticated load) instead of just degrading the two
    // features that actually need them. Same split already used for the
    // Phase 12 competency columns (see load-class-data.ts).
    let gameModeOverride: ModeOverride = null;
    let challengeModeOverride: ModeOverride = null;
    const { data: overrides, error: overridesError } = await supabase
      .from("users")
      .select("game_mode_override, challenge_mode_override")
      .eq("id", user.id)
      .single();
    if (overridesError) {
      console.error("getCurrentProfile: failed to load mode overrides", overridesError);
    } else if (overrides) {
      gameModeOverride = overrides.game_mode_override;
      challengeModeOverride = overrides.challenge_mode_override;
    }

    return { ...data, game_mode_override: gameModeOverride, challenge_mode_override: challengeModeOverride } as Profile;
  } catch (err) {
    // Next.js throws this internally when `cookies()` is called during
    // static-generation analysis, to bail the route into dynamic rendering.
    // It must propagate, not be swallowed as an application error.
    if (
      err instanceof Error &&
      "digest" in err &&
      typeof err.digest === "string" &&
      err.digest.startsWith("DYNAMIC_SERVER_USAGE")
    ) {
      throw err;
    }
    console.error("getCurrentProfile crashed:", err);
    return null;
  }
}
