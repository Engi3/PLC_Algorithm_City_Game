import { readFileSync } from "fs";
import path from "path";
import MarkdownContent from "@/components/markdown/MarkdownContent";

export default function GuidePage() {
  const filePath = path.join(process.cwd(), "PLAYER_GUIDE.md");
  const content = readFileSync(filePath, "utf-8");

  return (
    <div className="mx-auto max-w-3xl">
      <MarkdownContent content={content} />
    </div>
  );
}
