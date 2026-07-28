"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/auth/username";

export type RegisterState = { error: string | null };

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";
  const firstName = formData.get("firstName")?.toString().trim() ?? "";
  const lastName = formData.get("lastName")?.toString().trim() ?? "";
  const studentId = formData.get("studentId")?.toString().trim() ?? "";

  if (!username || !password || !firstName || !lastName || !studentId) {
    return { error: "Please fill in every field." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        "Username must be 3-20 characters: letters, numbers, or underscore only.",
    };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password,
      email_confirm: true,
      user_metadata: {
        username,
        role: "student",
        is_guest: false,
        first_name: firstName,
        last_name: lastName,
        student_id: studentId,
        approval_status: "pending",
      },
    });

    if (error) {
      console.error("registerAction: createUser failed", error);
      if (
        error.code === "email_exists" ||
        error.message.toLowerCase().includes("already been registered")
      ) {
        return { error: "That username is already taken." };
      }
      return { error: "Could not create your account. Please try again." };
    }
  } catch (err) {
    console.error("registerAction crashed during createUser:", err);
    return { error: "Something went wrong. Please try again." };
  }

  let signedIn = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      console.error("registerAction: auto sign-in failed", error);
    } else {
      signedIn = true;
    }
  } catch (err) {
    console.error("registerAction crashed during signIn:", err);
  }

  redirect(signedIn ? "/dashboard" : "/login?registered=1");
}
