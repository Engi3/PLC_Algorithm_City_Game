"use client";

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
 */
export default function MazeEngine({
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
      {map.map((row, y) =>
        row.map((tile, x) => (
          <div
            key={`${x}-${y}`}
            role="gridcell"
            className={`relative flex items-center justify-center ${TILE_CLASSES[tile] ?? TILE_CLASSES.PATH}`}
          >
            {tile === "GOAL" && <span className="text-xs">🏁</span>}
            {tile === "HAZARD" && <span className="text-xs">⚠️</span>}
            {robot.x === x && robot.y === y && (
              <span
                className="absolute flex items-center justify-center text-blue-600 transition-transform duration-150 dark:text-blue-400"
                style={{ transform: `rotate(${DIRECTION_ROTATION_DEG[robot.direction]}deg)`, fontSize: safeCellSize * 0.6 }}
                title={`Robot facing ${robot.direction}`}
              >
                ▲
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
