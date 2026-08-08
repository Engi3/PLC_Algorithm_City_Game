import { clampAnalogValue, type AnalogInputs, type Inputs } from "@/lib/ladder/types";
import type { GamePlcBinding } from "./use-game-plc-bridge";
import { cellAhead, readMazeTile, turnLeft, turnRight, type MazeMap, type MazeRobotState } from "./maze-types";

export type MazeGameState = {
  robot: MazeRobotState;
  map: MazeMap;
  /** Reaching GOAL wins, entering HAZARD fails - both are unambiguous consequences of the tile types themselves (maze-types.ts), not a per-level rule, so the binding owns this transition directly (contrast factoryBinding, where "processed enough items" is a per-level parameter the Task 3 evaluator owns instead). Once set, the binding freezes the robot in place - matches a real E-stop latch. */
  status: "playing" | "won" | "failed";
};

export function createMazeGameState(map: MazeMap, start: MazeRobotState): MazeGameState {
  return { map, robot: start, status: "playing" };
}

/**
 * Goal-tile positions cached per map object. A run's map reference never
 * mutates (only the robot moves), so scanning once and reusing across every
 * tick avoids an O(size^2) rescan per scan-cycle - matters once mazes scale
 * past 21x21, since generation itself simulates hundreds of full runs.
 */
const goalCache = new WeakMap<MazeMap, { x: number; y: number }[]>();

function findGoals(map: MazeMap): { x: number; y: number }[] {
  const cached = goalCache.get(map);
  if (cached) return cached;
  const goals: { x: number; y: number }[] = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === "GOAL") goals.push({ x, y });
    }
  }
  goalCache.set(map, goals);
  return goals;
}

/** Manhattan distance from the robot to the nearest GOAL tile - what AI0 reports. 0 if the map has no goal tile (a malformed level, but readInputs still needs to return something). */
function distanceToGoal(map: MazeMap, robot: MazeRobotState): number {
  let best = Infinity;
  for (const goal of findGoals(map)) {
    best = Math.min(best, Math.abs(goal.x - robot.x) + Math.abs(goal.y - robot.y));
  }
  return Number.isFinite(best) ? best : 0;
}

/** Address set a maze binding reads/writes - see buildBinding below. */
type MazeAddresses = {
  wallAhead: string;
  wallLeft: string;
  wallRight: string;
  /** Task 4b: true when the tile directly ahead is HAZARD (not WALL) - a circuit that only checks wallAhead never sees this and walks straight in, since HAZARD tiles read as "not a wall" to wallAhead by design (see readMazeTile's strict === "WALL" check below). Forces genuinely checking this sensor rather than reusing a pre-hazard wall-following circuit unchanged. */
  hazardAhead: string;
  distance: string;
  forward: string;
  turnLeft: string;
  turnRight: string;
};

/** Standalone Maze Explorer track's addresses - X3 (hazardAhead) added Task 4b, X0-X2/Y0-Y2/AI0 unchanged since the track's launch. */
export const MAZE_ADDR: MazeAddresses = {
  wallAhead: "X0",
  wallLeft: "X1",
  wallRight: "X2",
  hazardAhead: "X3",
  distance: "AI0",
  forward: "Y0",
  turnLeft: "Y1",
  turnRight: "Y2",
};

/**
 * Hybrid track's Maze/AGV addresses - deliberately DISTINCT from
 * MAZE_ADDR (and from every Factory address factory-plc-binding.ts uses:
 * X0-X1/Y0-Y7/AI1-AI3), so a Hybrid level's combined circuit never has to
 * reason about the same PLC address meaning two different physical things
 * depending on which phase is currently live. See io-tables.ts's
 * HYBRID_MAZE_IO_ROWS for the matching reference table.
 */
export const HYBRID_MAZE_ADDR: MazeAddresses = {
  wallAhead: "X10",
  wallLeft: "X11",
  wallRight: "X12",
  hazardAhead: "X13",
  distance: "AI10",
  forward: "Y10",
  turnLeft: "Y11",
  turnRight: "Y12",
};

/**
 * Builds a Maze GamePlcBinding against a given address set. If a student's
 * ladder logic energizes more than one output in the same scan (easy to do
 * by accident), `forward` takes priority over turnLeft/turnRight - a
 * deterministic tie-break beats an undefined one. A move into a Wall is
 * refused outright rather than trusting `wallAhead` to have been wired into
 * an interlock - the robot can't clip through geometry just because a
 * student forgot the safety check, same as a real motor's hard limit switch.
 */
function buildBinding(addr: MazeAddresses): GamePlcBinding<MazeGameState> {
  return {
    readInputs(state) {
      const { map, robot } = state;
      const ahead = cellAhead(robot);
      const left = cellAhead({ ...robot, direction: turnLeft(robot.direction) });
      const right = cellAhead({ ...robot, direction: turnRight(robot.direction) });

      const inputs: Inputs = {
        [addr.wallAhead]: readMazeTile(map, ahead.x, ahead.y) === "WALL",
        [addr.wallLeft]: readMazeTile(map, left.x, left.y) === "WALL",
        [addr.wallRight]: readMazeTile(map, right.x, right.y) === "WALL",
        [addr.hazardAhead]: readMazeTile(map, ahead.x, ahead.y) === "HAZARD",
      };
      const analogInputs: AnalogInputs = { [addr.distance]: clampAnalogValue(distanceToGoal(map, robot)) };
      return { inputs, analogInputs };
    },

    step(state, outputs) {
      if (state.status !== "playing") return state;
      const { map, robot } = state;

      if (outputs[addr.forward]) {
        const ahead = cellAhead(robot);
        const tile = readMazeTile(map, ahead.x, ahead.y);
        if (tile === "WALL") return state;
        const nextRobot = { ...robot, x: ahead.x, y: ahead.y };
        if (tile === "HAZARD") return { ...state, robot: nextRobot, status: "failed" };
        if (tile === "GOAL") return { ...state, robot: nextRobot, status: "won" };
        return { ...state, robot: nextRobot };
      }
      if (outputs[addr.turnLeft]) return { ...state, robot: { ...robot, direction: turnLeft(robot.direction) } };
      if (outputs[addr.turnRight]) return { ...state, robot: { ...robot, direction: turnRight(robot.direction) } };
      return state;
    },
  };
}

/** Standalone Maze Explorer track binding - X0-X2/Y0-Y2/AI0, unchanged. */
export const mazeBinding: GamePlcBinding<MazeGameState> = buildBinding(MAZE_ADDR);

/** Hybrid track's Maze/AGV binding - X10-X12/Y10-Y12/AI10, never overlaps Factory's addresses. */
export const hybridMazeBinding: GamePlcBinding<MazeGameState> = buildBinding(HYBRID_MAZE_ADDR);
