"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        No account?{" "}
        <Link href="/register" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Register as a student
        </Link>
      </p>
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        Trying it out? Use guest00-guest99 with the same password (e.g. guest00 / guest00).
      </p>
    </form>
  );
}
