"use client";

import { memo } from "react";
import type { FactoryState } from "@/lib/games/factory-types";

const VIEW_W = 600;
const VIEW_H = 200;
const BELT_X1 = 40;
const BELT_X2 = 480;
const BELT_Y = 150;
const TANK_X = 40;
const TANK_Y = 20;
const TANK_W = 70;
const TANK_H = 100;
const PUSHER_X = 380; // retracted rod tip position
const PUSHER_EXTEND = 40; // how far the rod travels toward the belt when firing
const ROBOT_X = 260; // upstream of the pusher - matches ROBOT_POSITION in factory-plc-binding.ts
const GATE_X_RATIO = 0.35; // matches GATE_POSITION (35/100) in factory-plc-binding.ts

const CATEGORY_COLOR: Record<number, string> = { 0: "#facc15", 1: "#60a5fa", 2: "#34d399" };

function itemX(position: number): number {
  return BELT_X1 + (Math.min(100, Math.max(0, position)) / 100) * (BELT_X2 - BELT_X1);
}

/**
 * Lightweight Factory Simulation engine - plain SVG, no canvas/WebGL, so it
 * stays cheap on mobile and desktop alike. Purely presentational: renders
 * whatever `state` it's given (conveyor items, tank fill level, pusher
 * extension, heater). The PLC I/O binding that actually drives `state` over
 * time lives elsewhere (useGamePlcBridge) - this component never mutates
 * its own state.
 */
function FactoryEngine({ state, width, height }: { state: FactoryState; width?: number; height?: number }) {
  const fillRatio = Math.min(1, Math.max(0, state.tankLevel / 9999));
  const fillHeight = TANK_H * fillRatio;

  // No explicit width/height by default - the viewBox lets the SVG scale
  // to whatever its container allows (capped at the natural 600px so it
  // doesn't blow up huge on wide screens) instead of forcing a fixed
  // 600px that overflowed a narrower panel (confirmed empirically, same
  // class of bug MazeEngine had before it got a dynamic cellSize).
  const sizeProps = width !== undefined || height !== undefined ? { width: width ?? VIEW_W, height: height ?? VIEW_H } : {};

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      {...sizeProps}
      className="h-auto w-full max-w-[600px] rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950"
    >
      {/* Tank */}
      <rect x={TANK_X} y={TANK_Y} width={TANK_W} height={TANK_H} fill="none" stroke="currentColor" strokeWidth={2} className="text-zinc-500 dark:text-zinc-400" />
      <rect
        x={TANK_X}
        y={TANK_Y + TANK_H - fillHeight}
        width={TANK_W}
        height={fillHeight}
        fill="#3b82f6"
        opacity={0.7}
      />
      <text x={TANK_X + TANK_W / 2} y={TANK_Y + TANK_H + 14} textAnchor="middle" fontSize={10} className="fill-zinc-600 dark:fill-zinc-400">
        AI1: {state.tankLevel}
      </text>

      {/* Heater */}
      <circle cx={TANK_X + TANK_W + 24} cy={TANK_Y + 20} r={10} fill={state.heaterOn ? "#ef4444" : "#a1a1aa"} opacity={state.heaterOn ? 0.9 : 0.4} />
      <text x={TANK_X + TANK_W + 24} y={TANK_Y + 46} textAnchor="middle" fontSize={10} className="fill-zinc-600 dark:fill-zinc-400">
        {state.temperature}°
      </text>

      {/* Conveyor belt - the dash animation runs backward while the belt is reversed (Y4), so direction is visible even with no items on it. */}
      <rect x={BELT_X1} y={BELT_Y} width={BELT_X2 - BELT_X1} height={10} rx={4} className="fill-zinc-400 dark:fill-zinc-700" />
      <line x1={BELT_X1} y1={BELT_Y + 5} x2={BELT_X2} y2={BELT_Y + 5} stroke="white" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="8 8">
        {state.conveyorRunning && (
          <animate attributeName="stroke-dashoffset" from="0" to={state.conveyorReversed ? "16" : "-16"} dur="0.5s" repeatCount="indefinite" />
        )}
      </line>

      {/* Traffic-light gate - only drawn for levels that opt in (gateEnabled), so the 40 original Factory levels render exactly as before. */}
      {state.gateEnabled && (
        <g transform={`translate(${BELT_X1 + (BELT_X2 - BELT_X1) * GATE_X_RATIO}, ${BELT_Y - 56})`}>
          <rect x={-9} y={-2} width={18} height={40} rx={3} className="fill-zinc-700 dark:fill-zinc-800" />
          <circle cx={0} cy={8} r={6} fill={state.redOn ? "#ef4444" : "#52525b"} />
          <circle cx={0} cy={20} r={6} fill={state.yellowOn ? "#facc15" : "#52525b"} />
          <circle cx={0} cy={32} r={6} fill={state.greenOn ? "#22c55e" : "#52525b"} />
          <line x1={0} y1={38} x2={0} y2={56} stroke="currentColor" strokeWidth={2} className="text-zinc-500 dark:text-zinc-400" />
        </g>
      )}

      {/* Items on the belt - a diverted/rejected item drops below the belt line (kicked off by a pusher/robot arm) instead of sharing the actuators' own y-range above it. A sorting-robot level colors items by category; every other level keeps the plain yellow/red good/rejected look. */}
      {state.items.map((item) => (
        <rect
          key={item.id}
          x={itemX(item.position) - 8}
          y={item.rejected ? BELT_Y + 24 : BELT_Y - 16}
          width={16}
          height={16}
          rx={2}
          fill={item.category !== undefined ? CATEGORY_COLOR[item.category] : item.rejected ? "#f87171" : "#facc15"}
          opacity={item.rejected ? 0.7 : 1}
          className="transition-all duration-150"
        />
      ))}

      {/* Robot arm (sorting bin 1) - upstream of the pusher below. */}
      <rect x={ROBOT_X} y={BELT_Y - 24} width={40} height={12} className="fill-indigo-500/70 dark:fill-indigo-400/70" />
      <rect
        x={ROBOT_X + 40}
        y={BELT_Y - 20}
        width={state.robotArmExtended ? PUSHER_EXTEND : 6}
        height={4}
        className="fill-indigo-600 transition-all duration-150 dark:fill-indigo-300"
      />
      <text x={ROBOT_X + 20} y={BELT_Y - 32} textAnchor="middle" fontSize={9} className="fill-indigo-500 dark:fill-indigo-300">
        Y3
      </text>

      {/* Pusher (sorting bin 2, or plain reject on non-sorting levels) */}
      <rect x={PUSHER_X} y={BELT_Y - 24} width={40} height={12} className="fill-zinc-500 dark:fill-zinc-400" />
      <rect
        x={PUSHER_X + 40}
        y={BELT_Y - 20}
        width={state.pusherExtended ? PUSHER_EXTEND : 6}
        height={4}
        className="fill-zinc-600 transition-all duration-150 dark:fill-zinc-300"
      />
      <text x={PUSHER_X + 20} y={BELT_Y - 32} textAnchor="middle" fontSize={9} className="fill-zinc-500 dark:fill-zinc-400">
        Y1
      </text>
    </svg>
  );
}

/**
 * Task 7 (perf): cheap by construction already (a fixed ~20 SVG shapes plus
 * one rect per belt item, not scaling with any world size), but a plain
 * default shallow-props memo is still a free win in Hybrid levels - only
 * ONE of Maze/Factory is actually being ticked at a time there
 * (use-game-level-play.ts's phaseRef), so the inactive domain's `state`
 * object reference legitimately stays stable across ticks and this now
 * correctly skips re-rendering during the Maze/AGV phase instead of doing
 * so unconditionally every tick regardless of which domain is live.
 */
export default memo(FactoryEngine);
