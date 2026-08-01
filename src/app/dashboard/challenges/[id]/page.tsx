import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import {
  chapterForChallengeId,
  challengeRowToSpec,
  COMPETENCY_TAG_LABELS,
  COMPETENCY_TAG_BADGE_CLASSES,
  type ChallengeLevelRow,
  type RequiredCompetency,
} from "@/lib/ladder/challenge-types";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();

  let row: ChallengeLevelRow | null = null;
  let passed = false;
  let attempts = 0;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("challenge_levels")
      .select(
        "id, challenge_id, title, description, required_competencies, hints, stages_json, max_optimal_blocks, reference_grid_program_json"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("ChallengeDetailPage: challenge not found", error);
      notFound();
    }
    row = data as ChallengeLevelRow;

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("challenge_play_logs")
        .select("is_success")
        .eq("user_id", profile.id)
        .eq("challenge_level_id", id);
      if (logsError) {
        console.error("ChallengeDetailPage: failed to load challenge play logs", logsError);
      } else {
        attempts = logs?.length ?? 0;
        passed = (logs ?? []).some((l) => l.is_success);
      }
    }
  } catch (err) {
    console.error("ChallengeDetailPage crashed:", err);
    notFound();
  }

  if (!row) notFound();

  const spec = challengeRowToSpec(row);
  const chapter = chapterForChallengeId(row.challenge_id);
  const stageCount = spec?.testCases[0]?.stages.length ?? 0;
  const safetyCount = spec?.testCases[0]?.safetyConstraints?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/dashboard/challenges"
          className="text-xs font-medium text-zinc-500 hover:text-blue-600 hover:underline dark:text-zinc-400 dark:hover:text-blue-400"
        >
          ← กลับไปที่ Challenge Mode
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400">
            CH-{String(row.challenge_id).padStart(2, "0")}
          </span>
          {chapter && (
            <span className="text-[11px] text-zinc-400">
              บทที่ {chapter.chapterNumber}: {chapter.titleTh}
            </span>
          )}
          {passed && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              ✓ ผ่านแล้ว
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold">{row.title}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {row.required_competencies.map((tag) => {
            const key = tag as RequiredCompetency;
            const label = COMPETENCY_TAG_LABELS[key] ?? tag;
            const classes =
              COMPETENCY_TAG_BADGE_CLASSES[key] ?? "bg-zinc-800 text-zinc-300";
            return (
              <span key={tag} className={`rounded px-2 py-0.5 text-[11px] font-medium ${classes}`}>
                {label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">โจทย์สถานการณ์</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {row.description}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="ขั้นตอน (Stages)" value={stageCount} />
        <StatTile label="เงื่อนไขความปลอดภัย" value={safetyCount} />
        <StatTile label="บล็อกสูงสุดที่แนะนำ" value={row.max_optimal_blocks} />
        <StatTile label="จำนวนครั้งที่ลอง" value={attempts} />
      </div>

      {row.hints.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">คำใบ้</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {row.hints.map((hint, i) => (
              <li
                key={i}
                className="rounded bg-purple-50 px-3 py-2 text-xs text-purple-900 dark:bg-purple-950 dark:text-purple-200"
              >
                คำใบ้ {i + 1}: {hint}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-5 text-center dark:border-amber-700 dark:bg-amber-950">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          🚧 ระบบเล่นด่านแบบอินเทอร์แอคทีฟพร้อมภาพจำลองโรงงานกำลังจะมาเร็วๆ นี้
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          ตอนนี้สามารถดูรายละเอียดโจทย์และคำใบ้ล่วงหน้าได้ก่อน
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}
