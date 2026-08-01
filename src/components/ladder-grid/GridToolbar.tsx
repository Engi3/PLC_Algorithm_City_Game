"use client";

import type { GridTool } from "./types";

type ToolButtonDef = { tool: NonNullable<GridTool>; label: string; hint: string; key: string };

/** F5-F7: each has its own dedicated key. */
const BASIC_TOOLS: ToolButtonDef[] = [
  { tool: { kind: "PLACE", nodeKind: "NO" }, label: "NO", hint: "F5 - หน้าสัมผัสปกติเปิด (Normally Open Contact)", key: "F5" },
  { tool: { kind: "PLACE", nodeKind: "NC" }, label: "NC", hint: "F6 - หน้าสัมผัสปกติปิด (Normally Closed Contact)", key: "F6" },
  { tool: { kind: "PLACE", nodeKind: "COIL" }, label: "( )", hint: "F7 - คอยล์เอาต์พุต (Output Coil)", key: "F7" },
];

/**
 * F8: GX Works3/TIA Portal only has one "Applied Instruction" key, not one
 * per instruction - each F8 press here cycles to the next kind in this list
 * (see GridLadderEditor's cycleApplicationInstruction), so every button
 * below shares the same F8 hint rather than inventing five separate keys.
 */
const APPLIED_INSTRUCTION_TOOLS: ToolButtonDef[] = [
  { tool: { kind: "PLACE", nodeKind: "SET" }, label: "(S)", hint: "F8 - ล็อกเอาต์พุตค้าง (Set/Latch Coil)", key: "F8" },
  { tool: { kind: "PLACE", nodeKind: "RESET" }, label: "(R)", hint: "F8 - ปลดล็อกเอาต์พุต / รีเซ็ตไทม์เมอร์-เคาน์เตอร์ (Reset)", key: "F8" },
  { tool: { kind: "PLACE", nodeKind: "COMPARE" }, label: "CMP", hint: "F8 - บล็อกเปรียบเทียบค่า (Comparison: >, <, =, ≥, ≤)", key: "F8" },
  { tool: { kind: "PLACE", nodeKind: "TIMER" }, label: "TMR", hint: "F8 - ไทม์เมอร์ (Timer: TON/TOF/RTO)", key: "F8" },
  { tool: { kind: "PLACE", nodeKind: "COUNTER" }, label: "CTR", hint: "F8 - เคาน์เตอร์ (Counter: CTU/CTD)", key: "F8" },
];

/** UX/UI refinement Task 5: a small persistent badge naming the keyboard shortcut, visible only on the xl+ "high-density desktop" breakpoint - hover tooltips already carry this info everywhere, but a always-visible badge is what the task brief calls a keyboard shortcut "overlay" for a keyboard-equipped desktop workspace. */
function KeyBadge({ shortcut }: { shortcut: string }) {
  return (
    <span className="pointer-events-none absolute -top-1.5 -right-1.5 hidden rounded border border-zinc-400 bg-zinc-100 px-1 text-[9px] font-semibold leading-tight text-zinc-600 xl:block dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {shortcut}
    </span>
  );
}

function sameTool(a: GridTool, b: GridTool): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "PLACE" && b.kind === "PLACE") return a.nodeKind === b.nodeKind;
  return true;
}

/**
 * Selects the active click-to-place/click-to-wire tool. The F5-F10 keydown
 * listeners that make the tooltip shortcuts actually work live in
 * GridLadderEditor (Task 4) - this component only renders the buttons and
 * reflects whichever tool is currently active.
 */
export default function GridToolbar({
  activeTool,
  onSelectTool,
}: {
  activeTool: GridTool;
  onSelectTool: (tool: GridTool) => void;
}) {
  /** UX/UI refinement Task 5: h-11 (44px, the Apple/Android touch-target minimum) on touch-first widths, back to a tighter h-9 (36px) at lg+ where mouse precision doesn't need the extra footprint. `relative` so each button can host its own absolutely-positioned KeyBadge. */
  function buttonClass(tool: GridTool) {
    const isActive = sameTool(activeTool, tool);
    return `relative h-11 rounded-md border px-3 text-sm font-medium transition-colors lg:h-9 ${
      isActive
        ? "border-blue-600 bg-blue-600 text-white"
        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950">
      {BASIC_TOOLS.map(({ tool, label, hint, key }) => (
        <button
          key={label}
          type="button"
          title={hint}
          onClick={() => onSelectTool(sameTool(activeTool, tool) ? null : tool)}
          className={buttonClass(tool)}
        >
          {label}
          <KeyBadge shortcut={key} />
        </button>
      ))}

      <div className="mx-1 h-6 w-px bg-zinc-300 dark:bg-zinc-700" />

      {APPLIED_INSTRUCTION_TOOLS.map(({ tool, label, hint, key }) => (
        <button
          key={label}
          type="button"
          title={hint}
          onClick={() => onSelectTool(sameTool(activeTool, tool) ? null : tool)}
          className={buttonClass(tool)}
        >
          {label}
          <KeyBadge shortcut={key} />
        </button>
      ))}

      <div className="mx-1 h-6 w-px bg-zinc-300 dark:bg-zinc-700" />

      <button
        type="button"
        title="F9 - วาดเส้นไฟ (Draw Line) - คลิกจุดเชื่อมระหว่างเซลล์เพื่อต่อสาย"
        onClick={() => onSelectTool(sameTool(activeTool, { kind: "DRAW_LINE" }) ? null : { kind: "DRAW_LINE" })}
        className={buttonClass({ kind: "DRAW_LINE" })}
      >
        ⚡ Draw Line
        <KeyBadge shortcut="F9" />
      </button>
      <button
        type="button"
        title="F10 - ลบเส้นไฟ (Delete Line) - คลิกจุดเชื่อมที่ต้องการตัดสายออก"
        onClick={() => onSelectTool(sameTool(activeTool, { kind: "DELETE_LINE" }) ? null : { kind: "DELETE_LINE" })}
        className={buttonClass({ kind: "DELETE_LINE" })}
      >
        ✂ Delete Line
        <KeyBadge shortcut="F10" />
      </button>
    </div>
  );
}
