-- Levels/scoring/play-logs system (fills in what Phase 3 deliberately
-- deferred). Run once in the Supabase SQL Editor.

alter table public.play_logs add column score numeric;

-- Seed levels. map_layout_json holds a LevelSpec (see src/lib/ladder/level-spec.ts):
-- { description, skill, allowedInputs, allowedOutputs, testCases }
-- Each testCase is a sequence of frames (full input state + tick count to
-- run afterward), checked against `expect` (coil / timer.DN / counter.DN)
-- after the last frame.

insert into public.levels (level_number, title, optimal_blocks_count, map_layout_json) values
(1, 'AND: Two switches', 3, '{
  "description": "Energize Q0 only when both I0 and I1 are on.",
  "skill": "basic_logic",
  "allowedInputs": ["I0", "I1"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": false, "I1": false }, "ticks": 0 }], "expect": { "Q0": false } },
    { "frames": [{ "inputs": { "I0": true, "I1": false }, "ticks": 0 }], "expect": { "Q0": false } },
    { "frames": [{ "inputs": { "I0": false, "I1": true }, "ticks": 0 }], "expect": { "Q0": false } },
    { "frames": [{ "inputs": { "I0": true, "I1": true }, "ticks": 0 }], "expect": { "Q0": true } }
  ]
}'::jsonb),

(2, 'OR: Either switch', 2, '{
  "description": "Energize Q0 when I0 or I1 (or both) is on.",
  "skill": "basic_logic",
  "allowedInputs": ["I0", "I1"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": false, "I1": false }, "ticks": 0 }], "expect": { "Q0": false } },
    { "frames": [{ "inputs": { "I0": true, "I1": false }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [{ "inputs": { "I0": false, "I1": true }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [{ "inputs": { "I0": true, "I1": true }, "ticks": 0 }], "expect": { "Q0": true } }
  ]
}'::jsonb),

(3, 'NOT: Safety door interlock', 1, '{
  "description": "I0 is a door sensor (on = open). Energize Q0 (the motor) only when the door is CLOSED.",
  "skill": "basic_logic",
  "allowedInputs": ["I0"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": false }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [{ "inputs": { "I0": true }, "ticks": 0 }], "expect": { "Q0": false } }
  ]
}'::jsonb),

(4, 'Latch: Start/Stop motor', 2, '{
  "description": "I0 is a momentary Start button, I1 is a momentary Stop button. Q0 should latch on after Start and stay on after Start is released, until Stop is pressed.",
  "skill": "latching",
  "allowedInputs": ["I0", "I1"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": true, "I1": false }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [
        { "inputs": { "I0": true, "I1": false }, "ticks": 0 },
        { "inputs": { "I0": false, "I1": false }, "ticks": 0 }
      ], "expect": { "Q0": true } },
    { "frames": [
        { "inputs": { "I0": true, "I1": false }, "ticks": 0 },
        { "inputs": { "I0": false, "I1": false }, "ticks": 0 },
        { "inputs": { "I0": false, "I1": true }, "ticks": 0 }
      ], "expect": { "Q0": false } }
  ]
}'::jsonb),

(5, 'Timer: Delayed start', 2, '{
  "description": "When I0 turns on, wait 3 ticks before energizing Q0 (on-delay).",
  "skill": "timers",
  "allowedInputs": ["I0"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": true }, "ticks": 2 }], "expect": { "Q0": false } },
    { "frames": [{ "inputs": { "I0": true }, "ticks": 3 }], "expect": { "Q0": true } },
    { "frames": [
        { "inputs": { "I0": true }, "ticks": 3 },
        { "inputs": { "I0": false }, "ticks": 0 }
      ], "expect": { "Q0": false } }
  ]
}'::jsonb),

(6, 'Timer: Stays on after release', 2, '{
  "description": "When I0 turns on, Q0 should energize immediately and stay on for 2 ticks after I0 turns back off (off-delay).",
  "skill": "timers",
  "allowedInputs": ["I0"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": true }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [
        { "inputs": { "I0": true }, "ticks": 0 },
        { "inputs": { "I0": false }, "ticks": 1 }
      ], "expect": { "Q0": true } },
    { "frames": [
        { "inputs": { "I0": true }, "ticks": 0 },
        { "inputs": { "I0": false }, "ticks": 2 }
      ], "expect": { "Q0": false } }
  ]
}'::jsonb),

(7, 'Counter: Count 3 presses', 2, '{
  "description": "I0 is a push button. Energize Q0 after it has been pressed 3 times.",
  "skill": "counters",
  "allowedInputs": ["I0"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [
        { "inputs": { "I0": true }, "ticks": 0 },
        { "inputs": { "I0": false }, "ticks": 0 },
        { "inputs": { "I0": true }, "ticks": 0 },
        { "inputs": { "I0": false }, "ticks": 0 }
      ], "expect": { "Q0": false } },
    { "frames": [
        { "inputs": { "I0": true }, "ticks": 0 },
        { "inputs": { "I0": false }, "ticks": 0 },
        { "inputs": { "I0": true }, "ticks": 0 },
        { "inputs": { "I0": false }, "ticks": 0 },
        { "inputs": { "I0": true }, "ticks": 0 }
      ], "expect": { "Q0": true } }
  ]
}'::jsonb),

(8, 'Efficient AND-OR', 4, '{
  "description": "Energize Q0 when (I0 AND I1) OR I2 is true. Try to use exactly 4 blocks.",
  "skill": "efficiency",
  "allowedInputs": ["I0", "I1", "I2"],
  "allowedOutputs": ["Q0"],
  "testCases": [
    { "frames": [{ "inputs": { "I0": false, "I1": false, "I2": false }, "ticks": 0 }], "expect": { "Q0": false } },
    { "frames": [{ "inputs": { "I0": true, "I1": true, "I2": false }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [{ "inputs": { "I0": false, "I1": false, "I2": true }, "ticks": 0 }], "expect": { "Q0": true } },
    { "frames": [{ "inputs": { "I0": true, "I1": false, "I2": false }, "ticks": 0 }], "expect": { "Q0": false } }
  ]
}'::jsonb)

on conflict (level_number) do nothing;
