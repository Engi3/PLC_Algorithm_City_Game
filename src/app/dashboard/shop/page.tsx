import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { computeLiveEnergy } from "@/lib/economy/energy";
import ShopClient from "./ShopClient";

export default async function ShopPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "teacher") redirect("/dashboard");

  const liveEnergy = computeLiveEnergy(profile.energy, profile.energy_updated_at);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">ร้านค้า (Shop)</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          ใช้เหรียญที่ได้จากการผ่านด่านมาซื้อไอเทมช่วยเหลือ
        </p>
      </div>
      <ShopClient
        initialCoins={profile.coins}
        initialEnergy={liveEnergy}
        initialHintCredits={profile.hint_credits}
        initialSkipTokens={profile.skip_tokens}
      />
    </div>
  );
}
