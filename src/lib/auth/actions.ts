"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.error("signOutAction: sign out failed", error);
  } catch (err) {
    console.error("signOutAction crashed:", err);
  }

  redirect("/login");
}
