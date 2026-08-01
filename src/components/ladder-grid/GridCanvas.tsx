"use client";

import { useEffect, useRef, useState } from "react";

const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const SCALE_STEP = 0.15;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMidpoint(a: Touch, b: Touch): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

/**
 * Task 5: pan/zoom viewport for the grid rungs, so an 11-column GX
 * Works3-width rung (roughly 850px) stays usable on a phone screen.
 * Panning is native `overflow: auto` scroll (mouse drag on the scrollbar,
 * trackpad, or a one-finger touch swipe) rather than a hand-rolled
 * mousedown/touchstart drag - that would have to fight the existing
 * click-to-place and wire-toggle handlers from Tasks 2-4 to tell "drag to
 * pan" apart from "tap to place/select", which native scroll sidesteps
 * entirely. Zoom is Ctrl+wheel (also how Mac trackpad pinch reports itself
 * to `wheel` listeners) or a real two-finger touch pinch, plus explicit
 * +/-/reset buttons as a always-available fallback.
 */
export default function GridCanvas({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const pinchStateRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  // UX/UI refinement Task 5: two-finger drag-to-pan, tracked alongside the existing pinch (both derive from the same two-touch gesture - distance change drives zoom, midpoint movement drives pan, exactly like Google Maps/Figma's combined touch gesture). Kept separate from native one-finger scroll (still the primary pan method) so a deliberate two-finger drag pans predictably even while zoomed in past the point where one-finger scroll alone feels imprecise.
  const panStateRef = useRef<{ startMidX: number; startMidY: number; startScrollLeft: number; startScrollTop: number } | null>(null);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // CSS `transform: scale()` only affects rendering, not the layout box the
  // scroll container measures - without re-sizing this sizer div to match,
  // zooming in past 100% would just clip instead of becoming scrollable.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setNaturalSize({ width: el.scrollWidth, height: el.scrollHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return; // plain wheel/trackpad scroll pans natively; only Ctrl+wheel zooms
      e.preventDefault();
      setScale((prev) => clampScale(prev - e.deltaY * 0.01));
    }

    function onTouchStart(e: TouchEvent) {
      if (!el) return;
      if (e.touches.length === 2) {
        pinchStateRef.current = { startDistance: touchDistance(e.touches[0], e.touches[1]), startScale: scaleRef.current };
        const mid = touchMidpoint(e.touches[0], e.touches[1]);
        panStateRef.current = { startMidX: mid.x, startMidY: mid.y, startScrollLeft: el.scrollLeft, startScrollTop: el.scrollTop };
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!el) return;
      if (e.touches.length === 2 && pinchStateRef.current && panStateRef.current) {
        e.preventDefault(); // only suppress the browser's own pinch-zoom/scroll during an actual 2-finger gesture, never for 1-finger scroll/tap
        const ratio = touchDistance(e.touches[0], e.touches[1]) / pinchStateRef.current.startDistance;
        setScale(clampScale(pinchStateRef.current.startScale * ratio));

        // Two-finger drag-to-pan: the fingers' midpoint moving right means the user is dragging the canvas content rightward, so the scroll position moves the opposite way (same convention as a native touch/trackpad swipe).
        const mid = touchMidpoint(e.touches[0], e.touches[1]);
        el.scrollLeft = panStateRef.current.startScrollLeft - (mid.x - panStateRef.current.startMidX);
        el.scrollTop = panStateRef.current.startScrollTop - (mid.y - panStateRef.current.startMidY);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        pinchStateRef.current = null;
        panStateRef.current = null;
      }
    }

    // passive: false is required so preventDefault() above actually suppresses native scroll/zoom instead of silently no-opping.
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  function zoomBy(delta: number) {
    setScale((prev) => clampScale(prev + delta));
  }

  function resetView() {
    setScale(1);
    containerRef.current?.scrollTo({ left: 0, top: 0 });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 self-end">
        <button
          type="button"
          onClick={() => zoomBy(-SCALE_STEP)}
          title="ย่อขนาด (Zoom Out)"
          className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 bg-white text-lg font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:h-10 lg:w-10"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          title="รีเซ็ตขนาดและตำแหน่ง (Reset Zoom)"
          className="h-11 min-w-14 rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:h-10"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomBy(SCALE_STEP)}
          title="ขยายขนาด (Zoom In)"
          className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 bg-white text-lg font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:h-10 lg:w-10"
        >
          +
        </button>
      </div>

      <div
        ref={containerRef}
        // UX/UI fix: a stable hook GridLadderEditor's drag handlers can find via document.querySelector to auto-scroll this container when a port/block drag nears its edge - without it, connecting across a wide program (e.g. a far-left contact to the rightmost output column) needs the pointer to be over a target that's scrolled out of view, which is physically impossible in one continuous drag.
        data-grid-canvas-scroll="true"
        className="max-h-[70vh] touch-pan-x touch-pan-y overflow-auto rounded-lg border border-zinc-200 bg-zinc-100/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/30"
      >
        <div style={naturalSize ? { width: naturalSize.width * scale, height: naturalSize.height * scale } : undefined}>
          <div ref={contentRef} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "max-content" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
