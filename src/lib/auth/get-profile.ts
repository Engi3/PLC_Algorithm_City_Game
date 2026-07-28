import { createClient } from "@/lib/supabase/server";

export type UserRole = "student" | "teacher" | "guest";
export type ApprovalStatus = "pending" | "approved" | "rejected";

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
  approval_status: ApprovalStatus;
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
        "id, username, role, student_id, first_name, last_name, is_guest, coins, energy, approval_status"
      )
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("getCurrentProfile: failed to load profile row", error);
      return null;
    }

    return data as Profile;
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
