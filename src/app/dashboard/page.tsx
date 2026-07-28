import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { computeLiveEnergy } from "@/lib/economy/energy";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const name = profile?.first_name || profile?.username;
  const liveEnergy = profile ? computeLiveEnergy(profile.energy, profile.energy_updated_at) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          ยินดีต้อนรับ, {name}
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {profile?.role === "teacher"
            ? "Teacher dashboard - level and student management arrive in later phases."
            : profile?.is_guest
              ? "You're in guest trial mode - progress isn't saved to a permanent profile."
              : "พร้อมสำหรับการฝึกเขียนโปรแกรม PLC Ladder Logic หรือยัง?"}
        </p>
      </div>

      {profile && profile.role !== "teacher" && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Coins" value={profile.coins} />
            <StatCard label="Energy" value={liveEnergy} />
            <StatCard label="Hints" value={profile.hint_credits} />
            <StatCard label="Skip Tokens" value={profile.skip_tokens} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/play"
              className="w-fit rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Browse levels
            </Link>
            <Link
              href="/dashboard/shop"
              className="w-fit rounded-full border border-zinc-300 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Visit shop
            </Link>
          </div>
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
