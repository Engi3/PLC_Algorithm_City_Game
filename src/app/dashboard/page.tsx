import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const name = profile?.first_name || profile?.username;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Welcome, {name}
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {profile?.role === "teacher"
            ? "Teacher dashboard - level and student management arrive in later phases."
            : profile?.is_guest
              ? "You're in guest trial mode - progress isn't saved to a permanent profile."
              : "Ready to practice PLC ladder logic."}
        </p>
      </div>

      {profile && profile.role !== "teacher" && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Coins" value={profile.coins} />
            <StatCard label="Energy" value={profile.energy} />
          </div>
          <Link
            href="/dashboard/play"
            className="w-fit rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Open the ladder logic sandbox
          </Link>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
