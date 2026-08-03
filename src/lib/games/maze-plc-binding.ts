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

/** Manhattan distance from the robot to the nearest GOAL tile - what AI0 reports. 0 if the map has no goal tile (a malformed level, but readInputs still needs to return something). */
function distanceToGoal(map: MazeMap, robot: MazeRobotState): number {
  let best = Infinity;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === "GOAL") best = Math.min(best, Math.abs(x - robot.x) + Math.abs(y - robot.y));
    }
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * Standardized Maze I/O map:
 *   Inputs:  X0 wall ahead, X1 wall to the left, X2 wall to the right, AI0 Manhattan distance to goal
 *   Outputs: Y0 move forward one cell, Y1 turn left 90°, Y2 turn right 90°
 * If a student's ladder logic energizes more than one output in the same
 * scan (easy to do by accident), Y0 takes priority over Y1/Y2 - a
 * deterministic tie-break beats an undefined one. A move into a Wall is
 * refused outright rather than trusting X0 to have been wired into an
 * interlock - the robot can't clip through geometry just because a student
 * forgot the safety check, same as a real motor's hard limit switch.
 */
export const mazeBinding: GamePlcBinding<MazeGameState> = {
  readInputs(state) {
    const { map, robot } = state;
    const ahead = cellAhead(robot);
    const left = cellAhead({ ...robot, direction: turnLeft(robot.direction) });
    const right = cellAhead({ ...robot, direction: turnRight(robot.direction) });

    const inputs: Inputs = {
      X0: readMazeTile(map, ahead.x, ahead.y) === "WALL",
      X1: readMazeTile(map, left.x, left.y) === "WALL",
      X2: readMazeTile(map, right.x, right.y) === "WALL",
    };
    const analogInputs: AnalogInputs = { AI0: clampAnalogValue(distanceToGoal(map, robot)) };
    return { inputs, analogInputs };
  },

  step(state, outputs) {
    if (state.status !== "playing") return state;
    const { map, robot } = state;

    if (outputs.Y0) {
      const ahead = cellAhead(robot);
      const tile = readMazeTile(map, ahead.x, ahead.y);
      if (tile === "WALL") return state;
      const nextRobot = { ...robot, x: ahead.x, y: ahead.y };
      if (tile === "HAZARD") return { ...state, robot: nextRobot, status: "failed" };
      if (tile === "GOAL") return { ...state, robot: nextRobot, status: "won" };
      return { ...state, robot: nextRobot };
    }
    if (outputs.Y1) return { ...state, robot: { ...robot, direction: turnLeft(robot.direction) } };
    if (outputs.Y2) return { ...state, robot: { ...robot, direction: turnRight(robot.direction) } };
    return state;
  },
};
