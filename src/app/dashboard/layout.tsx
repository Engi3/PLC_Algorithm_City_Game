import { redirect } from "next/navigation";
import { getCurrentProfile, type ApprovalStatus } from "@/lib/auth/get-profile";
import AppShell from "@/components/layout/AppShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const needsApproval = profile.role === "student" && profile.approval_status !== "approved";

  return (
    <AppShell profile={profile}>
      {needsApproval ? <ApprovalStatusScreen status={profile.approval_status} /> : children}
    </AppShell>
  );
}

function ApprovalStatusScreen({ status }: { status: ApprovalStatus }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
      {status !== "rejected" ? (
        <>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Registration pending review
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            A teacher needs to review your details before you can start
            playing. Check back soon.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Registration not approved
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Your registration wasn&apos;t approved. Contact your teacher for
            details.
          </p>
        </>
      )}
    </div>
  );
}
