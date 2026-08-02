"use client";

import { useEffect, useRef, useState } from "react";
import type { GridProgram } from "@/lib/ladder/grid-types";

type Segment = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  energized: boolean;
  /** UX/UI fix: which underlying wire flag this segment represents, so a click on it can toggle the exact same flag GridCellView's own wire-bar/toggle already control. */
  kind: "h" | "v";
  rungIndex: number;
  row: number;
  col: number;
};

const POLL_MS = 150;
/** UX/UI fix: the visible line is a precise 3px stroke, too thin to reliably click - each line gets an invisible, wider sibling stroke that actually receives the click. */
const HIT_STROKE_WIDTH = 14;

/**
 * UX/UI fix: a persistent "connector line" overlay traced over every actual
 * wire connection in the whole program (both the ordinary auto-wired
 * straight-series kind and the drag/two-tap connectPorts kind - the
 * underlying data model doesn't distinguish them, so neither does this).
 * Each line is also clickable - it calls back to toggle the exact same
 * connectLeft/connectBottom flag GridCellView's own wire-bar/vertical
 * toggle already control, giving a second, more discoverable way to cut a
 * connection right where it's visibly drawn instead of hunting for the
 * thin bar/toggle underneath it.
 *
 * Each segment terminates exactly where GridCellView's own PortDot
 * terminals render, not at the cell's geometric center:
 *  - horizontal (connectLeft): this cell's own left edge to its own right
 *    edge, at its vertical center - matching the left/right PortDots'
 *    `left-0`/`right-0`, `top-1/2` positioning exactly. Consecutive
 *    connected cells' spans butt up against each other (offset only by the
 *    ~4px flex gap between cell boxes), chaining into one continuous line.
 *    An OCCUPIED cell's span is split in two around its own symbol's rect
 *    (found via the `.cursor-grab` drag-handle GridCellView already wraps
 *    it in) instead of drawing straight across it - a solid line at the
 *    same height as the contact/coil symbol otherwise draws directly over
 *    the NO/NC lines or coil circle, visually burying the very thing it's
 *    supposed to be showing is connected. An empty pass-through cell has no
 *    symbol to dodge, so it still gets one unbroken span. Both stubs share
 *    the same rungIndex/row/col, so clicking either toggles the one flag
 *    they both represent.
 *  - vertical (connectBottom): this cell's own bottom edge down to the next
 *    row's cell's top edge, at their shared horizontal center - matching
 *    the top/bottom PortDots' `left-1/2`, `top-0`/`bottom-0` positioning.
 *    This stays entirely in the gap between rows, so it never needs the
 *    same symbol-dodging split.
 *
 * Using each cell's own rect (rather than deriving a position from a
 * neighbor) means this doesn't need to special-case column 0 or a missing
 * neighbor - every cell contributes exactly the span its own PortDots would
 * occupy if it were occupied, whether or not it actually is.
 *
 * Rendered `fixed` at the viewport level in screen-space coordinates, same
 * as GridLadderEditor's drag-preview line, so it's unaffected by
 * GridCanvas's zoom/pan CSS transform without needing any scale math. Since
 * pan/zoom don't fire events this component can listen for directly, it
 * re-measures on a short poll (plus immediately on scroll/resize/data
 * changes) rather than trying to enumerate every possible trigger.
 *
 * Rendered AFTER GridCanvas in GridLadderEditor's JSX, not before - see the
 * comment there. GridCanvas's zoomed content div uses `transform`, which
 * per spec implicitly creates its own z-index:0 stacking context; placed
 * earlier in the DOM this overlay would lose that tie and paint invisibly
 * underneath every cell despite computing correct coordinates.
 */
export default function GridWiringOverlay({
  gridProgram,
  onToggleHorizontalWire,
  onToggleVerticalWire,
}: {
  gridProgram: GridProgram;
  onToggleHorizontalWire: (rungIndex: number, row: number, col: number) => void;
  onToggleVerticalWire: (rungIndex: number, row: number, col: number) => void;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const lastKeyRef = useRef<string>("");
  const gridProgramRef = useRef(gridProgram);
  gridProgramRef.current = gridProgram;

  useEffect(() => {
    function measure() {
      const cellEls = document.querySelectorAll('[data-grid-cell="true"]');
      const cellMap = new Map<string, Element>();
      cellEls.forEach((el) => cellMap.set(`${el.getAttribute("data-rung-index")}-${el.getAttribute("data-row")}-${el.getAttribute("data-col")}`, el));
      const vEls = document.querySelectorAll('[data-wire-v="true"]');
      const vMap = new Map<string, Element>();
      vEls.forEach((el) => vMap.set(`${el.getAttribute("data-rung-index")}-${el.getAttribute("data-row")}-${el.getAttribute("data-col")}`, el));

      const next: Segment[] = [];
      gridProgramRef.current.grids.forEach((grid, rungIndex) => {
        for (let r = 0; r < grid.rowCount; r++) {
          for (let c = 0; c < grid.cells[r].length; c++) {
            const cell = grid.cells[r][c];
            const ownEl = cellMap.get(`${rungIndex}-${r}-${c}`);
            if (!ownEl) continue;
            const ownRect = ownEl.getBoundingClientRect();
            if (ownRect.width === 0 || ownRect.height === 0) continue;

            if (cell.connectLeft) {
              const energized = ownEl.getAttribute("data-energized") === "true";
              const y = ownRect.top + ownRect.height / 2; // matches the left/right PortDot's top-1/2
              const symbolEl = ownEl.querySelector(".cursor-grab");
              const symbolRect = symbolEl ? symbolEl.getBoundingClientRect() : null;
              if (symbolRect && symbolRect.width > 0 && symbolRect.left > ownRect.left && symbolRect.right < ownRect.right) {
                next.push({ key: `h-${rungIndex}-${r}-${c}-a`, x1: ownRect.left, y1: y, x2: symbolRect.left, y2: y, energized, kind: "h", rungIndex, row: r, col: c });
                next.push({ key: `h-${rungIndex}-${r}-${c}-b`, x1: symbolRect.right, y1: y, x2: ownRect.right, y2: y, energized, kind: "h", rungIndex, row: r, col: c });
              } else {
                next.push({ key: `h-${rungIndex}-${r}-${c}`, x1: ownRect.left, y1: y, x2: ownRect.right, y2: y, energized, kind: "h", rungIndex, row: r, col: c });
              }
            }

            if (cell.connectBottom) {
              const nextEl = cellMap.get(`${rungIndex}-${r + 1}-${c}`);
              if (nextEl) {
                const nextRect = nextEl.getBoundingClientRect();
                if (nextRect.width > 0 && nextRect.height > 0) {
                  const x = ownRect.left + ownRect.width / 2; // matches the top/bottom PortDot's left-1/2
                  const vEl = vMap.get(`${rungIndex}-${r}-${c}`);
                  const energized = vEl ? vEl.getAttribute("data-energized") === "true" : false;
                  next.push({ key: `v-${rungIndex}-${r}-${c}`, x1: x, y1: ownRect.bottom, x2: x, y2: nextRect.top, energized, kind: "v", rungIndex, row: r, col: c });
                }
              }
            }
          }
        }
      });

      // UX/UI fix: a segment whose endpoint rect was measured mid-layout-race (zoom/pan/insert/delete
      // landing between this poll and the DOM actually settling) can come out pointing far outside the
      // grid canvas entirely. Rendered `fixed` at the viewport level with a 14px-wide invisible hit-target
      // (see below), an errant segment like that silently blocked clicks on whatever real controls happened
      // to sit along its path (Step/Stop/Reset, IoPanel toggles, etc.) on desktop, mobile, and tablet alike.
      // Clipping every segment to the actual grid canvas container's box - the "designated box" a wire
      // should never be able to escape - drops any such stray segment instead of rendering (and blocking
      // clicks with) a line running clear across the rest of the page.
      const canvasEl = document.querySelector('[data-grid-canvas-scroll="true"]');
      const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : null;
      const CLIP_TOLERANCE_PX = 4;
      const clipped = canvasRect
        ? next.filter(
            (s) =>
              s.x1 >= canvasRect.left - CLIP_TOLERANCE_PX &&
              s.x1 <= canvasRect.right + CLIP_TOLERANCE_PX &&
              s.x2 >= canvasRect.left - CLIP_TOLERANCE_PX &&
              s.x2 <= canvasRect.right + CLIP_TOLERANCE_PX &&
              s.y1 >= canvasRect.top - CLIP_TOLERANCE_PX &&
              s.y1 <= canvasRect.bottom + CLIP_TOLERANCE_PX &&
              s.y2 >= canvasRect.top - CLIP_TOLERANCE_PX &&
              s.y2 <= canvasRect.bottom + CLIP_TOLERANCE_PX
          )
        : next;

      const nextKey = clipped.map((s) => `${s.key}:${Math.round(s.x1)}:${Math.round(s.y1)}:${Math.round(s.x2)}:${Math.round(s.y2)}:${s.energized}`).join("|");
      if (nextKey !== lastKeyRef.current) {
        lastKeyRef.current = nextKey;
        setSegments(clipped);
      }
    }

    measure();
    const interval = setInterval(measure, POLL_MS);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
    // Re-measures immediately whenever the program's own topology/labels change (placement, wiring, deletion) - scroll/resize/zoom are covered by the listeners and poll above instead of a dependency, since they aren't reflected in gridProgram itself.
  }, [gridProgram]);

  if (segments.length === 0) return null;

  function handleClick(s: Segment) {
    if (s.kind === "h") onToggleHorizontalWire(s.rungIndex, s.row, s.col);
    else onToggleVerticalWire(s.rungIndex, s.row, s.col);
  }

  return (
    <svg className="pointer-events-none fixed inset-0 z-10 h-full w-full">
      {segments.map((s) => (
        <g key={s.key}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.energized ? "#22c55e" : "#2563eb"} strokeWidth={3} strokeLinecap="round" />
          {/* Invisible wide hit-target - the visible 3px stroke above is too thin to reliably click, this is what actually receives the click/hover. pointer-events-auto re-enables hit-testing for just this element, overriding the pointer-events-none the <svg> root inherits down to everything else. */}
          <line
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="transparent"
            strokeWidth={HIT_STROKE_WIDTH}
            className="pointer-events-auto cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleClick(s);
            }}
          >
            <title>คลิกเพื่อตัดสายไฟเส้นนี้ (Click to disconnect this wire)</title>
          </line>
        </g>
      ))}
    </svg>
  );
}
