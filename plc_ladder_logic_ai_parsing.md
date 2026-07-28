# PLC Ladder Diagram (LD) Instruction Set for AI Parsing and Analysis
*(Based on IEC 61131-3 Standards, Boolean Algebra, and Discrete Control Systems)*

## Overview
Ladder Diagram (LD) is a graphical programming language derived from relay logic circuits used in control systems engineering. The instructions can be mapped to Boolean algebra equations and discrete control theory principles, making them suitable for AI-driven code generation, optimization, and automation modeling.

---

## 1. Bitwise Logic Instructions
These instructions evaluate the state of Inputs/Outputs and internal memory. They represent fundamental Boolean logic operations.

*   **Normally Open (NO) / Contact**
    *   **Symbol:** `---| |---`
    *   **Operation:** Acts as a normally open switch. Allows logical flow (Logical 1) when the referenced variable is `TRUE` (1).
    *   **Boolean Equation:** $Y = A$
*   **Normally Closed (NC) / Inverse Contact**
    *   **Symbol:** `---| / |---`
    *   **Operation:** Acts as a normally closed switch. Allows logical flow when the referenced variable is `FALSE` (0).
    *   **Boolean Equation:** $Y = \bar{A}$ (NOT A)
*   **Output Coil**
    *   **Symbol:** `---( )---`
    *   **Operation:** Energizes (becomes `TRUE`) if the logical evaluation of the preceding rung conditions results in `TRUE`.
*   **Set / Reset Coil (Latch / Unlatch)**
    *   **Symbols:** `---( S )---` and `---( R )---`
    *   **Operation:** Functions similarly to an SR Latch (Flip-Flop) in digital circuits. A `TRUE` signal to the Set coil latches the state to `TRUE` until a `TRUE` signal is applied to the Reset coil.

---

## 2. Timer Instructions
Timers are essential for implementing time-delays and managing state transitions in sequential control systems.

*   **Timer On-Delay (TON)**
    *   **Operation:** When the Input (IN) becomes `TRUE`, the timer starts accumulating time. If the Current Time reaches the Preset Time, the Output (Q) becomes `TRUE`. If IN becomes `FALSE` during timing, the accumulated time is reset.
*   **Timer Off-Delay (TOF)**
    *   **Operation:** The Output (Q) becomes `TRUE` immediately when IN is `TRUE`. The timer starts accumulating time only when IN transitions from `TRUE` to `FALSE`. Once the Preset Time is reached, the Output becomes `FALSE`.
*   **Retentive Timer (RTO)**
    *   **Operation:** Similar to TON, but it retains its accumulated time even when IN becomes `FALSE`. A separate Reset (RES) instruction is required to clear the accumulated value.

---

## 3. Counter Instructions
Used for event counting and processing discrete pulses within the system.

*   **Count Up (CTU)**
    *   **Operation:** A rising edge on the Input increments the Current Value (CV) by 1. When CV $\ge$ Preset Value (PV), the Output becomes `TRUE`.
*   **Count Down (CTD)**
    *   **Operation:** A rising edge on the Input decrements the CV by 1. When CV $\le 0$, the Output becomes `TRUE`.

---

## 4. Data Handling & Mathematical Instructions
Crucial for analog signal processing, closed-loop control (e.g., PID), and advanced data analysis algorithms.

*   **Move (MOV):** Transfers data from a source address to a destination address (e.g., loading parameters into registers).
*   **Math Functions (ADD, SUB, MUL, DIV):** Performs basic arithmetic operations. Supports integer and floating-point data types.
*   **Comparison (CMP, EQU, GRT, LES):** Compares two data sets to evaluate logical conditions (e.g., evaluating if a process variable exceeds a setpoint).
*   **Logical Operations (AND, OR, XOR, NOT):** Performs bitwise logical operations at the word or register level.

---

## 5. Program Control Instructions
Used for structured programming, modularity, and optimizing the PLC scan cycle time.

*   **Jump (JMP) & Label (LBL):** Forces the PLC to bypass the rungs between the JMP instruction and the specified LBL, branching the execution flow based on specific conditions.
*   **Subroutine (JSR / SBR / RET):** Calls a sub-program. This promotes code modularity, allowing algorithms to be reused across different parts of the main program.
*   **Master Control Relay (MCR):** Disables a block of rungs or a specific zone within the program. Used for structural interlocking and emergency logic segregation.

---
*Note for AI/LLM parsing: This document bridges standard PLC programming paradigms with logical and mathematical frameworks to facilitate automated code synthesis and engineering problem-solving.*
