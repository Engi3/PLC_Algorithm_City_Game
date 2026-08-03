import type { IoRow } from "@/lib/games/io-tables";

const TYPE_STYLE: Record<IoRow["type"], string> = {
  อินพุตดิจิทัล: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  เอาต์พุตดิจิทัล: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  อินพุตอนาล็อก: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

/** Task 2 "Structured I/O Data Tables": replaces plain-text address lists (X0 = ..., Y0 = ...) with a proper Address/Variable Name/Type/Description table, so a student can scan the assignment instead of parsing a run-on sentence. */
export default function IoAddressTable({ title, rows }: { title: string; rows: IoRow[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-zinc-50 uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="whitespace-nowrap px-2.5 py-1.5">Address</th>
              <th className="whitespace-nowrap px-2.5 py-1.5">ชื่อตัวแปร</th>
              <th className="whitespace-nowrap px-2.5 py-1.5">ประเภท</th>
              <th className="whitespace-nowrap px-2.5 py-1.5">คำอธิบาย</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.address}>
                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono font-semibold text-zinc-900 dark:text-zinc-50">
                  {r.address}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-zinc-800 dark:text-zinc-200">{r.name}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLE[r.type]}`}>{r.type}</span>
                </td>
                <td className="px-2.5 py-1.5 text-zinc-600 dark:text-zinc-400">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
