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
