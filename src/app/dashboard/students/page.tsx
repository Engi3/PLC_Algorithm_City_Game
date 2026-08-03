import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import UsersAdmin, { type ManagedUser } from "./UsersAdmin";

export default async function StudentsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  let users: ManagedUser[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, username, role, first_name, last_name, student_id, approval_status"
      )
      .neq("role", "guest")
      .order("approval_status", { ascending: true })
      .order("username", { ascending: true });

    if (error) {
      console.error("StudentsPage: failed to load users", error);
    } else {
      users = data as ManagedUser[];
    }

    // Queried separately: until migration 0013 runs, these columns don't
    // exist yet - folding them into the query above would fail the WHOLE
    // query and wrongly hide every user, not just the override controls.
    // Same split already used for the Phase 12 competency columns.
    const { data: overrides, error: overridesError } = await supabase
      .from("users")
      .select("id, game_mode_override, challenge_mode_override")
      .neq("role", "guest");
    if (overridesError) {
      console.error("StudentsPage: failed to load mode overrides", overridesError);
    } else {
      const byId = new Map((overrides ?? []).map((o) => [o.id, o]));
      users = users.map((u) => ({
        ...u,
        gameModeOverride: byId.get(u.id)?.game_mode_override ?? null,
        challengeModeOverride: byId.get(u.id)?.challenge_mode_override ?? null,
      }));
    }

    // Queried separately: until migration 0016 runs, this column doesn't
    // exist yet - same degrade-gracefully split as the overrides above.
    const { data: classNames, error: classNameError } = await supabase
      .from("users")
      .select("id, class_name")
      .neq("role", "guest");
    if (classNameError) {
      console.error("StudentsPage: failed to load class_name (migration 0016 may not be run yet)", classNameError);
    } else {
      const byId = new Map((classNames ?? []).map((c) => [c.id, c.class_name as string | null]));
      users = users.map((u) => ({ ...u, className: byId.get(u.id) ?? null }));
    }
  } catch (err) {
    console.error("StudentsPage crashed loading users:", err);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Manage Users
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Approve or reject self-registered students, and add or remove
          accounts. Adding or deleting a user requires your own password to
          confirm.
        </p>
      </div>
      <UsersAdmin users={users} currentTeacherId={profile.id} />
    </div>
  );
}
