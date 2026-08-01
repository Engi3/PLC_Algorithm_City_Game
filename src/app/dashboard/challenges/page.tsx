import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import {
  CHALLENGE_CHAPTERS,
  COMPETENCY_TAG_LABELS,
  COMPETENCY_TAG_BADGE_CLASSES,
  type RequiredCompetency,
} from "@/lib/ladder/challenge-types";

type ChallengeRow = {
  id: string;
  challenge_id: number;
  title: string;
  required_competencies: string[];
  max_optimal_blocks: number;
};

export default async function ChallengesPage() {
  const profile = await getCurrentProfile();

  let challenges: ChallengeRow[] = [];
  const passedIds = new Set<string>();

  try {
    const supabase = await createClient();
    const { data: challengeRows, error: challengesError } = await supabase
      .from("challenge_levels")
      .select("id, challenge_id, title, required_competencies, max_optimal_blocks")
      .order("challenge_id", { ascending: true });

    if (challengesError) {
      console.error("ChallengesPage: failed to load challenge_levels", challengesError);
    } else {
      challenges = challengeRows ?? [];
    }

    if (profile) {
      const { data: logs, error: logsError } = await supabase
        .from("challenge_play_logs")
        .select("challenge_level_id")
        .eq("user_id", profile.id)
        .eq("is_success", true);

      if (logsError) {
        console.error("ChallengesPage: failed to load challenge_play_logs", logsError);
      } else {
        for (const log of logs ?? []) passedIds.add(log.challenge_level_id);
      }
    }
  } catch (err) {
    console.error("ChallengesPage crashed:", err);
  }

  const totalPassed = challenges.filter((c) => passedIds.has(c.id)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4 text-white">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber-400">
            Challenge Mode — Industrial Simulation Curriculum
          </p>
          <h1 className="mt-1 text-2xl font-semibold">50 ภารกิจจำลองโรงงานอุตสาหกรรม</h1>
          <p className="mt-1 text-sm text-zinc-400">
            ความยากระดับสูง ผสมผสาน NO/NC, Timer, Counter, Analog และ Interlock เข้าด้วยกันในสถานการณ์จริง
          </p>
        </div>
        <div className="rounded-md border border-zinc-700 bg-zinc-950 px-4 py-2 text-center">
          <p className="font-mono text-2xl font-semibold text-amber-400">
            {totalPassed}/{challenges.length}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">ผ่านแล้ว</p>
        </div>
      </div>

      {challenges.length === 0 && (
        <p className="text-zinc-400">ยังไม่มีภารกิจ Challenge Mode ในระบบ</p>
      )}

      {CHALLENGE_CHAPTERS.map((chapter) => {
        const chapterChallenges = challenges.filter(
          (c) => c.challenge_id >= chapter.idRange[0] && c.challenge_id <= chapter.idRange[1]
        );
        if (chapterChallenges.length === 0) return null;
        const chapterPassed = chapterChallenges.filter((c) => passedIds.has(c.id)).length;

        return (
          <div key={chapter.chapterNumber} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-800 px-4 py-2.5 text-white">
              <div className="flex items-center gap-3">
                <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400">
                  CH-{String(chapter.chapterNumber).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{chapter.titleTh}</h2>
                  <p className="text-[11px] text-zinc-400">{chapter.titleEn}</p>
                </div>
              </div>
              <span className="font-mono text-xs text-zinc-400">
                {chapterPassed}/{chapterChallenges.length} ผ่านแล้ว
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chapterChallenges.map((challenge) => {
                const passed = passedIds.has(challenge.id);
                return (
                  <Link
                    key={challenge.id}
                    href={`/dashboard/challenges/${challenge.id}`}
                    className={`flex flex-col gap-2 rounded-lg border bg-white p-4 transition-colors hover:border-amber-500 dark:bg-zinc-950 ${
                      passed
                        ? "border-emerald-300 dark:border-emerald-800"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                        CH-{String(challenge.challenge_id).padStart(2, "0")}
                      </span>
                      {passed ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                          ✓ ผ่านแล้ว
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                          ยังไม่ผ่าน
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{challenge.title}</h3>
                    <div className="mt-auto flex flex-wrap gap-1 pt-1">
                      {challenge.required_competencies.map((tag) => {
                        const key = tag as RequiredCompetency;
                        const label = COMPETENCY_TAG_LABELS[key] ?? tag;
                        const classes =
                          COMPETENCY_TAG_BADGE_CLASSES[key] ??
                          "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
                        return (
                          <span key={tag} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${classes}`}>
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
