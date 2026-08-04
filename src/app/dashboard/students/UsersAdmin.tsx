"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ApprovalStatus, UserRole } from "@/lib/auth/get-profile";
import {
  addUserAction,
  deleteUserAction,
  setApprovalStatusAction,
  setModeOverrideAction,
  setClassNameAction,
  updateUserProfileAction,
  resetUserPasswordAction,
  type ActionState,
} from "./actions";
import type { ModeOverride } from "@/lib/auth/get-profile";

export type ManagedUser = {
  id: string;
  username: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  student_id: string | null;
  approval_status: ApprovalStatus;
  gameModeOverride?: ModeOverride;
  challengeModeOverride?: ModeOverride;
  className?: string | null;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

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

/** Special-case per-student lock/unlock for Game Mode or Challenge Mode - "auto" clears the override so the normal 50%-per-category gate applies again. */
function ModeOverrideSelect({
  userId,
  mode,
  current,
}: {
  userId: string;
  mode: "game_mode_override" | "challenge_mode_override";
  current: ModeOverride;
}) {
  return (
    <form
      action={(formData) => {
        setModeOverrideAction(formData);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="mode" value={mode} />
      <select
        name="value"
        defaultValue={current ?? "auto"}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border px-1.5 py-1 text-xs dark:bg-zinc-900 ${
          current === "unlocked"
            ? "border-emerald-400 text-emerald-700 dark:text-emerald-400"
            : current === "locked"
              ? "border-red-400 text-red-700 dark:text-red-400"
              : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        }`}
      >
        <option value="auto">Auto</option>
        <option value="unlocked">Force unlock</option>
        <option value="locked">Force lock</option>
      </select>
    </form>
  );
}

/** Inline-editable Class column, saved on blur (or Enter) - mirrors ModeOverrideSelect's pattern of submitting on change rather than needing a separate save button. */
function ClassNameCell({ userId, current }: { userId: string; current: string | null }) {
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === (current ?? "")) return;
    setSaving(true);
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("className", value);
    try {
      await setClassNameAction(formData);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="-"
      disabled={saving}
      className="w-24 rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50"
    />
  );
}

function EditSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-zinc-700 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Edit any user's name/student ID, and reset their password to a new value - the teacher never sees the user's current password, only sets a new one (resetUserPasswordAction uses the admin client's updateUserById, which fully overwrites it). */
function EditUserButton({ user }: { user: ManagedUser }) {
  const [open, setOpen] = useState(false);
  const [profileState, profileFormAction] = useActionState(updateUserProfileAction, initialState);
  const [passwordState, passwordFormAction] = useActionState(resetUserPasswordAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="flex w-64 flex-col gap-2 rounded border border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
      <form action={profileFormAction} className="flex flex-col gap-1">
        <input type="hidden" name="userId" value={user.id} />
        <div className="flex flex-wrap gap-1">
          <input
            name="firstName"
            defaultValue={user.first_name ?? ""}
            placeholder="First name"
            required
            className="w-28 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            name="lastName"
            defaultValue={user.last_name ?? ""}
            placeholder="Last name"
            required
            className="w-28 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          {user.role === "student" && (
            <input
              name="studentId"
              defaultValue={user.student_id ?? ""}
              placeholder="Student ID"
              className="w-28 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
          <EditSubmitButton label="Save" pendingLabel="..." />
        </div>
        {profileState.error && <p className="text-xs text-red-600 dark:text-red-400">{profileState.error}</p>}
        {profileState.success && <p className="text-xs text-green-600 dark:text-green-400">{profileState.success}</p>}
      </form>

      <form
        action={passwordFormAction}
        className="flex flex-col gap-1 border-t border-zinc-300 pt-2 dark:border-zinc-700"
      >
        <input type="hidden" name="userId" value={user.id} />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Reset password (you can&apos;t view their current one)
        </p>
        <div className="flex flex-wrap gap-1">
          <input
            type="password"
            name="newPassword"
            placeholder="New password"
            required
            minLength={6}
            className="w-28 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="password"
            name="confirmNewPassword"
            placeholder="Confirm new"
            required
            minLength={6}
            className="w-28 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Your password"
            required
            className="w-28 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <EditSubmitButton label="Reset" pendingLabel="..." />
        </div>
        {passwordState.error && <p className="text-xs text-red-600 dark:text-red-400">{passwordState.error}</p>}
        {passwordState.success && <p className="text-xs text-green-600 dark:text-green-400">{passwordState.success}</p>}
      </form>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="w-fit rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
      >
        Close
      </button>
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

function PaginationBar({
  page,
  totalPages,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 dark:border-zinc-700"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <span>
        {rangeStart}-{rangeEnd} of {totalCount}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded border border-zinc-300 px-2 py-1 font-medium disabled:opacity-40 dark:border-zinc-700"
        >
          ← Previous
        </button>
        <span>
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded border border-zinc-300 px-2 py-1 font-medium disabled:opacity-40 dark:border-zinc-700"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default function UsersAdmin({
  users,
  currentTeacherId,
}: {
  users: ManagedUser[];
  currentTeacherId: string;
}) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase();
      const studentId = (u.student_id ?? "").toLowerCase();
      const username = u.username.toLowerCase();
      return name.includes(q) || studentId.includes(q) || username.includes(q);
    });
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search by name or Student ID..."
        className="w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Student ID</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Game Mode</th>
              <th className="px-3 py-2">Challenge Mode</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {pageUsers.map((u) => (
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
                  <ClassNameCell userId={u.id} current={u.className ?? null} />
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[u.approval_status]}`}
                  >
                    {u.approval_status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {u.role === "student" ? (
                    <ModeOverrideSelect userId={u.id} mode="game_mode_override" current={u.gameModeOverride ?? null} />
                  ) : (
                    <span className="text-xs text-zinc-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {u.role === "student" ? (
                    <ModeOverrideSelect userId={u.id} mode="challenge_mode_override" current={u.challengeModeOverride ?? null} />
                  ) : (
                    <span className="text-xs text-zinc-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-start gap-2">
                    {u.approval_status === "pending" && <ApproveRejectButtons userId={u.id} />}
                    <EditUserButton user={u} />
                    {u.id !== currentTeacherId && <DeleteButton userId={u.id} />}
                  </div>
                </td>
              </tr>
            ))}
            {pageUsers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-zinc-400">
                  {users.length === 0 ? "No student or teacher accounts yet." : "No users match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalCount={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />

      <AddUserForm />
    </div>
  );
}
