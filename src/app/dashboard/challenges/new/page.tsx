import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import ChallengeAuthoringEditor from "@/components/ladder/ChallengeAuthoringEditor";

export default async function NewChallengePage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "teacher") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Create Challenge</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          หมายเลขโจทย์ (Challenge ID) จะนับต่อจากโจทย์ Challenge Mode ที่มีอยู่โดยอัตโนมัติ
        </p>
      </div>
      <ChallengeAuthoringEditor />
    </div>
  );
}
