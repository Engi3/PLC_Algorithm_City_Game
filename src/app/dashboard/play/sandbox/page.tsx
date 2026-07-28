import LadderPlayground from "@/components/ladder/LadderPlayground";

export default function SandboxPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Ladder Logic Sandbox
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Drag NO/NC contacts and outputs onto a rung, wire them up, then
          toggle inputs or press Step/Run to watch the logic execute. This is
          a free sandbox with no objective or scoring - for graded practice,
          try the levels.
        </p>
      </div>
      <LadderPlayground />
    </div>
  );
}
