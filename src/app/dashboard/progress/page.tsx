import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export default async function ProgressPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "student") redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        My Progress
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Your radar chart and score history arrive in Phase 5.
      </p>
    </div>
  );
}
