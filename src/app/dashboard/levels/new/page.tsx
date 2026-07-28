import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import LevelAuthoringEditor from "@/components/ladder/LevelAuthoringEditor";

export default async function NewLevelPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Create Level</h1>
      <LevelAuthoringEditor />
    </div>
  );
}
