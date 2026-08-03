/** Compass heading the robot faces - N is "up" on the grid (toward row 0), rotating clockwise. */
export type Direction = "N" | "E" | "S" | "W";

/** What a single maze cell is - Wall blocks movement, Path is open floor, Goal is the win condition, Hazard fails the level if entered. */
export type MazeTile = "WALL" | "PATH" | "GOAL" | "HAZARD";

/** Row-major 2D map: `map[row][col]`. */
export type MazeMap = MazeTile[][];

/** The robot's live position/heading - `x` is column, `y` is row, both 0-indexed. */
export type MazeRobotState = { x: number; y: number; direction: Direction };

/** Degrees to rotate the robot's facing indicator, clockwise from pointing "up" (N). */
export const DIRECTION_ROTATION_DEG: Record<Direction, number> = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
};

/** Turns 90° clockwise from the given heading (N->E->S->W->N) - Y1/Y2 in the PLC I/O binding map to this. */
export function turnRight(direction: Direction): Direction {
  const order: Direction[] = ["N", "E", "S", "W"];
  return order[(order.indexOf(direction) + 1) % 4];
}

/** Turns 90° counter-clockwise from the given heading. */
export function turnLeft(direction: Direction): Direction {
  const order: Direction[] = ["N", "E", "S", "W"];
  return order[(order.indexOf(direction) + 3) % 4];
}

/** The (dx, dy) a forward move applies for each heading - moving "forward" while facing N decreases row (y), E increases column (x), etc. */
export const DIRECTION_DELTA: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

/** The cell one step forward of `robot`, without bounds/wall checking - callers combine this with `readMazeTile`/map bounds to decide whether a move is actually legal. */
export function cellAhead(robot: MazeRobotState): { x: number; y: number } {
  const { dx, dy } = DIRECTION_DELTA[robot.direction];
  return { x: robot.x + dx, y: robot.y + dy };
}

/** Safe tile lookup - out-of-bounds reads as a Wall (can't move off the map edge), matching how a real ultrasonic/bump sensor would report the map boundary. */
export function readMazeTile(map: MazeMap, x: number, y: number): MazeTile {
  const row = map[y];
  if (!row) return "WALL";
  return row[x] ?? "WALL";
}
