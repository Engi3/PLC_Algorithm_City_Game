import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export default async function Home() {
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-24 text-center dark:bg-black">
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        PLC Algorithm Practice
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Learn PLC ladder logic the fun way - drag, drop, and debug your way
        through the city.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Register as a student
        </Link>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Just trying it out? Sign in with guest00-guest99 (password = username).
      </p>
    </div>
  );
}
