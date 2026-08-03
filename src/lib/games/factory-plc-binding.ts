import { clampAnalogValue, type AnalogInputs, type Inputs } from "@/lib/ladder/types";
import type { GamePlcBinding } from "./use-game-plc-bridge";
import type { ConveyorItem, FactoryState } from "./factory-types";

/**
 * FactoryState (Task 1) plus the running counters a level's PLC logic can
 * react to (packaging levels count up to a target). Deliberately has no
 * `status`/win-fail field, unlike MazeGameState - "processed enough items"
 * and "which safety faults end the level" are per-level parameters the
 * Task 3 evaluator owns (it reads `processedCount`/`rejectedCount`/
 * `temperature` from here), not something this generic binding can decide
 * for every level on its own.
 */
export type FactoryGameState = FactoryState & {
  processedCount: number;
  rejectedCount: number;
  /** Sorting-robot bookkeeping - only ever incremented for items carrying a `category` (new levels); always 0 for every original Factory level. */
  sortedCorrectCount: number;
  sortedWrongCount: number;
  /** Reversible-conveyor bookkeeping - an item that rides off the spawn end while running in reverse. */
  returnedCount: number;
};

export function createFactoryGameState(base: FactoryState): FactoryGameState {
  return { ...base, processedCount: 0, rejectedCount: 0, sortedCorrectCount: 0, sortedWrongCount: 0, returnedCount: 0 };
}

const ITEM_SPEED_PER_TICK = 3;
const SENSOR_POSITION = 55;
const SENSOR_WINDOW = 3;
const PUSHER_POSITION = 78;
const PUSHER_WINDOW = 4;
/** Sorting robot's own diversion station - deliberately upstream of the existing pusher, so an item never sits in both windows the same tick. Bin assignment: undiverted (reaches the end) -> bin 0, robot arm (Y3) -> bin 1, pusher (Y1) -> bin 2. */
const ROBOT_POSITION = 60;
const ROBOT_WINDOW = 4;
/** Traffic-light gate - only enforced when `state.gateEnabled` is true (see factory-types.ts). */
const GATE_POSITION = 35;
/** No output in the standardized map controls the tank inlet (only conveyor/pusher/heater) - it fills automatically, same as a gravity-fed real process; the PLC's actual job is reacting to AI1/AI2, not running the inlet. */
const TANK_FILL_PER_TICK = 40;
const HEATER_RISE_PER_TICK = 60;
const COOLING_PER_TICK = 15;

function itemAt(items: ConveyorItem[], center: number, window: number): ConveyorItem | undefined {
  return items.find((item) => !item.rejected && Math.abs(item.position - center) <= window);
}

/**
 * Standardized Factory I/O map:
 *   Inputs:  X0 item detect sensor, X1 color/size (defect) sensor, AI1 tank level, AI2 temperature
 *   Outputs: Y0 conveyor motor, Y1 pusher/valve, Y2 heater
 * X0/X1 both read whichever item currently sits in the fixed sensor window
 * partway along the belt - a real inline sensor reports on whatever's in
 * front of it right now, not a specific item by identity. The pusher fires
 * on ANY item passing its own window while Y1 is held, defective or not
 * (same "the PLC decides, physics doesn't pre-filter" principle as Maze's
 * wall-ahead check) - a level whose logic pushes a good item off the line
 * has genuinely misprogrammed it, and should read as a fault later, not be
 * silently corrected here.
 *
 * Extended map for the 3 new mechanics (Factory levels that opt in only -
 * see factory-types.ts for why every one of these is safe no-op for the 40
 * original levels):
 *   AI3 category (0/1/2) of the item in the sensor window - sorting robot
 *   Y3  robot arm - diverts to bin 1 at ROBOT_POSITION (upstream of Y1's pusher, which becomes bin 2)
 *   Y4  reverse - conveyor runs backward instead of forward while Y0 is held
 *   Y5/Y6/Y7  red/yellow/green traffic light - Y7 (green) opens the GATE_POSITION gate; only enforced when state.gateEnabled
 */
export const factoryBinding: GamePlcBinding<FactoryGameState> = {
  readInputs(state) {
    const sensedItem = itemAt(state.items, SENSOR_POSITION, SENSOR_WINDOW);
    const inputs: Inputs = {
      X0: !!sensedItem,
      X1: !!sensedItem?.defective,
    };
    const analogInputs: AnalogInputs = {
      AI1: clampAnalogValue(state.tankLevel),
      AI2: clampAnalogValue(state.temperature),
      AI3: clampAnalogValue(sensedItem?.category ?? 0),
    };
    return { inputs, analogInputs };
  },

  step(state, outputs) {
    const conveyorRunning = !!outputs.Y0;
    const pusherExtended = !!outputs.Y1;
    const heaterOn = !!outputs.Y2;
    const robotArmExtended = !!outputs.Y3;
    const conveyorReversed = !!outputs.Y4;
    const redOn = !!outputs.Y5;
    const yellowOn = !!outputs.Y6;
    const greenOn = !!outputs.Y7;
    const gateBlocking = !!state.gateEnabled && !greenOn;

    const robotPushedItem = robotArmExtended ? itemAt(state.items, ROBOT_POSITION, ROBOT_WINDOW) : undefined;
    const pushedItem = pusherExtended ? itemAt(state.items, PUSHER_POSITION, PUSHER_WINDOW) : undefined;

    let processedCount = state.processedCount;
    let rejectedCount = state.rejectedCount;
    let sortedCorrectCount = state.sortedCorrectCount;
    let sortedWrongCount = state.sortedWrongCount;
    let returnedCount = state.returnedCount;
    const items: ConveyorItem[] = [];
    for (const item of state.items) {
      if (item === robotPushedItem) {
        if (item.category !== undefined) {
          if (item.category === 1) sortedCorrectCount++;
          else sortedWrongCount++;
        } else {
          rejectedCount++;
        }
        items.push({ ...item, rejected: true });
        continue;
      }
      if (item === pushedItem) {
        if (item.category !== undefined) {
          if (item.category === 2) sortedCorrectCount++;
          else sortedWrongCount++;
        } else {
          rejectedCount++;
        }
        items.push({ ...item, rejected: true });
        continue;
      }
      if (!conveyorRunning) {
        items.push(item);
        continue;
      }
      if (conveyorReversed) {
        const nextPosition = item.position - ITEM_SPEED_PER_TICK;
        if (nextPosition <= 0) {
          returnedCount++;
          continue; // exits off the spawn end - kicked back by the reversed belt
        }
        items.push({ ...item, position: nextPosition });
        continue;
      }
      let nextPosition = item.position + ITEM_SPEED_PER_TICK;
      // <= (not <) so an item already queued exactly at the gate stays blocked
      // next tick too - item.position === GATE_POSITION would otherwise fail
      // this check and slip through while still red.
      if (gateBlocking && item.position <= GATE_POSITION && nextPosition > GATE_POSITION) {
        nextPosition = GATE_POSITION; // queues right at the closed gate instead of crossing it
      }
      if (nextPosition >= 100) {
        // !item.rejected guards both branches - an already-diverted item
        // keeps visually riding the belt (rejected items aren't excluded
        // from normal movement, only from being re-matched by itemAt), so
        // without this guard it would get double-counted here too, once
        // at its diversion station and again when it eventually reaches
        // the end.
        if (!item.rejected) {
          if (item.category !== undefined) {
            if (item.category === 0) sortedCorrectCount++;
            else sortedWrongCount++;
          } else {
            processedCount++;
          }
        }
        continue; // exits the belt - discharged at the end, or off a reject chute
      }
      items.push({ ...item, position: nextPosition });
    }

    return {
      ...state,
      items,
      conveyorRunning,
      pusherExtended,
      heaterOn,
      robotArmExtended,
      conveyorReversed,
      redOn,
      yellowOn,
      greenOn,
      tankLevel: clampAnalogValue(state.tankLevel + TANK_FILL_PER_TICK),
      temperature: clampAnalogValue(state.temperature + (heaterOn ? HEATER_RISE_PER_TICK : -COOLING_PER_TICK)),
      processedCount,
      rejectedCount,
      sortedCorrectCount,
      sortedWrongCount,
      returnedCount,
    };
  },
};
