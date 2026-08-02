import Link from "next/link";

export type NavTarget =
  | { kind: "link"; href: string }
  | { kind: "locked"; title: string }
  | { kind: "none" };

/** Shared prev/next nav row - used on both the Level Play page and the Challenge Play page, top and bottom of each, so students don't have to scroll back up to move on. Blue for previous, emerald for next (clearly visible per request), gray+disabled when there's nothing to go to or the next item is locked. */
export default function PrevNextNav({
  prev,
  next,
  prevLabel,
  nextLabel,
}: {
  prev: NavTarget;
  next: NavTarget;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {prev.kind === "link" ? (
        <Link
          href={prev.href}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {prevLabel}
        </Link>
      ) : (
        <span
          title={prev.kind === "locked" ? prev.title : undefined}
          className="cursor-not-allowed rounded-md bg-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
        >
          {prevLabel}
        </span>
      )}
      {next.kind === "link" ? (
        <Link
          href={next.href}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          {nextLabel}
        </Link>
      ) : (
        <span
          title={next.kind === "locked" ? next.title : undefined}
          className="cursor-not-allowed rounded-md bg-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
        >
          {next.kind === "locked" ? `🔒 ${nextLabel}` : nextLabel}
        </span>
      )}
    </div>
  );
}
