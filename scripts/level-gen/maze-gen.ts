/**
 * Procedural perfect-maze generator + solver-verification helpers, for any
 * ODD tile size (9x9, 11x11, ..., 21x21), shared by generate-maze-9x9.ts
 * (legacy, fixed 9x9) and generate-maze-50.ts (new 50-level track,
 * progressive 9x9->21x21).
 *
 * A size x size tile grid (size = 2*rooms-1) is a doubled-resolution
 * rooms x rooms "room" grid: rooms live at even (x,y), the odd cells
 * between adjacent rooms are corridor tiles that get carved to PATH
 * exactly when that passage is part of the spanning tree. A randomized
 * DFS backtracker over the rooms x rooms room graph produces a genuine
 * perfect maze (a tree - exactly one path between any two rooms, no
 * loops), which is the one property that makes the "prefer right when
 * clear, else left" wall-following rule (Pattern D, proven across every
 * earlier maze batch this session) a GUARANTEED solve, not a
 * probabilistic one - a maze with loops can strand wall-following on an
 * island that never reaches the goal, so this generator deliberately
 * never produces one for the real solution path.
 *
 * Hazard levels add exactly one dead-end spur (never part of the solving
 * tree) off a junction on the true path, placed and verified via
 * simulation, not hand-reasoning: a level only ships once the correct
 * Pattern D program reaches GOAL with the hazard in place - see
 * generateHazardMaze's own comment for why a "swapped wiring" reachability
 * proof was tried and dropped.
 */
import type { Direction, MazeMap, MazeRobotState, MazeTile } from "../../src/lib/games/maze-types";
import { createMazeGameState, mazeBinding } from "../../src/lib/games/maze-plc-binding";
import { runGridScan } from "../../src/lib/ladder/grid-engine";
import { createEmptyMemory } from "../../src/lib/ladder/types";
import { COIL_COLUMN, type GridProgram } from "../../src/lib/ladder/grid-types";
import { evaluateGameLevelTick, type GameRunState } from "../../src/lib/games/evaluate-game-level";
import type { GameLevelSpec } from "../../src/lib/games/game-level-types";
import { NO, NC, COIL, grid as buildGrid, place, wireH, feedLeftRail, tieVertical, program, seriesRung } from "./grid-builders";

/** Deterministic PRNG (mulberry32) so a "bad" maze can be reproduced/debugged, and so the whole batch is reproducible from one base seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RoomPos = { rx: number; ry: number };
type Passages = Set<string>; // "rx,ry-rx2,ry2" normalized

function passageKey(a: RoomPos, b: RoomPos): string {
  const [p, q] = [a, b].sort((m, n) => m.rx - n.rx || m.ry - n.ry);
  return `${p.rx},${p.ry}-${q.rx},${q.ry}`;
}

const ROOM_DIRS: { dx: number; dy: number }[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** Randomized DFS backtracker over the rooms x rooms room graph - a spanning tree, i.e. a perfect maze. */
function generateSpanningTree(rng: () => number, rooms: number): Passages {
  const visited = new Set<string>();
  const passages: Passages = new Set();
  const stack: RoomPos[] = [{ rx: 0, ry: 0 }];
  visited.add("0,0");

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = ROOM_DIRS.map((d) => ({ rx: current.rx + d.dx, ry: current.ry + d.dy })).filter(
      (n) => n.rx >= 0 && n.rx < rooms && n.ry >= 0 && n.ry < rooms && !visited.has(`${n.rx},${n.ry}`)
    );
    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }
    const next = neighbors[Math.floor(rng() * neighbors.length)];
    passages.add(passageKey(current, next));
    visited.add(`${next.rx},${next.ry}`);
    stack.push(next);
  }
  return passages;
}

function roomsAdjacent(a: RoomPos, b: RoomPos): boolean {
  return passages_has(a, b);
}
function passages_has(a: RoomPos, b: RoomPos): boolean {
  return Math.abs(a.rx - b.rx) + Math.abs(a.ry - b.ry) === 1;
}

/** BFS over the room graph (using the spanning tree) to find distances from a start room - used to pick a goal at (roughly) a target difficulty. */
function bfsDistances(passages: Passages, start: RoomPos, rooms: number): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(`${start.rx},${start.ry}`, 0);
  const queue: RoomPos[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(`${cur.rx},${cur.ry}`)!;
    for (const dir of ROOM_DIRS) {
      const n = { rx: cur.rx + dir.dx, ry: cur.ry + dir.dy };
      if (n.rx < 0 || n.rx >= rooms || n.ry < 0 || n.ry >= rooms) continue;
      if (!roomsAdjacent(cur, n) || !passages.has(passageKey(cur, n))) continue;
      const key = `${n.rx},${n.ry}`;
      if (dist.has(key)) continue;
      dist.set(key, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

function roomToTile(r: RoomPos): { x: number; y: number } {
  return { x: r.rx * 2, y: r.ry * 2 };
}

function buildTileGrid(passages: Passages, rooms: number): MazeTile[][] {
  const tiles = rooms * 2 - 1;
  const grid: MazeTile[][] = Array.from({ length: tiles }, () => Array<MazeTile>(tiles).fill("WALL"));
  for (let ry = 0; ry < rooms; ry++) {
    for (let rx = 0; rx < rooms; rx++) {
      const t = roomToTile({ rx, ry });
      grid[t.y][t.x] = "PATH";
    }
  }
  for (const key of passages) {
    const [a, b] = key.split("-").map((s) => {
      const [x, y] = s.split(",").map(Number);
      return { rx: x, ry: y };
    });
    const ta = roomToTile(a);
    const tb = roomToTile(b);
    const mx = (ta.x + tb.x) / 2;
    const my = (ta.y + tb.y) / 2;
    grid[my][mx] = "PATH";
  }
  return grid;
}

/** Exported (Task 4c) so new tier scripts (generate-maze-massive.ts) can reuse the canonical hazard-aware circuit instead of hand-duplicating it a third time. */
export const decisionProgram: GridProgram = buildDecisionProgram();
const swappedProgram: GridProgram = buildDecisionProgram(true);

/**
 * Task 4b: "Pattern D+H" - hazard-aware wall-following. Ahead being blocked
 * is no longer read straight off X0 (wallAhead) - a HAZARD tile reads as
 * "not a wall" to X0 by design (maze-plc-binding.ts's readMazeTile check is
 * strictly === "WALL"), so a pre-Task-4b circuit that only ever wired X0
 * would see ahead as clear and walk straight into a hazard. M0 computes the
 * real "ahead blocked" condition as X0 OR X3 (hazardAhead) via a genuine
 * parallel-contact branch (first grid below), and every downstream
 * forward/turn decision reads M0 instead of X0 directly - forcing X3 to
 * actually be wired for a maze with a hazard on the solve path's own
 * turning points to be solvable at all (see generateHazardMaze).
 */
function buildDecisionProgram(swapped = false): GridProgram {
  const rightAddr = swapped ? "Y1" : "Y2";
  const leftAddr = swapped ? "Y2" : "Y1";

  const blocked = buildGrid("blocked", 2);
  place(blocked, 0, 0, NO("X0"));
  place(blocked, 1, 0, NO("X3"));
  wireH(blocked, 0, 0, 1);
  wireH(blocked, 1, 0, 1);
  tieVertical(blocked, 0, 1);
  wireH(blocked, 0, 1, COIL_COLUMN);
  place(blocked, 0, COIL_COLUMN, COIL("M0"));
  feedLeftRail(blocked, 0);
  feedLeftRail(blocked, 1);

  const forward = seriesRung("forward", [NC("M0")], COIL("Y0"));
  const turnRight = seriesRung("turnRight", [NO("M0"), NC("X2")], COIL(rightAddr));
  const turnLeft = seriesRung("turnLeft", [NO("M0"), NO("X2")], COIL(leftAddr));

  return program(blocked, forward, turnRight, turnLeft);
}

/** Pre-Task-4b reference circuit (X0-only, never wires X3) - kept solely so generateHazardMaze can assert a hazard it just placed actually defeats an old-style circuit, proving the mechanic is load-bearing rather than decorative. Never shipped. */
function buildLegacyDecisionProgram(): GridProgram {
  const forward = seriesRung("forward", [NC("X0")], COIL("Y0"));
  const turnRight = seriesRung("turnRight", [NO("X0"), NC("X2")], COIL("Y2"));
  const turnLeft = seriesRung("turnLeft", [NO("X0"), NO("X2")], COIL("Y1"));
  return program(forward, turnRight, turnLeft);
}
const legacyDecisionProgram: GridProgram = buildLegacyDecisionProgram();

const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};
const TURN_RIGHT: Record<string, string> = { N: "E", E: "S", S: "W", W: "N" };
const TURN_LEFT: Record<string, string> = { N: "W", W: "S", S: "E", E: "N" };

type TurnPoint = { x: number; y: number; direction: Direction; wrongDx: number; wrongDy: number; chosenRight: boolean };

/** Replays the correct solution and records, at every tick a turn command fires, the position and the direction NOT taken - candidate hazard-spur locations, in path order (earliest first). */
export function recordTurnPoints(map: MazeMap, start: MazeRobotState, maxTicks: number): TurnPoint[] {
  const spec: GameLevelSpec = {
    levelNumber: 0,
    gameType: "MAZE",
    title: "measure",
    description: "measure",
    mapLayout: map,
    robotStart: start,
    successConditions: [{ kind: "reach_goal" }],
  };
  let run: GameRunState = { maze: createMazeGameState(map, start) };
  let memory = createEmptyMemory();
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  const turns: TurnPoint[] = [];
  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const { inputs, analogInputs } = mazeBinding.readInputs(run.maze!);
    const { memory: nextMemory } = runGridScan(decisionProgram, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    const robotBefore = run.maze!.robot;
    if (nextMemory.coils.Y2 || nextMemory.coils.Y1) {
      const chosenRight = !!nextMemory.coils.Y2;
      const wrongHeading = chosenRight ? TURN_LEFT[robotBefore.direction] : TURN_RIGHT[robotBefore.direction];
      const d = DIR_DELTA[wrongHeading];
      turns.push({ x: robotBefore.x, y: robotBefore.y, direction: robotBefore.direction, wrongDx: d.dx, wrongDy: d.dy, chosenRight });
    }
    run = { maze: mazeBinding.step(run.maze!, nextMemory.coils, nextMemory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, nextMemory, analogInputs, tick);
  }
  return turns;
}

function simulate(map: MazeMap, start: MazeRobotState, program: GridProgram, maxTicks: number): { won: boolean; failed: boolean; ticks: number } {
  const spec: GameLevelSpec = {
    levelNumber: 0,
    gameType: "MAZE",
    title: "measure",
    description: "measure",
    mapLayout: map,
    robotStart: start,
    successConditions: [{ kind: "reach_goal" }],
  };
  let run: GameRunState = { maze: createMazeGameState(map, start) };
  let memory = createEmptyMemory();
  let outcome = evaluateGameLevelTick(spec, run, {}, memory, {}, 0);
  let tick = 0;
  while (outcome.status === "playing" && tick < maxTicks) {
    tick++;
    const { inputs, analogInputs } = mazeBinding.readInputs(run.maze!);
    const { memory: nextMemory } = runGridScan(program, inputs, memory, { tick: true }, analogInputs);
    memory = nextMemory;
    run = { maze: mazeBinding.step(run.maze!, memory.coils, memory) };
    outcome = evaluateGameLevelTick(spec, run, inputs, memory, analogInputs, tick);
  }
  return { won: outcome.status === "won", failed: outcome.status === "failed", ticks: tick };
}

export type GeneratedMaze = { map: MazeMap; start: MazeRobotState; solveTicks: number };

/** Debug helper (not used by the real generators, which call `simulate` directly with the module-level programs). */
export function simulateExport(map: MazeMap, start: MazeRobotState, swapped: boolean, maxTicks: number) {
  return simulate(map, start, swapped ? swappedProgram : decisionProgram, maxTicks);
}

/**
 * Generates a size x size perfect maze (size must be odd - 9, 11, 13, ...)
 * whose true solve length (in ticks, via the real Pattern D solver) falls
 * within [minTicks, maxTicks] - the difficulty knob - retrying with new
 * seeds until one fits. Goal is chosen from the room farthest from the
 * start among candidates that hit the target band, so later levels in a
 * chapter get further (harder) goals without ever exceeding the fixed
 * size x size footprint.
 */
export function generateDifficultyMaze(seed: number, size: number, minTicks: number, maxTicks: number, maxAttempts = 500): GeneratedMaze {
  if (size < 3 || size % 2 === 0) throw new Error(`generateDifficultyMaze: size must be odd and >=3 (got ${size})`);
  const rooms = (size + 1) / 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(seed + attempt * 7919);
    const passages = generateSpanningTree(rng, rooms);
    const grid = buildTileGrid(passages, rooms);
    // Face the robot toward whichever passage the start room (0,0) - a
    // corner, with both its N and W sides always off-grid - actually
    // has, instead of hardcoding East. Starting E when the tree's only
    // exit from (0,0) is South means the very first tick already faces
    // a wall, forcing a decision at the corner itself - and turning
    // "left" from East is North, permanently off-grid at y=0. That
    // structurally poisons every hazard placement at the first turn
    // (confirmed empirically - see the scratch _debug-hazard3.ts
    // session this was diagnosed with), not just a bad-seed fluke.
    const hasEastPassage = passages.has(passageKey({ rx: 0, ry: 0 }, { rx: 1, ry: 0 }));
    const start: MazeRobotState = { x: 0, y: 0, direction: hasEastPassage ? "E" : "S" };
    const dist = bfsDistances(passages, { rx: 0, ry: 0 }, rooms);

    // Try candidate goal rooms sorted by room-distance descending, so we
    // prefer the hardest goal that still fits the tick band.
    const candidates = [...dist.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key] of candidates) {
      const [rx, ry] = key.split(",").map(Number);
      if (rx === 0 && ry === 0) continue;
      const map = grid.map((r) => [...r]) as MazeMap;
      const goalTile = roomToTile({ rx, ry });
      map[goalTile.y][goalTile.x] = "GOAL";

      const result = simulate(map, start, decisionProgram, maxTicks + 10);
      if (result.won && result.ticks >= minTicks && result.ticks <= maxTicks) {
        return { map, start, solveTicks: result.ticks };
      }
    }
  }
  throw new Error(`generateDifficultyMaze: no maze found in [${minTicks},${maxTicks}] ticks after ${maxAttempts} attempts (seed ${seed})`);
}

/**
 * Task 4b redesign: same as generateDifficultyMaze, but retags the WALL
 * tile directly AHEAD of one recorded turn point as HAZARD instead of
 * carving a new dead-end spur. This is the tile Pattern D+H's own turn
 * decision fires on (X0/X3 -> M0 -> turn), so it's guaranteed to sit ON
 * the real solve path rather than off to the side of it - the prior
 * design (see git history) placed the hazard on the turn's NOT-taken
 * side, which the reference circuit structurally never approached,
 * making the sensor decorative (every level solvable by the exact same
 * X0-only circuit regardless of hazard placement). Retagging the ahead
 * tile keeps the maze's perfect-tree topology and difficulty untouched
 * (same tile, same WALL->HAZARD swap, no new passages) while requiring
 * X3 to be wired for the level to be solvable at all: X0 alone reads a
 * HAZARD tile as clear (readMazeTile's === "WALL" check), so a
 * legacyDecisionProgram-style circuit drives forward and fails - asserted
 * below rather than assumed, since that assertion is the whole point of
 * this mechanic.
 */
export function generateHazardMaze(seed: number, size: number, minTicks: number, maxTicks: number, maxAttempts = 500): GeneratedMaze {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const base = (() => {
      try {
        return generateDifficultyMaze(seed + attempt * 104729, size, minTicks, maxTicks, 1);
      } catch {
        return null;
      }
    })();
    if (!base) continue;

    const { map, start } = base;
    const turns = recordTurnPoints(map, start, maxTicks + 10);
    for (const t of turns) {
      const d = DIR_DELTA[t.direction];
      const nx = t.x + d.dx;
      const ny = t.y + d.dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      if (map[ny][nx] !== "WALL") continue;
      const hazardMap = map.map((r) => [...r]) as MazeMap;
      hazardMap[ny][nx] = "HAZARD";

      const correct = simulate(hazardMap, start, decisionProgram, maxTicks + 10);
      if (!correct.won) continue;

      const legacy = simulate(hazardMap, start, legacyDecisionProgram, maxTicks + 10);
      if (legacy.won) {
        throw new Error(
          `generateHazardMaze: hazard at (${nx},${ny}) did not defeat the legacy X0-only circuit - mechanic isn't load-bearing here (seed ${seed})`
        );
      }

      return { map: hazardMap, start, solveTicks: correct.ticks };
    }
  }
  throw new Error(`generateHazardMaze: no valid hazard placement found after ${maxAttempts} attempts (seed ${seed})`);
}
