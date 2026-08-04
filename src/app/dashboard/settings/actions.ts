"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyOwnPassword } from "@/lib/auth/verify-password";

export type ActionState = { error: string | null; success?: string | null };

export async function updateOwnProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const firstName = formData.get("firstName")?.toString().trim() ?? "";
  const lastName = formData.get("lastName")?.toString().trim() ?? "";
  const studentId = formData.get("studentId")?.toString().trim() ?? "";

  if (!firstName || !lastName) {
    return { error: "First name and last name are required." };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };

    const { data: row, error: rowError } = await supabase
      .from("users")
      .select("role, is_guest")
      .eq("id", user.id)
      .single();
    if (rowError || !row) return { error: "Could not load your profile." };
    if (row.is_guest) return { error: "Guest accounts cannot edit profile info." };

    const update: Record<string, string> = { first_name: firstName, last_name: lastName };
    if (row.role === "student") update.student_id = studentId;

    const { error } = await supabase.from("users").update(update).eq("id", user.id);
    if (error) {
      console.error("updateOwnProfileAction: update failed", error);
      return { error: "Could not save changes." };
    }
  } catch (err) {
    console.error("updateOwnProfileAction crashed:", err);
    return { error: "Something went wrong." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { error: null, success: "Profile updated." };
}

export async function changeOwnPasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const currentPassword = formData.get("currentPassword")?.toString() ?? "";
  const newPassword = formData.get("newPassword")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Please fill in every field." };
  }
  if (newPassword.length < 6) return { error: "New password must be at least 6 characters." };
  if (newPassword !== confirmPassword) return { error: "New passwords do not match." };

  try {
    const verify = await verifyOwnPassword(currentPassword);
    if (!verify.ok) return { error: verify.error };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error("changeOwnPasswordAction: updateUser failed", error);
      return { error: "Could not change password." };
    }
  } catch (err) {
    console.error("changeOwnPasswordAction crashed:", err);
    return { error: "Something went wrong." };
  }

  return { error: null, success: "Password changed." };
}
