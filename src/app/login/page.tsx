import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard");

  const { registered } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <h1 className="mb-6 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          PLC Algorithm City
        </h1>
        {registered && (
          <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-center text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
            Account created! Please sign in.
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
