import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { chapterForGameLevel, gameLevelRowToSpec, type GameLevelRow } from "@/lib/games/game-level-types";
import GamePlayClient from "@/components/games/GamePlayClient";
import IoAddressTable from "@/components/games/IoAddressTable";
import { MAZE_IO_ROWS, FACTORY_IO_ROWS } from "@/lib/games/io-tables";
import PrevNextNav, { type NavTarget } from "@/components/ladder/PrevNextNav";

const GAME_TYPE_LABEL: Record<string, string> = { MAZE: "🤖 Maze", FACTORY: "🏭 Factory", HYBRID: "⚡ Hybrid" };

export default async function GameLevelPage({ params }: { params: Promise<{ gameSlug: string; levelId: string }> }) {
  const { gameSlug, levelId } = await params;
  const profile = await getCurrentProfile();

  let row: GameLevelRow | null = null;
  let passed = false;
  let attempts = 0;
  let prevId: string | null = null;
  let nextId: string | null = null;
  let lastLevelNumber: number | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("game_levels")
      .select(
        "id, level_number, game_type, title, description, hints, map_layout_json, robot_start_json, factory_initial_json, success_conditions_json, safety_constraints_json, time_limit_ticks, ticks_per_second, game_id"
      )
      .eq("id", levelId)
      .single();

    if (error || !data) {
      console.error("GameLevelPage: game level not found", error);
      notFound();
    }
    row = data as GameLevelRow;
    const gameId = (data as { game_id: string }).game_id;

    // Queried separately from the main row above (not merged into the same
    // select) so a pre-migration environment - reference_grid_program_json
    // doesn't exist yet until 0015 is run - only loses the example-solution
    // viewer, instead of 404ing the whole level page.
    const { data: refData, error: refError } = await supabase
      .from("game_levels")
      .select("reference_grid_program_json")
      .eq("id", levelId)
      .maybeSingle();
    if (refError) console.error("GameLevelPage: failed to load reference_grid_program_json (migration 0015 may not be run yet)", refError);
    else if (refData) (row as GameLevelRow).reference_grid_program_json = refData.reference_grid_program_json;

    // Prev/next only within the SAME game (game_id) - a Maze level's
    // "next" should never jump into a Factory level, even though both
    // still share the same level_number/chapter numbering scheme.
    const { data: allLevels, error: allLevelsError } = await supabase
      .from("game_levels")
      .select("id, level_number")
      .eq("game_id", gameId)
      .order("level_number", { ascending: true });
    if (allLevelsError) console.error("GameLevelPage: failed to load level order", allLevelsError);
    const ordered = allLevels ?? [];
    const myIndex = ordered.findIndex((l) => l.id === levelId);
    if (myIndex > 0) prevId = ordered[myIndex - 1].id;
    if (myIndex >= 0 && myIndex + 1 < ordered.length) nextId = ordered[myIndex + 1].id;
    if (ordered.length > 0) lastLevelNumber = ordered[ordered.length - 1].level_number;

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("game_play_logs")
        .select("is_success")
        .eq("user_id", profile.id)
        .eq("game_level_id", levelId);
      if (logsError) {
        console.error("GameLevelPage: failed to load game play logs", logsError);
      } else {
        attempts = logs?.length ?? 0;
        passed = (logs ?? []).some((l) => l.is_success);
      }
    }
  } catch (err) {
    console.error("GameLevelPage crashed:", err);
    notFound();
  }

  if (!row) notFound();

  const chapter = chapterForGameLevel(gameSlug, row.level_number);
  const spec = gameLevelRowToSpec(row);
  const isBoss = row.level_number === lastLevelNumber;

  const prevNav: NavTarget = prevId ? { kind: "link", href: `/dashboard/games/${gameSlug}/${prevId}` } : { kind: "none" };
  const nextNav: NavTarget = nextId ? { kind: "link", href: `/dashboard/games/${gameSlug}/${nextId}` } : { kind: "none" };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/games/${gameSlug}`}
          className="text-xs font-medium text-zinc-500 hover:text-blue-600 hover:underline dark:text-zinc-400 dark:hover:text-blue-400"
        >
          ← กลับไปที่รายการด่าน
        </Link>
        <PrevNextNav prev={prevNav} next={nextNav} prevLabel="← ด่านก่อนหน้า" nextLabel="ด่านถัดไป →" />
      </div>

      <div
        className={`rounded-lg border p-5 text-white ${
          isBoss ? "border-amber-500 bg-gradient-to-br from-amber-900 to-zinc-900" : "border-zinc-800 bg-zinc-900"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400">
            Lv.{row.level_number}
          </span>
          {chapter && (
            <span className="text-[11px] text-zinc-400">
              บทที่ {chapter.chapterNumber}: {chapter.titleTh}
            </span>
          )}
          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium">{GAME_TYPE_LABEL[row.game_type]}</span>
          {passed && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">✓ ผ่านแล้ว</span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold">
          {isBoss && "👑 "}
          {row.title}
        </h1>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">โจทย์สถานการณ์</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{row.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="ประเภทเกม" value={GAME_TYPE_LABEL[row.game_type]} />
        <StatTile label="เวลาจำกัด (ติ๊ก)" value={row.time_limit_ticks ?? "-"} />
        <StatTile label="จำนวนครั้งที่ลอง" value={attempts} />
      </div>

      {/*
        Prominent, always-visible I/O reference (Task 2) - sits right under
        the scenario/objective block, not buried inside the play editor's
        collapsible guide, so a student sees exactly what each address means
        before they even start wiring.
      */}
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">รายการ I/O ของด่านนี้</h2>
        {(row.game_type === "MAZE" || row.game_type === "HYBRID") && (
          <IoAddressTable title="หุ่นยนต์ AGV (Maze)" rows={MAZE_IO_ROWS} />
        )}
        {(row.game_type === "FACTORY" || row.game_type === "HYBRID") && (
          <IoAddressTable title="สายการผลิต (Factory)" rows={FACTORY_IO_ROWS} />
        )}
      </div>

      {row.hints.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">คำใบ้</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {row.hints.map((hint, i) => (
              <li key={i} className="rounded bg-purple-50 px-3 py-2 text-xs text-purple-900 dark:bg-purple-950 dark:text-purple-200">
                คำใบ้ {i + 1}: {hint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {spec ? (
        <GamePlayClient gameLevelId={row.id} spec={spec} />
      ) : (
        <div className="rounded-lg border border-dashed border-red-400 bg-red-50 p-5 text-center dark:border-red-700 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">⚠️ ด่านนี้มีข้อมูลไม่ถูกต้อง กรุณาแจ้งอาจารย์ผู้สอน</p>
        </div>
      )}

      <div className="flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <PrevNextNav prev={prevNav} next={nextNav} prevLabel="← ด่านก่อนหน้า" nextLabel="ด่านถัดไป →" />
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}
