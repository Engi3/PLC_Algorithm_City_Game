"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ApprovalStatus, UserRole } from "@/lib/auth/get-profile";
import { addUserAction, deleteUserAction, setApprovalStatusAction, type ActionState } from "./actions";

export type ManagedUser = {
  id: string;
  username: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  student_id: string | null;
  approval_status: ApprovalStatus;
};

const initialState: ActionState = { error: null };

const STATUS_STYLE: Record<ApprovalStatus, string> = {
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
};

function ApproveRejectButtons({ userId }: { userId: string }) {
  return (
    <div className="flex gap-1">
      <form action={setApprovalStatusAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value="approved" />
        <button
          type="submit"
          className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          Approve
        </button>
      </form>
      <form action={setApprovalStatusAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value="rejected" />
        <button
          type="submit"
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Reject
        </button>
      </form>
    </div>
  );
}

function DeleteButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteUserAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-zinc-700 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-1">
        <input
          type="password"
          name="confirmPassword"
          placeholder="Your password"
          required
          className="w-32 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <DeleteConfirmButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

function DeleteConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "..." : "Confirm"}
    </button>
  );
}

function AddUserForm() {
  const [state, formAction] = useActionState(addUserAction, initialState);
  const [role, setRole] = useState<"student" | "teacher">("student");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add a user</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Role
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as "student" | "teacher")}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Username
          <input
            name="username"
            required
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Password
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          First name
          <input
            name="firstName"
            required
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Last name
          <input
            name="lastName"
            required
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {role === "student" && (
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            Student ID
            <input
              name="studentId"
              required
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        Your password (to confirm this action)
        <input
          type="password"
          name="confirmPassword"
          required
          className="w-full max-w-xs rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600 dark:text-green-400">{state.success}</p>}

      <AddUserSubmitButton />
    </form>
  );
}

function AddUserSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Creating..." : "Create account"}
    </button>
  );
}

export default function UsersAdmin({
  users,
  currentTeacherId,
}: {
  users: ManagedUser[];
  currentTeacherId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Student ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">
                  {u.first_name} {u.last_name}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {u.username}
                </td>
                <td className="px-3 py-2 capitalize text-zinc-600 dark:text-zinc-400">{u.role}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{u.student_id ?? "-"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[u.approval_status]}`}
                  >
                    {u.approval_status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {u.approval_status === "pending" && <ApproveRejectButtons userId={u.id} />}
                    {u.id !== currentTeacherId && <DeleteButton userId={u.id} />}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                  No student or teacher accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddUserForm />
    </div>
  );
}
