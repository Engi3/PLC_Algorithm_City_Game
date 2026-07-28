import { programToStructuredText } from "@/lib/ladder/render-st";
import type { LadderProgram } from "@/lib/ladder/types";

export default function StView({ program }: { program: LadderProgram }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Read-only, approximate IEC 61131-3 Structured Text generated from the
        ladder program above.
      </p>
      <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        {programToStructuredText(program)}
      </pre>
    </div>
  );
}
