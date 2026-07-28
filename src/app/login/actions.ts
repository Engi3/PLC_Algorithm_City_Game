"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/auth/username";

export type LoginState = { error: string | null };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!username || !password) {
    return { error: "Please enter your username and password." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    if (error) {
      console.error("loginAction: sign in failed", error);
      return { error: "Invalid username or password." };
    }
  } catch (err) {
    console.error("loginAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/dashboard");
}
