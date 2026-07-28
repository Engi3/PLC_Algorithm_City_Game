"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = { error: null };

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating account..." : "Create account"}
    </button>
  );
}

export default function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="firstName" className={labelClass}>
            First name
          </label>
          <input id="firstName" name="firstName" type="text" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lastName" className={labelClass}>
            Last name
          </label>
          <input id="lastName" name="lastName" type="text" required className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="studentId" className={labelClass}>
          Student ID
        </label>
        <input id="studentId" name="studentId" type="text" required className={inputClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className={inputClass}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Sign in
        </Link>
      </p>
    </form>
  );
}
