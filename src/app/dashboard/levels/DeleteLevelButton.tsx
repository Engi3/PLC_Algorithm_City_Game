"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLevelAction } from "./actions";

export default function DeleteLevelButton({ levelId, title }: { levelId: string; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      `Delete "${title}"? This also deletes every student's attempt history for this level. This cannot be undone.`
    );
    if (!confirmed) return;

    setPending(true);
    try {
      const result = await deleteLevelAction(levelId);
      if (result.error) {
        window.alert(result.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("DeleteLevelButton failed:", err);
      window.alert("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400"
    >
      {pending ? "..." : "Delete"}
    </button>
  );
}
