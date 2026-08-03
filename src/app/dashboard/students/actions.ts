"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/auth/username";
import { verifyOwnPassword } from "@/lib/auth/verify-password";
import { getCurrentProfile, type Profile } from "@/lib/auth/get-profile";

async function requireTeacher(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "teacher") {
    throw new Error("Forbidden: teacher role required.");
  }
  return profile;
}

export type ActionState = { error: string | null; success?: string | null };

export async function setApprovalStatusAction(formData: FormData): Promise<void> {
  const userId = formData.get("userId")?.toString() ?? "";
  const status = formData.get("status")?.toString();
  if (!userId || (status !== "approved" && status !== "rejected")) return;

  try {
    await requireTeacher();
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ approval_status: status })
      .eq("id", userId);
    if (error) console.error("setApprovalStatusAction: update failed", error);
  } catch (err) {
    console.error("setApprovalStatusAction crashed:", err);
  }

  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard");
}

export async function deleteUserAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = formData.get("userId")?.toString() ?? "";
  const password = formData.get("confirmPassword")?.toString() ?? "";
  if (!userId || !password) return { error: "Enter your password to confirm." };

  try {
    const teacher = await requireTeacher();
    if (teacher.id === userId) {
      return { error: "You cannot delete your own account." };
    }

    const verify = await verifyOwnPassword(password);
    if (!verify.ok) return { error: verify.error };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("deleteUserAction: deleteUser failed", error);
      return { error: "Could not delete user." };
    }
  } catch (err) {
    console.error("deleteUserAction crashed:", err);
    return { error: "Something went wrong." };
  }

  revalidatePath("/dashboard/students");
  return { error: null, success: "User deleted." };
}

const OVERRIDE_MODES = ["game_mode_override", "challenge_mode_override"] as const;
type OverrideMode = (typeof OVERRIDE_MODES)[number];
const OVERRIDE_VALUES = ["auto", "unlocked", "locked"] as const;

/**
 * Special-case per-student unlock/lock for Game Mode or Challenge Mode
 * (resolveModeUnlock in challenge-unlock.ts reads this). "auto" clears
 * the override so the normal 50%-per-category gate applies again.
 */
export async function setModeOverrideAction(formData: FormData): Promise<void> {
  const userId = formData.get("userId")?.toString() ?? "";
  const mode = formData.get("mode")?.toString();
  const value = formData.get("value")?.toString();
  if (!userId) return;
  if (mode !== "game_mode_override" && mode !== "challenge_mode_override") return;
  if (!value || !(OVERRIDE_VALUES as readonly string[]).includes(value)) return;

  try {
    await requireTeacher();
    const supabase = await createClient();
    const column: OverrideMode = mode;
    const { error } = await supabase
      .from("users")
      .update({ [column]: value === "auto" ? null : value })
      .eq("id", userId);
    if (error) console.error("setModeOverrideAction: update failed", error);
  } catch (err) {
    console.error("setModeOverrideAction crashed:", err);
  }

  revalidatePath("/dashboard/students");
}

/** Free-text class/section label a teacher assigns per student - powers the Global Leaderboard's "sort by class" filter. Empty string clears it back to null (unassigned). */
export async function setClassNameAction(formData: FormData): Promise<void> {
  const userId = formData.get("userId")?.toString() ?? "";
  const className = formData.get("className")?.toString().trim() ?? "";
  if (!userId) return;

  try {
    await requireTeacher();
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ class_name: className || null })
      .eq("id", userId);
    if (error) console.error("setClassNameAction: update failed (migration 0016 may not be run yet)", error);
  } catch (err) {
    console.error("setClassNameAction crashed:", err);
  }

  revalidatePath("/dashboard/students");
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export async function addUserAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const role = formData.get("role")?.toString() ?? "";
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const firstName = formData.get("firstName")?.toString().trim() ?? "";
  const lastName = formData.get("lastName")?.toString().trim() ?? "";
  const studentId = formData.get("studentId")?.toString().trim() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  if (role !== "student" && role !== "teacher") return { error: "Invalid role." };
  if (!username || !password || !firstName || !lastName) {
    return { error: "Please fill in every field." };
  }
  if (role === "student" && !studentId) {
    return { error: "Student ID is required for students." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      error: "Username must be 3-20 characters: letters, numbers, or underscore only.",
    };
  }
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (!confirmPassword) return { error: "Enter your own password to confirm this action." };

  try {
    await requireTeacher();
    const verify = await verifyOwnPassword(confirmPassword);
    if (!verify.ok) return { error: verify.error };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password,
      email_confirm: true,
      user_metadata: {
        username,
        role,
        is_guest: false,
        first_name: firstName,
        last_name: lastName,
        student_id: role === "student" ? studentId : null,
        approval_status: "approved",
      },
    });

    if (error) {
      console.error("addUserAction: createUser failed", error);
      if (
        error.code === "email_exists" ||
        error.message.toLowerCase().includes("already been registered")
      ) {
        return { error: "That username is already taken." };
      }
      return { error: "Could not create the account." };
    }
  } catch (err) {
    console.error("addUserAction crashed:", err);
    return { error: "Something went wrong." };
  }

  revalidatePath("/dashboard/students");
  return { error: null, success: `Account "${username}" created.` };
}
