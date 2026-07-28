import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export default async function LevelsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Levels
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Level authoring and the ladder logic builder arrive in Phase 3.
      </p>
    </div>
  );
}
