"use client";

import { memo, useMemo } from "react";
import { DIRECTION_ROTATION_DEG, type MazeMap, type MazeRobotState } from "@/lib/games/maze-types";

const TILE_CLASSES: Record<string, string> = {
  WALL: "bg-zinc-700 dark:bg-zinc-800",
  PATH: "bg-zinc-100 dark:bg-zinc-900",
  GOAL: "bg-emerald-200 dark:bg-emerald-900",
  HAZARD: "bg-red-200 dark:bg-red-950",
};

/**
 * Lightweight Puzzle & Navigation engine - a pure CSS Grid, no canvas/WebGL,
 * so it stays cheap on both mobile and desktop. Purely presentational: given
 * a `map` and the robot's current `(x, y, direction)`, it renders the board.
 * Movement/turning logic (and the PLC I/O binding that drives it) lives
 * elsewhere (useGamePlcBridge) - this component never mutates its own state.
 *
 * Task 7 (perf): the tile layer is built once via `useMemo`, keyed only on
 * `map`/`safeCellSize` - not `robot`. `map` never changes during a run (only
 * the robot's position/direction do, once per tick), but the OLD version
 * re-mapped and re-rendered every single tile `<div>` on every tick anyway,
 * since the robot marker was interleaved into each cell's own children (a
 * `row.x === x && row.y === y` check against every cell). On the largest
 * maze tier (51x51 = 2601 cells) that meant 2601 element re-creations +
 * reconciliations per tick just to move one marker. The robot is now a
 * single extra grid item placed via `gridRow`/`gridColumn` (CSS Grid lines
 * are 1-indexed) on top of the same grid - it lands in the exact same cell
 * a pixel-offset overlay would, without hand-computing gap/padding math,
 * and it's the only thing that actually re-renders per tick.
 */
function MazeEngine({
  map,
  robot,
  cellSize = 40,
}: {
  map: MazeMap;
  robot: MazeRobotState;
  /** Pixel size of one square cell - the whole board scales from this, so a smaller value fits more of a large map on a phone screen. */
  cellSize?: number;
}) {
  const rows = map.length;
  const cols = map[0]?.length ?? 0;
  // Guards against a caller passing through a transient/invalid value (e.g.
  // NaN) - the CSS fontSize style would otherwise silently fail to apply.
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 40;

  const tiles = useMemo(
    () =>
      map.map((row, y) =>
        row.map((tile, x) => (
          <div
            key={`${x}-${y}`}
            role="gridcell"
            className={`relative flex items-center justify-center ${TILE_CLASSES[tile] ?? TILE_CLASSES.PATH}`}
          >
            {tile === "GOAL" && <span className="text-xs">🏁</span>}
            {tile === "HAZARD" && <span className="text-xs">⚠️</span>}
          </div>
        ))
      ),
    [map]
  );

  return (
    <div
      role="grid"
      aria-label="Maze"
      className="inline-grid gap-0.5 rounded-lg border border-zinc-300 bg-zinc-200 p-1 dark:border-zinc-700 dark:bg-zinc-950"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${safeCellSize}px)`,
        gridTemplateRows: `repeat(${rows}, ${safeCellSize}px)`,
      }}
    >
      {tiles}
      <span
        className="flex items-center justify-center text-blue-600 transition-transform duration-150 dark:text-blue-400"
        style={{
          gridRow: robot.y + 1,
          gridColumn: robot.x + 1,
          transform: `rotate(${DIRECTION_ROTATION_DEG[robot.direction]}deg)`,
          fontSize: safeCellSize * 0.6,
        }}
        title={`Robot facing ${robot.direction}`}
      >
        ▲
      </span>
    </div>
  );
}

/** Bails the whole component (including re-checking the `tiles` useMemo's own deps) on a tick where the robot legitimately didn't move/turn - maze-plc-binding.ts's step() returns the SAME state object when a command is rejected (e.g. blocked by a wall) or no output fires, but compares by value regardless rather than assuming that implementation detail. */
function mazeEnginePropsEqual(prev: Parameters<typeof MazeEngine>[0], next: Parameters<typeof MazeEngine>[0]): boolean {
  return (
    prev.map === next.map &&
    prev.cellSize === next.cellSize &&
    prev.robot.x === next.robot.x &&
    prev.robot.y === next.robot.y &&
    prev.robot.direction === next.robot.direction
  );
}

export default memo(MazeEngine, mazeEnginePropsEqual);
