import { compileGridProgram, compiledProgramToStructuredText } from "@/lib/ladder/iec-compiler";
import type { LadderGrid } from "@/lib/ladder/grid-types";

/** UX/UI refinement Task 4: the Grid Editor's own ST view, compiled from the grid's real wire topology - see GridFbdView.tsx and iec-compiler.ts for why this can't reuse the shared StView/render-st.ts (that path reads the lossy flat gridToRung conversion). */
export default function GridStView({ grids }: { grids: LadderGrid[] }) {
  const compiled = compileGridProgram(grids);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Read-only, approximate IEC 61131-3 Structured Text compiled from the grid&apos;s actual wiring above.
      </p>
      <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        {compiledProgramToStructuredText(compiled)}
      </pre>
    </div>
  );
}
