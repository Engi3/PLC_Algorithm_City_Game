import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Re-checks the signed-in user's own password without disturbing their
 * session (signInWithPassword against their own email just re-issues the
 * same session). Used to gate destructive admin actions behind a
 * confirmation step, instead of a separately-stored shared secret.
 */
export async function verifyOwnPassword(
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) return { ok: false, error: "Incorrect password." };
  return { ok: true };
}
