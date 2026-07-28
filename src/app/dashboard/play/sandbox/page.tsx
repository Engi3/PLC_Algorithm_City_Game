import LadderPlayground from "@/components/ladder/LadderPlayground";

export default function SandboxPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          กระบะทรายจำลองวงจรแลดเดอร์ (Sandbox)
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          ลากและวางคอนแทค NO/NC และเอาต์พุตลงบน Rung (แถวของวงจร) เชื่อมต่อสายไฟ
          จากนั้นลองเปิด/ปิดอินพุต หรือกด Step/Run เพื่อดูการทำงานของลอจิก
          โหมดนี้เป็นโหมดอิสระ ไม่มีเป้าหมายหรือการเก็บคะแนน -
          หากต้องการเก็บคะแนนและประเมินผล ให้เข้าไปที่โหมดด่านทดสอบ (Levels)
        </p>
      </div>
      <LadderPlayground />
    </div>
  );
}
