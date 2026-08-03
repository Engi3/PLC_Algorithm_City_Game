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
import { checkLevelGate, computeChallengeUnlockStatus, resolveModeUnlock, type LevelGateStatus } from "@/lib/ladder/challenge-unlock";
import { SKILL_LABELS } from "@/lib/ladder/level-spec";
import ChallengePlayClient from "@/components/ladder/ChallengePlayClient";
import PrevNextNav, { type NavTarget } from "@/components/ladder/PrevNextNav";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  /** Teachers and guests bypass both the whole-mode gate and per-challenge sequential locking. */
  const bypassAllLocks = profile?.role === "teacher" || profile?.role === "guest";

  let row: ChallengeLevelRow | null = null;
  let passed = false;
  let attempts = 0;
  let gate: LevelGateStatus = { unlocked: bypassAllLocks, categories: [] };
  let sequentiallyUnlocked = bypassAllLocks;
  let prevChallengeId: string | null = null;
  let nextChallengeId: string | null = null;
  let nextUnlocked = false;

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

    const { data: allChallenges, error: allChallengesError } = await supabase
      .from("challenge_levels")
      .select("id, challenge_id")
      .order("challenge_id", { ascending: true });
    if (allChallengesError) console.error("ChallengeDetailPage: failed to load challenge order", allChallengesError);
    const ordered = allChallenges ?? [];
    const myIndex = ordered.findIndex((c) => c.id === id);
    if (myIndex > 0) prevChallengeId = ordered[myIndex - 1].id;
    if (myIndex >= 0 && myIndex + 1 < ordered.length) nextChallengeId = ordered[myIndex + 1].id;

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("challenge_play_logs")
        .select("challenge_level_id, is_success")
        .eq("user_id", profile.id);
      if (logsError) {
        console.error("ChallengeDetailPage: failed to load challenge play logs", logsError);
      } else {
        const myLogs = (logs ?? []).filter((l) => l.challenge_level_id === id);
        attempts = myLogs.length;
        passed = myLogs.some((l) => l.is_success);

        if (!bypassAllLocks) {
          if (profile.role === "student") gate = await checkLevelGate(supabase, profile.id);
          gate = { ...gate, unlocked: resolveModeUnlock(profile.role, profile.challenge_mode_override, gate) };
          const passedIds = new Set((logs ?? []).filter((l) => l.is_success).map((l) => l.challenge_level_id));
          const unlockStatus = computeChallengeUnlockStatus(
            ordered.map((c) => ({ id: c.id, challengeId: c.challenge_id })),
            passedIds
          );
          sequentiallyUnlocked = unlockStatus.get(id) ?? false;
          if (nextChallengeId) nextUnlocked = unlockStatus.get(nextChallengeId) ?? false;
        } else {
          nextUnlocked = true;
        }
      }
    }
  } catch (err) {
    console.error("ChallengeDetailPage crashed:", err);
    notFound();
  }

  if (!row) notFound();

  const chapter = chapterForChallengeId(row.challenge_id);

  if (!gate.unlocked) {
    const unmet = gate.categories.filter((c) => c.total > 0 && c.passed / c.total < 0.5);
    const detail = unmet.map((c) => `${SKILL_LABELS[c.skill]} (${c.passed}/${c.total})`).join(", ");
    return (
      <LockedNotice
        title="🔒 Challenge Mode ยังไม่ปลดล็อค"
        message={`ต้องผ่านด่านทดสอบ (Levels) อย่างน้อย 50% ในทุกหมวดหมู่ - ยังไม่ถึงเกณฑ์: ${detail}`}
      />
    );
  }
  if (!sequentiallyUnlocked) {
    return (
      <LockedNotice
        title="🔒 ภารกิจนี้ยังไม่ปลดล็อค"
        message="ต้องผ่านภารกิจก่อนหน้าในลำดับให้สำเร็จก่อน จึงจะเล่นภารกิจนี้ได้"
      />
    );
  }

  const spec = challengeRowToSpec(row);
  const stageCount = spec?.testCases[0]?.stages.length ?? 0;
  const safetyCount = spec?.testCases[0]?.safetyConstraints?.length ?? 0;

  const prevNav: NavTarget = prevChallengeId
    ? { kind: "link", href: `/dashboard/challenges/${prevChallengeId}` }
    : { kind: "none" };
  const nextNav: NavTarget = nextChallengeId
    ? nextUnlocked
      ? { kind: "link", href: `/dashboard/challenges/${nextChallengeId}` }
      : { kind: "locked", title: "ต้องผ่านภารกิจนี้ก่อน จึงจะปลดล็อคภารกิจถัดไป" }
    : { kind: "none" };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard/challenges"
          className="text-xs font-medium text-zinc-500 hover:text-blue-600 hover:underline dark:text-zinc-400 dark:hover:text-blue-400"
        >
          ← กลับไปที่ Challenge Mode
        </Link>
        <PrevNextNav prev={prevNav} next={nextNav} prevLabel="← ภารกิจก่อนหน้า" nextLabel="ภารกิจถัดไป →" />
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

      {spec ? (
        <ChallengePlayClient challengeLevelId={row.id} spec={spec} />
      ) : (
        <div className="rounded-lg border border-dashed border-red-400 bg-red-50 p-5 text-center dark:border-red-700 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            ⚠️ ภารกิจนี้มีข้อมูลไม่ถูกต้อง กรุณาแจ้งอาจารย์ผู้สอน
          </p>
        </div>
      )}

      <div className="flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <PrevNextNav prev={prevNav} next={nextNav} prevLabel="← ภารกิจก่อนหน้า" nextLabel="ภารกิจถัดไป →" />
      </div>
    </div>
  );
}

function LockedNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/dashboard/challenges"
          className="text-xs font-medium text-zinc-500 hover:text-blue-600 hover:underline dark:text-zinc-400 dark:hover:text-blue-400"
        >
          ← กลับไปที่ Challenge Mode
        </Link>
      </div>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950">
        <h1 className="text-lg font-semibold text-amber-800 dark:text-amber-300">{title}</h1>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{message}</p>
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
