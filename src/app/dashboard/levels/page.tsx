import Link from "next/link";
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
        Level authoring (assigning missions to the ladder logic builder)
        arrives in a later phase. You can try the builder itself in the{" "}
        <Link href="/dashboard/play" className="text-blue-600 hover:underline dark:text-blue-400">
          ladder sandbox
        </Link>
        .
      </p>
    </div>
  );
}
