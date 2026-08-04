import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.is_guest) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Account</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Update your personal info, or change your own password.
        </p>
      </div>
      <SettingsForm profile={profile} />
    </div>
  );
}
