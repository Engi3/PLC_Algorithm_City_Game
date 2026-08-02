import { readFileSync } from "fs";
import path from "path";
import MarkdownContent from "@/components/markdown/MarkdownContent";
import GuideTabs from "@/components/markdown/GuideTabs";
import { getCurrentProfile } from "@/lib/auth/get-profile";

export default async function GuidePage() {
  const profile = await getCurrentProfile();
  const playerGuide = readFileSync(path.join(process.cwd(), "PLAYER_GUIDE.md"), "utf-8");

  if (profile?.role === "teacher") {
    const teacherGuide = readFileSync(path.join(process.cwd(), "TEACHER_GUIDE.md"), "utf-8");
    return (
      <div className="mx-auto max-w-3xl">
        <GuideTabs playerGuide={playerGuide} teacherGuide={teacherGuide} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <MarkdownContent content={playerGuide} />
    </div>
  );
}
