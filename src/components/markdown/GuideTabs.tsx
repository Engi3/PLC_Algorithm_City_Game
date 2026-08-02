"use client";

import { useState } from "react";
import MarkdownContent from "./MarkdownContent";

/** Teacher-only: switches between the same player guide students see and the teacher-specific menu-by-menu guide, so a teacher doesn't need two separate pages. */
export default function GuideTabs({ playerGuide, teacherGuide }: { playerGuide: string; teacherGuide: string }) {
  const [tab, setTab] = useState<"teacher" | "player">("teacher");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["teacher", "player"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t
                ? "border border-b-0 border-zinc-200 bg-white text-blue-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-blue-400"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t === "teacher" ? "คู่มืออาจารย์" : "คู่มือผู้เล่น (มุมมองนักศึกษา)"}
          </button>
        ))}
      </div>
      <MarkdownContent content={tab === "teacher" ? teacherGuide : playerGuide} />
    </div>
  );
}
