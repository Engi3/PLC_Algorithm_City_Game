import GridLadderEditor from "@/components/ladder-grid/GridLadderEditor";

export default function SandboxPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          กระบะทรายจำลองวงจรแลดเดอร์ (Sandbox)
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          วางคอนแทค NO/NC และเอาต์พุตลงบนตารางแถว/คอลัมน์ สายไฟจะต่อให้อัตโนมัติ
          จากนั้นลองเปิด/ปิดอินพุต หรือกด Step/Run เพื่อดูการทำงานของลอจิก
        </p>
      </div>
      <GridLadderEditor />
    </div>
  );
}
