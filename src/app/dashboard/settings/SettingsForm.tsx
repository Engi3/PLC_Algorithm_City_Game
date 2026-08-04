"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Profile } from "@/lib/auth/get-profile";
import { updateOwnProfileAction, changeOwnPasswordAction, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function SettingsForm({ profile }: { profile: Profile }) {
  const [profileState, profileFormAction] = useActionState(updateOwnProfileAction, initialState);
  const [passwordState, passwordFormAction] = useActionState(changeOwnPasswordAction, initialState);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form
        action={profileFormAction}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Personal info</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Username
            <input
              value={profile.username}
              disabled
              className="rounded border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Role
            <input
              value={profile.role}
              disabled
              className="rounded border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-sm capitalize text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            First name
            <input
              name="firstName"
              defaultValue={profile.first_name ?? ""}
              required
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Last name
            <input
              name="lastName"
              defaultValue={profile.last_name ?? ""}
              required
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {profile.role === "student" && (
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Student ID
              <input
                name="studentId"
                defaultValue={profile.student_id ?? ""}
                required
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          Need to change your username? Ask a teacher/admin on the Manage Users page.
        </p>
        {profileState.error && <p className="text-sm text-red-600 dark:text-red-400">{profileState.error}</p>}
        {profileState.success && <p className="text-sm text-green-600 dark:text-green-400">{profileState.success}</p>}
        <SubmitButton label="Save changes" pendingLabel="Saving..." />
      </form>

      <form
        action={passwordFormAction}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Change password</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Current password
            <input
              type="password"
              name="currentPassword"
              required
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            New password
            <input
              type="password"
              name="newPassword"
              required
              minLength={6}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Confirm new password
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={6}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
        {passwordState.error && <p className="text-sm text-red-600 dark:text-red-400">{passwordState.error}</p>}
        {passwordState.success && <p className="text-sm text-green-600 dark:text-green-400">{passwordState.success}</p>}
        <SubmitButton label="Change password" pendingLabel="Changing..." />
      </form>
    </div>
  );
}
