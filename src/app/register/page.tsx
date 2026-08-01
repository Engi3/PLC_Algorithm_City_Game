import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <h1 className="mb-1 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Student Registration
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          PLC Algorithm Practice
        </p>
        <RegisterForm />
      </div>
    </div>
  );
}
