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
  /**
   * GX Works UX overhaul Task 3: true for an unsplit horizontal segment
   * through a bare (no instruction), wire-carrying cell - GridCellView gives
   * that exact case its own "center" mid-wire-tap PortDot (the drop target
   * for "branch off an existing run", per cellHasWire's doc comment),
   * sitting at the segment's own midpoint rather than either end. The
   * PORT_EXCLUSION_PX trim below only protects a segment's two ENDpoints
   * (where edge ports normally sit) - without also carving out a gap around
   * the midpoint here, this overlay's own hit-stroke shadowed that center
   * port exactly like the original Task 2 bug did at segment ends (caught
   * live via the same elementFromPoint check while building this task).
   */
  midGap?: boolean;
};

/**
 * GX Works UX overhaul Task 3: a filled "solder dot" marking a genuine wire
 * T-junction/branch point - a bare (no instruction placed) cell where 3 or 4
 * of its own connectLeft/Right/Top/Bottom flags are true at once. A plain
 * straight-through or elbow segment only ever uses 2 (opposite for
 * straight-through, adjacent for a corner); 3+ only happens where a branch
 * genuinely splits off - exactly the mid-wire-tap `cellHasWire` center
 * PortDot case (GridCellView) already using this same cell as its anchor.
 * Deliberately scoped to bare cells only: an occupied cell's horizontal
 * stubs already dodge its own symbol (see the segment-building comment
 * below), so there's no single point within it where 3 lines actually
 * converge the way there is in an empty cell - the classic GX Works3 look
 * never draws a solder dot on top of a contact/coil symbol either.
 */
type Junction = { key: string; x: number; y: number; energized: boolean };

/** GX Works UX overhaul Task 4: identifies a specific wire segment (by the same flag GridCellView's own wire-bar/toggle controls) - what a click now selects instead of instantly toggling, and what the Delete/Backspace key or floating delete button in GridEditorSurface act on. */
export type WireKey = { kind: "h" | "v"; rungIndex: number; row: number; col: number };

function sameWire(a: WireKey | null, b: { kind: "h" | "v"; rungIndex: number; row: number; col: number }): boolean {
  return !!a && a.kind === b.kind && a.rungIndex === b.rungIndex && a.row === b.row && a.col === b.col;
}

const POLL_MS = 150;
/** UX/UI fix: the visible line is a precise 3px stroke, too thin to reliably click - each line gets an invisible, wider sibling stroke that actually receives the click. */
const HIT_STROKE_WIDTH = 14;
/**
 * GX Works UX overhaul Task 2: how far (in px) the invisible wide hit-stroke
 * pulls back from each end of a segment, since every segment's endpoints are
 * deliberately positioned exactly where a PortDot renders (see the class
 * comment). Without this, this overlay - rendered `fixed` at the document
 * root so it always paints above GridCanvas's transformed subtree (see the
 * class comment on stacking context) - silently won the hit-test over the
 * PortDot button sitting at that same pixel, swallowing the pointerdown that
 * should have started a drag-to-connect gesture. Confirmed live via
 * `elementFromPoint` at a real port's center: it resolved to this overlay's
 * `<line>`, not the button underneath. Any segment shorter than 2x this
 * value loses its hit-target entirely rather than rendering an
 * overlapping/negative-length stroke - acceptable, since a segment that
 * short only ever occurs directly between two already-placed, adjacent
 * blocks, and use-ladder-grid's forceAdjacentBlockWiring already makes that
 * particular connection un-severable anyway (clicking it would no-op).
 */
const PORT_EXCLUSION_PX = 12;

type HitPiece = { x1: number; y1: number; x2: number; y2: number };

function pointAt(x1: number, y1: number, x2: number, y2: number, t: number): { x: number; y: number } {
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}

/**
 * The invisible wide hit-stroke's actual clickable geometry - trimmed
 * PORT_EXCLUSION_PX in from each end so it never covers the segment's own
 * edge ports (see the constant comment), and additionally split into two
 * pieces around the segment's midpoint when `midGap` is set, so it also
 * never covers a bare cell's center mid-wire-tap port (see the Segment type
 * comment). Each returned piece is independently long enough to be worth
 * rendering; a segment can come out with 0, 1, or 2 hit pieces.
 */
function computeHitPieces(x1: number, y1: number, x2: number, y2: number, midGap: boolean | undefined): HitPiece[] {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length <= PORT_EXCLUSION_PX * 2) return [];
  const start = pointAt(x1, y1, x2, y2, PORT_EXCLUSION_PX / length);
  const end = pointAt(x1, y1, x2, y2, 1 - PORT_EXCLUSION_PX / length);
  if (!midGap) return [{ x1: start.x, y1: start.y, x2: end.x, y2: end.y }];

  const midGapStart = pointAt(x1, y1, x2, y2, 0.5 - PORT_EXCLUSION_PX / length);
  const midGapEnd = pointAt(x1, y1, x2, y2, 0.5 + PORT_EXCLUSION_PX / length);
  const pieces: HitPiece[] = [];
  if (Math.hypot(midGapStart.x - start.x, midGapStart.y - start.y) > 4) pieces.push({ x1: start.x, y1: start.y, x2: midGapStart.x, y2: midGapStart.y });
  if (Math.hypot(end.x - midGapEnd.x, end.y - midGapEnd.y) > 4) pieces.push({ x1: midGapEnd.x, y1: midGapEnd.y, x2: end.x, y2: end.y });
  return pieces;
}

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
  selectedWire,
  onSelectWire,
}: {
  gridProgram: GridProgram;
  /** GX Works UX overhaul Task 4: the currently-selected wire, if any - GridEditorSurface owns this state (Delete/Backspace and the floating delete button act on it), this component only highlights whichever segment matches. */
  selectedWire: WireKey | null;
  /** GX Works UX overhaul Task 4: fired on click instead of instantly deleting - selects the segment and reports its on-screen midpoint, for the floating delete button's position. */
  onSelectWire: (wire: WireKey, midX: number, midY: number) => void;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [junctions, setJunctions] = useState<Junction[]>([]);
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
      const nextJunctions: Junction[] = [];
      gridProgramRef.current.grids.forEach((grid, rungIndex) => {
        for (let r = 0; r < grid.rowCount; r++) {
          for (let c = 0; c < grid.cells[r].length; c++) {
            const cell = grid.cells[r][c];
            const ownEl = cellMap.get(`${rungIndex}-${r}-${c}`);
            if (!ownEl) continue;
            const ownRect = ownEl.getBoundingClientRect();
            if (ownRect.width === 0 || ownRect.height === 0) continue;

            if (!cell.node) {
              const connectCount = [cell.connectLeft, cell.connectRight, cell.connectTop, cell.connectBottom].filter(Boolean).length;
              if (connectCount >= 3) {
                nextJunctions.push({
                  key: `j-${rungIndex}-${r}-${c}`,
                  x: ownRect.left + ownRect.width / 2,
                  y: ownRect.top + ownRect.height / 2,
                  energized: ownEl.getAttribute("data-energized") === "true",
                });
              }
            }

            if (cell.connectLeft) {
              const energized = ownEl.getAttribute("data-energized") === "true";
              const y = ownRect.top + ownRect.height / 2; // matches the left/right PortDot's top-1/2
              const symbolEl = ownEl.querySelector(".cursor-grab");
              const symbolRect = symbolEl ? symbolEl.getBoundingClientRect() : null;
              if (symbolRect && symbolRect.width > 0 && symbolRect.left > ownRect.left && symbolRect.right < ownRect.right) {
                next.push({ key: `h-${rungIndex}-${r}-${c}-a`, x1: ownRect.left, y1: y, x2: symbolRect.left, y2: y, energized, kind: "h", rungIndex, row: r, col: c });
                next.push({ key: `h-${rungIndex}-${r}-${c}-b`, x1: symbolRect.right, y1: y, x2: ownRect.right, y2: y, energized, kind: "h", rungIndex, row: r, col: c });
              } else {
                next.push({ key: `h-${rungIndex}-${r}-${c}`, x1: ownRect.left, y1: y, x2: ownRect.right, y2: y, energized, kind: "h", rungIndex, row: r, col: c, midGap: true });
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
      const clippedJunctions = canvasRect
        ? nextJunctions.filter(
            (j) => j.x >= canvasRect.left - CLIP_TOLERANCE_PX && j.x <= canvasRect.right + CLIP_TOLERANCE_PX && j.y >= canvasRect.top - CLIP_TOLERANCE_PX && j.y <= canvasRect.bottom + CLIP_TOLERANCE_PX
          )
        : nextJunctions;

      const nextKey =
        clipped.map((s) => `${s.key}:${Math.round(s.x1)}:${Math.round(s.y1)}:${Math.round(s.x2)}:${Math.round(s.y2)}:${s.energized}`).join("|") +
        "||" +
        clippedJunctions.map((j) => `${j.key}:${Math.round(j.x)}:${Math.round(j.y)}:${j.energized}`).join("|");
      if (nextKey !== lastKeyRef.current) {
        lastKeyRef.current = nextKey;
        setSegments(clipped);
        setJunctions(clippedJunctions);
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

  if (segments.length === 0 && junctions.length === 0) return null;

  function handleClick(s: Segment) {
    onSelectWire({ kind: s.kind, rungIndex: s.rungIndex, row: s.row, col: s.col }, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2);
  }

  return (
    <svg className="pointer-events-none fixed inset-0 z-10 h-full w-full">
      {segments.map((s) => {
        const hitPieces = computeHitPieces(s.x1, s.y1, s.x2, s.y2, s.midGap);
        const isSelected = sameWire(selectedWire, s);
        return (
          <g key={s.key}>
            <line
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={isSelected ? "#dc2626" : s.energized ? "#22c55e" : "#2563eb"}
              strokeWidth={isSelected ? 4 : 3}
              strokeDasharray={isSelected ? "6 3" : undefined}
              strokeLinecap="round"
            />
            {/* Invisible wide hit-target - the visible 3px stroke above is too thin to reliably click, this is what actually receives the click/hover. pointer-events-auto re-enables hit-testing for just this element, overriding the pointer-events-none the <svg> root inherits down to everything else. Pulled back PORT_EXCLUSION_PX from each end (see constant comment), plus split around the midpoint for a midGap segment, so it never shadows the PortDot buttons at the segment's endpoints or its center mid-wire-tap. */}
            {hitPieces.map((hit, i) => (
              <line
                key={i}
                x1={hit.x1}
                y1={hit.y1}
                x2={hit.x2}
                y2={hit.y2}
                stroke="transparent"
                strokeWidth={HIT_STROKE_WIDTH}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(s);
                }}
              >
                {/* GX Works UX overhaul Task 4: click now selects (see the class-level WireKey comment) - deletion is Backspace/Delete or the floating delete button GridEditorSurface renders for the selection, not this click itself anymore. */}
                <title>คลิกเพื่อเลือกสายไฟเส้นนี้ แล้วกด Delete หรือปุ่มลบ (Click to select this wire, then Delete or the delete button to remove it)</title>
              </line>
            ))}
          </g>
        );
      })}
      {/* GX Works UX overhaul Task 3: solder dots at genuine wire T-junctions/branch points (see the Junction type comment) - purely visual (no pointer-events-auto), so the mid-wire-tap PortDot already anchored at this same cell (GridCellView) stays exactly as clickable as it was, per Task 2's "never shadow a port" fix. */}
      {junctions.map((j) => (
        <circle key={j.key} cx={j.x} cy={j.y} r={4.5} fill={j.energized ? "#22c55e" : "#2563eb"} stroke="white" strokeWidth={1.5} className="dark:stroke-zinc-950" />
      ))}
    </svg>
  );
}
