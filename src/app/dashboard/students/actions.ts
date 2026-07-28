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
