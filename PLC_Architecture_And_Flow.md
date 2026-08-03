# PLC Algorithm Practice — System Architecture & Flow

Internal technical reference documenting how the platform is built, how data
flows through it end-to-end, the exact AI prompts in production, and the
technical/pedagogical standards it implements. Written for engineers and
instructional designers maintaining or extending the system — not for
students (see `PLAYER_GUIDE.md`) or teachers (see `TEACHER_GUIDE.md`).

## Table of Contents

1. [Project Structure & Architecture](#1-project-structure--architecture)
2. [Application Flow](#2-application-flow)
3. [AI Integration — Master Prompts](#3-ai-integration--master-prompts)
4. [Technical & Pedagogical Principles](#4-technical--pedagogical-principles)

---

## 1. Project Structure & Architecture

### 1.1 Three-Tier Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 1 — Presentation & Application Logic                        │
│  Next.js 16 (App Router, React 19, Turbopack)                     │
│  - Server Components render pages using data fetched server-side  │
│  - Server Actions ("use server") mutate data without a REST layer │
│  - Client Components ("use client") own interactive state         │
│    (the Grid Editor, live simulator, drag/wiring, modals)         │
└───────────────┬──────────────────────────────────┬────────────────┘
                │                                  │
                │ Supabase JS client               │ fetch()
                │ (RLS-scoped or                   │
                │  service-role, per call site)     │
                ▼                                  ▼
┌────────────────────────────────────┐  ┌───────────────────────────┐
│  TIER 2 — Data & Auth               │  │  TIER 3 — AI Engine        │
│  Supabase (PostgreSQL + Auth)       │  │  Google Gemini             │
│  - Postgres tables, Row Level       │  │  (gemini-flash-latest)     │
│    Security policies                │  │  - Hints (free text)       │
│  - Supabase Auth (email+password,   │  │  - Code review (JSON       │
│    synthetic emails from usernames) │  │    schema, 4-axis scores)  │
│  - Postgres triggers (auto-create   │  │  - Personal coach tips     │
│    public.users row on signup)      │  │  - Class insights          │
│                                      │  │    (anonymized aggregates) │
└──────────────────────────────────────┘  │  - Challenge draft author   │
                                          └───────────────────────────┘
```

There is no separate backend service — Tier 1 and Tier 2 communicate
directly via the Supabase JS SDK from Server Components, Server Actions, and
one Route Handler (`/api/evaluate-submission`). Tier 3 is called exclusively
from the server (Server Actions or the Route Handler); `GEMINI_API_KEY`
never reaches the browser. All AI calls are wrapped so a Gemini outage
degrades a feature (no hint, no review, a deterministic fallback tip) —
it never blocks core gameplay, since every submission is graded first by
the deterministic simulator engine (Tier 1, in-process), not by the AI.

### 1.2 Tech Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) | Server Components by default; `"use client"` opt-in |
| UI runtime | React 19 | |
| Language | TypeScript (strict) | No `any` in core engine/grading code |
| Styling | Tailwind CSS v4 | Utility classes only, no CSS files |
| Database | Supabase Postgres | Row Level Security on every table |
| Auth | Supabase Auth | Username-based login via a synthetic `username@plc-city.internal` email |
| AI | Google Gemini (`gemini-flash-latest`) | Called via raw `fetch`, no SDK dependency |
| Charts | Chart.js + react-chartjs-2 | Skill radar, competency radar |
| Certificates | jsPDF + html2canvas + qrcode | Client-side PDF/PNG rasterization, no server render step |
| Drag & drop | @dnd-kit | Legacy palette editor (superseded by the Grid Editor for all graded surfaces) |
| Markdown | react-markdown + remark-gfm + rehype-slug | Renders `PLAYER_GUIDE.md` / `TEACHER_GUIDE.md` in-app |

### 1.3 Directory Layout

```
src/
├── app/                          # Next.js App Router — one folder per route
│   ├── api/evaluate-submission/  # The one Route Handler (AI code review)
│   ├── certificate/verify/       # Public, unauthenticated certificate verification
│   ├── dashboard/                # Everything behind login (see 1.4)
│   ├── login/, register/         # Auth pages
│   └── layout.tsx                # Root layout, wraps every page in AppShell
├── components/
│   ├── ladder-grid/               # The Grid Editor (GX Works-style industrial UI)
│   ├── ladder/                    # Play/Challenge-mode chrome around the Grid Editor
│   ├── games/                     # Maze/Factory/Hybrid visualizations + I/O tables
│   ├── analytics/                 # Radar charts (skill + competency)
│   ├── progress/                  # Certificate generator, AI coach box
│   └── layout/                    # AppShell (nav sidebar + footer)
├── lib/
│   ├── ladder/                    # Core PLC engine: types, grid-engine, IEC compiler, grading
│   ├── games/                     # Maze/Factory/Hybrid simulation engines + PLC bindings
│   ├── analytics/                 # Competency scoring, leaderboard ranking, class-data loader
│   ├── ai/                        # gemini.ts — the only file that talks to Gemini
│   ├── certificate/                # PDF/PNG certificate rendering
│   ├── auth/                      # Profile fetching, session actions
│   ├── economy/                   # Energy regeneration math
│   └── supabase/                  # RLS-scoped client, admin (service-role) client, middleware
└── middleware.ts                  # Refreshes the Supabase session cookie on every request

scripts/level-gen/                 # Procedural level generators (self-verifying, see §4.4)
supabase/
├── schema.sql                     # Base schema for a fresh install
└── migrations/0002...0016.sql     # Incremental changes, run manually in the SQL Editor
```

### 1.4 Feature Areas Under `/dashboard`

| Route | Who | Purpose |
| --- | --- | --- |
| `/dashboard` | all | Role-specific home: student sees a competency summary + rank; teacher sees class KPIs + pending approvals |
| `/dashboard/play/[levelId]` | all | **Levels** — 130 hand-authored ladder-logic exercises, scored 0–100 by optimal-block-count |
| `/dashboard/challenges/[id]` | all | **Challenge Mode** — 50 multi-stage industrial scenarios with a live Process Panel, pass/fail only |
| `/dashboard/games/[gameSlug]/[levelId]` | all | **Game Mode** — 3 real-time simulation tracks (Maze Explorer, Factory Simulator, Hybrid AGV+Factory), 50 levels each |
| `/dashboard/play/sandbox` | all | Ungraded free-play Grid Editor |
| `/dashboard/progress` | student | Radar charts, certificates, AI coach |
| `/dashboard/leaderboard` | all | Class-wide ranking by average competency score |
| `/dashboard/students` | teacher | User approval, account management, per-student mode overrides |
| `/dashboard/analytics` | teacher | Per-student drill-down, CSV export, AI class insights |
| `/dashboard/levels`, `/challenges/new` | teacher | Content authoring (manual + AI-assisted draft) |
| `/certificate/verify/[userId]/[axis]` | public | Unauthenticated — what a certificate's QR code resolves to |

---

## 2. Application Flow

### 2.1 Auth → Dashboard

1. **Registration** (`/register`, student only) or **admin-created account**
   (teacher, via Manage Users) calls `supabase.auth.admin.createUser()` (or
   `signUp` for self-registration) with a synthetic email
   (`usernameToEmail()`: `username@plc-city.internal`) and `user_metadata`
   (`role`, `first_name`, `last_name`, `student_id`, `approval_status`).
2. A Postgres trigger, `handle_new_user()` (`supabase/migrations/0002...sql`),
   fires on `auth.users` insert and copies that metadata into a matching
   `public.users` row — this is the **only** place `public.users` rows are
   created; application code never inserts into it directly.
3. Self-registered students land with `approval_status = 'pending'` and see
   only a "waiting for approval" home screen until a teacher approves them
   from `/dashboard/students` (or a teacher-created account, which defaults
   to `approved`).
4. **Login** (`/login`) calls `supabase.auth.signInWithPassword()` with the
   same synthetic email. `middleware.ts` refreshes the session cookie on
   every request (`updateSession()`), since Server Components cannot write
   cookies themselves.
5. `getCurrentProfile()` (`src/lib/auth/get-profile.ts`) is the single
   source of truth for "who is logged in" — called at the top of nearly
   every Server Component page. It reads `public.users`, splitting
   pre-migration-optional columns (mode overrides, `class_name`) into
   separate queries so a column that doesn't exist yet (migration not run)
   degrades that one feature instead of 500ing the whole page.
6. `AppShell` (`src/components/layout/AppShell.tsx`) renders a
   role-specific nav (`navItemsForRole()`) and wraps every dashboard page.

**Guest accounts** (`guest00`–`guest99`, password = username) are
pre-provisioned, `role = 'guest'`, `is_guest = true`. Guests bypass unlock
gates (Challenge Mode / Game Mode) but their submissions never affect the
economy (coins/energy) or the class leaderboard.

### 2.2 Dashboard → Playing

All three graded surfaces (Levels, Challenge Mode, Game Mode) share **one
editor** — the Grid Editor (`src/components/ladder-grid/`,
`useLadderGrid()`) — composed differently per context:

- **Levels**: `GridLadderPlayground.tsx` — Grid Editor + Submit + Hint + AI Review + Save.
- **Challenge Mode**: `ChallengePlayClient.tsx` — Grid Editor with its
  simulation-facing fields (`inputs`/`memory`/`step`/`toggleRunning`)
  redirected from the student's own instance to `useChallengePlcEngine`,
  which drives a scripted multi-stage scenario. A `ChallengeProcessPanel`
  renders a live SCADA-style visualization (sensor lamps, tank gauges,
  actuator lamps) instead of manual input toggles.
- **Game Mode**: `GamePlayClient.tsx` — same redirection trick, but the
  live bridge (`useGameLevelPlay`) drives an actual Maze or Factory (or
  both, phase-switching, for Hybrid) simulation, rendered by
  `MazeEngine`/`FactoryEngine`. An `IoAddressTable` (Address / Variable
  Name / Type / Description) is shown prominently above the editor and
  again inside the in-editor guide.

Every level/challenge/game-level page also offers, independent of the
grading path: **Ask AI for a hint** (costs 1 `hint_credit` for students),
**Save circuit** (a mutable per-user draft, `ladder_drafts`, distinct from
the append-only attempt logs), and — once passed — **Ask AI to review my
code** and, for Game Mode, **📖 View example solution**
(`reference_grid_program_json`, generated and self-verified server-side,
never required reading).

### 2.3 Playing → Submission → Grading

Submission is **always graded deterministically first**, in-process, before
any AI is involved:

| Context | Submit action | Grading function | Result |
| --- | --- | --- | --- |
| Levels | `submitLevelAction` | `evaluateGridLevel()` (`lib/ladder/level-eval.ts`) | Score 0–100 (optimal-blocks formula, §4.2) |
| Challenge Mode | `submitChallengeAction` | `useChallengePlcEngine`'s stage-by-stage `expect` checks + safety-constraint monitor | Pass/fail only |
| Game Mode | `submitGameLevelAction` | `runGameLevelToCompletion()` (`lib/games/run-game-level.ts`), replaying the submitted `GridProgram` against the level's Maze/Factory/Hybrid spec to a `won`/`failed`/`playing` (timeout) outcome | Pass/fail only |

A pass writes an attempt row (`play_logs` / `challenge_play_logs` /
`game_play_logs`) and, for Levels, awards coins if the new score beats the
previous best. **Only after this deterministic pass** does the client offer
"Ask AI to review my code", which calls `POST /api/evaluate-submission`.
That route **re-verifies the pass server-side** (never trusts the client)
via the same grading functions, keyed by a `contextKind` discriminator
(`"level" | "challenge" | "game"`), then sends the compiled Structured Text
to Gemini for a 4-axis review (§3.2) and — for non-teacher accounts — awards
bonus coins and inserts one row into the polymorphic `ai_evaluations` table.

### 2.4 AI Evaluation → Persistence → Leaderboard

`ai_evaluations` rows and the raw pass/fail attempt logs both feed
`computeCompetencyScores()` (`lib/analytics/competency.ts`), which derives
6 axes per student (§4.3). Two of those axes are teacher-gradable-or-auto
(`wiring_skills`, manual only) or auto-with-manual-override
(`debugging_testing`, `advanced_challenge`, `system_control`); the other two
(`ladder_programming`, `problem_solving`) are always computed from
`play_logs`.

`computeLeaderboard()` (`lib/analytics/leaderboard.ts`) takes the same
per-student input and produces a standard-competition ranking
(ties share a rank, e.g. 1, 1, 3) by the mean of all 6 axes — or by a single
chosen axis, for the Leaderboard page's sort control. Both the Leaderboard
page and every student's own rank widget go through `loadClassData()`
(`lib/analytics/load-class-data.ts`), which **deliberately uses the
service-role client**, not the requesting user's own RLS-scoped session —
a student's Row Level Security policy on `public.users` only permits
reading their own row, so a student-facing ranking feature must read
class-wide data through an admin client (the same justification the public
certificate-verify page already uses). Every field this function selects
(name, student ID, scores, pass/fail logs) is intentionally class-wide
visible data, not a privacy boundary.

Certificates (`CertificateGenerator`, §4.5) read the same
`computeCompetencyScores()` output and the same leaderboard rank, so the
number printed on a certificate always matches what the live UI shows —
and the QR code re-derives it live server-side at scan time
(`/certificate/verify/[userId]/[axis]`), so a screenshot-edited PDF can
never pass verification.

---

## 3. AI Integration — Master Prompts

All AI calls go through `src/lib/ai/gemini.ts`, which exposes exactly two
functions against `gemini-flash-latest`:

- `generateGeminiText(prompt)` — free-text reply (hints).
- `generateGeminiJSON<T>(prompt, schema)` — `responseMimeType:
  "application/json"` + a strict `responseSchema` (Gemini's OpenAPI-subset
  schema format), so the reply is guaranteed valid JSON matching the given
  shape with no markdown fences or prose to strip. The caller still
  validates the parsed value at runtime (`clamp0to100`, string-trim
  fallbacks) since a schema constrains *shape*, not semantic correctness.

Every call site catches `GeminiConfigError` (no API key configured) and
`GeminiRequestError` (network/non-200/invalid-JSON) separately from
unexpected errors, and every feature has a defined degraded behavior — a
disabled button with a Thai error message, or (coach tips, class insights)
a deterministic non-AI fallback computed from the same data that would
have gone into the prompt.

### 3.1 Hint ("Ask AI for a hint") — `src/app/dashboard/play/actions.ts`

Used identically (parameterized on program/inputs/memory) by Levels,
Challenge Mode, and Game Mode.

```
คุณเป็นติวเตอร์สอน PLC Ladder Logic ให้กับนักศึกษาเมคคาทรอนิกส์ที่กำลังฝึกในแซนด์บ็อกซ์

โปรแกรมปัจจุบัน (แปลงเป็น Structured Text โดยประมาณ):
${structuredText}

สถานะ Input: ${JSON.stringify(inputs)}
สถานะ Coil: ${JSON.stringify(memory.coils)}
สถานะ Timer: ${JSON.stringify(memory.timers)}
สถานะ Counter: ${JSON.stringify(memory.counters)}
${unassignedNote}

ให้คำแนะนำสั้นๆ เพียง 1 ข้อ (ไม่เกิน 3 ประโยค) แบบโค้ชชิ่ง ชี้ให้นักเรียนสังเกตและคิดเอง
ห้ามเฉลยคำตอบหรือบอกวิธีแก้ตรงๆ ให้ถามคำถามหรือชี้จุดสังเกตแทน ตอบเป็นภาษาไทย
```

Design intent: the model receives the student's **entire live circuit
state** (compiled to Structured Text via `iec-compiler.ts`, plus every
current I/O/timer/counter value) but is explicitly instructed never to
give the answer away — a Socratic-method constraint, not a solution
generator. Costs one `hint_credit` (unlimited for teachers).

### 3.2 Code Review ("Ask AI to review my code") — `src/app/api/evaluate-submission/route.ts`

Shared verbatim by Levels, Challenge Mode, and Game Mode — only
`description`/`blocksNote` differ per context (built by `verifyAndDescribe()`).

```
คุณเป็นวิศวกรอาวุโสที่ตรวจสอบโค้ด PLC Ladder Logic ของนักศึกษา

โจทย์: ${description}

โปรแกรมของนักเรียน (Structured Text โดยประมาณ):
${structuredText}

${blocksNote}

โปรแกรมนี้ผ่านชุดทดสอบทั้งหมดแล้ว (ทำงานถูกต้องตามข้อกำหนด) กรุณาประเมิน 4 ด้านนี้เป็นคะแนน 0-100:
- correctness: ความถูกต้องเชิงตรรกะและความสมเหตุสมผลของวิธีแก้ปัญหา
- conciseness: ความกระชับ ใช้จำนวนรังคำสั่ง (rung) และบล็อกคำสั่งอย่างมีประสิทธิภาพ เทียบกับจำนวนบล็อกที่เหมาะสมที่สุด
- safety: การมี interlock ด้านความปลอดภัย การรีเซ็ตที่เหมาะสม หรือโครงสร้างที่อ่านง่าย
- approach: แนวทางและตรรกะการคิดแก้ปัญหาของนักเรียน (ไม่ใช่แค่ว่าผ่านหรือไม่ - ประเมินว่าวิธีคิดมีประสิทธิภาพหรืออ้อมค้อม ใช้เทคนิคที่ชาญฉลาด เช่น self-hold, interlock, การแบ่งแขนงที่เหมาะสม หรือมีรูปแบบที่ไม่ดี (antipattern) เช่น การต่อวนซ้ำซ้อนโดยไม่จำเป็น)

และ feedback: คำแนะนำเชิงสร้างสรรค์เป็นภาษาไทย อธิบายว่าโค้ดนี้ดีอย่างไรหรือควรปรับปรุงอย่างไรให้ดีขึ้น รวมถึงความเห็นต่อแนวทางการแก้ปัญหาของนักเรียน (2-4 ประโยค)
```

**Response schema** (`RESPONSE_SCHEMA`):

```json
{
  "type": "OBJECT",
  "properties": {
    "correctness": { "type": "INTEGER" },
    "conciseness": { "type": "INTEGER" },
    "safety": { "type": "INTEGER" },
    "approach": { "type": "INTEGER" },
    "feedback": { "type": "STRING" }
  },
  "required": ["correctness", "conciseness", "safety", "approach", "feedback"]
}
```

The prompt is only ever sent **after** the deterministic grader has already
confirmed a pass (`verifyAndDescribe()` re-checks server-side, ignoring
whatever the client claims) — Gemini is never asked "is this correct?", only
"how good is this correct solution?". `coinsAwarded = round(mean(correctness,
conciseness, safety) / 10)`, deliberately excluding `approach` from the
payout formula (an added qualitative signal, not a scoring-weight change)
and excluding teacher accounts from both the payout and the persisted
`ai_evaluations` row.

### 3.3 Personal Coach Tip — `src/app/dashboard/progress/ai-actions.ts`

Button-triggered (not automatic), based on the student's own 6-axis scores.

```
คุณเป็นโค้ชส่วนตัวที่ให้กำลังใจนักเรียนวิชา PLC Ladder Logic เป็นภาษาไทย

คะแนนสมรรถนะทางวิศวกรรม 6 ด้านของนักเรียนคนนี้ (เต็ม 100): ${scoresLine}

ด้านที่คะแนนต่ำที่สุดคือ "${weakestAxisLabel}" (${weakestScore}/100)

กรุณาเขียนคำแนะนำสั้นๆ (2-3 ประโยค) เป็นภาษาไทยที่สุภาพและให้กำลังใจ โดยชี้เฉพาะเจาะจงไปที่ด้านที่คะแนนต่ำที่สุด พร้อมแนะนำสิ่งที่ควรฝึกฝนเพิ่มเติมอย่างเป็นรูปธรรม ห้ามใส่คำนำหรือหัวข้ออื่น ตอบเฉพาะข้อความคำแนะนำเท่านั้น
```

`findWeakestAxis()` picks the lowest of the 6 axes client-side before the
call — the model is never asked to compute or compare scores, only to
write encouragement about a pre-selected target. On Gemini failure, a
deterministic Thai fallback string is shown instead
(`fallbackTip(axis, score)`), tagged `source: "fallback"` in the UI.

### 3.4 Class Insights (teacher-only) — `src/app/dashboard/analytics/ai-actions.ts`

```
คุณเป็นผู้ช่วยอาจารย์วิเคราะห์ผลการเรียนวิชา PLC Ladder Logic ของนักเรียนทั้งชั้นเรียนจำนวน ${studentCount} คน (ข้อมูลนี้เป็นค่าเฉลี่ยรวมของทั้งชั้น ไม่มีการระบุชื่อนักเรียนรายบุคคล)

คะแนนเฉลี่ยของทั้งชั้นเรียนแยกตามทักษะ (เต็ม 100): ${skillLine}

ด่านที่นักเรียนหลายคน (ตั้งแต่ 2 คนขึ้นไป) ยังติดขัดไม่ผ่าน: ${failedLine}

ความคืบหน้า Game Mode (จำลองควบคุมหุ่นยนต์ AGV ในเขาวงกตและสายการผลิตโรงงานแบบเรียลไทม์ ${gameLevelCount} ด่าน) เฉลี่ยของทั้งชั้นเรียน: ${gameCompletionRate}%

กรุณาวิเคราะห์และให้คำแนะนำเป็นภาษาไทย กระชับ (3-5 ประโยค) ว่าหัวข้อ PLC ใดที่อาจารย์ควรทบทวนเพิ่มเติมในการบรรยายหน้าชั้นเรียน โดยอ้างอิงข้อมูลข้างต้นให้ชัดเจน (รวมถึงความคืบหน้า Game Mode หากมีนัยสำคัญ) ตอบเฉพาะเนื้อหาคำแนะนำเท่านั้น ห้ามใส่คำนำหรือคำลงท้าย
```

**Deliberately anonymized**: the prompt never contains a student's name or
an individual score — only class-wide averages (`computeSkillScores()`
over every student's pooled logs) and a "≥2 students stuck on this level"
signal (`findCommonlyFailedLevels()`, a plain frequency count, no AI
involved in identifying it). On failure, `buildFallbackSummary()` renders
the same three data points as a template string instead of a Gemini call.

### 3.5 Challenge Draft Author (teacher-only) — `src/app/dashboard/challenges/new/actions.ts`

Turns a teacher's one-line idea into a full multi-stage Challenge Mode
scenario draft (title, description, hints, required competencies, stage
expectations) — always presented as an editable draft, never auto-published.

```
คุณเป็นผู้ช่วยออกแบบโจทย์ Challenge Mode สำหรับหลักสูตร PLC Ladder Logic ระดับสูง (การจำลองโรงงานอุตสาหกรรม) เป็นภาษาไทยเชิงเทคนิค

แนวคิดโจทย์คร่าวๆ จากอาจารย์: "${roughIdea}"

สร้างโจทย์ที่มี:
- title: ชื่อโจทย์สั้นๆ กระชับ
- description: อธิบายสถานการณ์อุตสาหกรรมและเงื่อนไขการทำงานอย่างละเอียด ระบุแอดเดรส I/O ที่ใช้ (เช่น X0, X1, Y0) พร้อมความหมายของแต่ละแอดเดรส
- hints: คำใบ้ 2-3 ข้อ แนะแนวทางแก้โจทย์โดยไม่เฉลยตรงๆ
- requiredCompetencies: เลือกจาก NO_NC, TIMER, COUNTER, ANALOG, INTERLOCK, MATH ตามที่โจทย์นี้ต้องใช้จริง
- maxOptimalBlocks: จำนวนบล็อกลอจิกโดยประมาณที่ใช้แก้โจทย์นี้อย่างมีประสิทธิภาพ (เลขจำนวนเต็ม)
- stages: ลำดับขั้นตอนการทดสอบ (อย่างน้อย 2 ขั้นตอน) แต่ละขั้นตอนมี frames (สถานะอินพุตที่จะป้อนตามลำดับ พร้อมจำนวนรอบสแกน ticks ที่ต้องรอ) และ expect (เงื่อนไขที่ต้องเป็นจริงหลังจากขั้นตอนนี้จบ โดยอ้างอิงแอดเดรสเอาต์พุต Y หรือบิต .DN ของ Timer/Counter เท่านั้น ห้ามอ้างอิงแอดเดรสอินพุต X ใน expect)

ใช้แอดเดรสตามมาตรฐาน Mitsubishi/JIS เท่านั้น: X0-X7 (อินพุต), Y0-Y3 (เอาต์พุต), M0-M99 (รีเลย์ภายใน), T0-T99 (ไทม์เมอร์), C0-C99 (เคาน์เตอร์), AI0-AI15 (อินพุตอนาล็อก) ห้ามใช้ I หรือ Q เด็ดขาด
```

Deliberately scoped narrower than the response schema might suggest: exactly
one `testCase`, no safety constraints unless the teacher's own idea clearly
implies a hazard. Multi-scenario generation and reliable safety-constraint
authoring are exactly the kind of subtle, hard-to-verify content this
project's own hand-authored/procedurally-generated content needed real
reference-solution simulation to catch bugs in — an AI draft cannot
self-verify the way `scripts/level-gen/*.ts` do (§4.4), so a teacher must
review and, if needed, hand-correct the `stages` JSON before publishing.

---

## 4. Technical & Pedagogical Principles

### 4.1 IEC 61131-3 Compliance

The Grid Editor implements a subset of **IEC 61131-3 Ladder Diagram (LD)**
semantics, with two additional views generated from the *same* underlying
program (never authored separately, so they can never drift):

- **LD** (native) — a grid of rungs, each cell holding a `GridNode`:
  `NO`/`NC` contact, `COIL`, `SET`/`RESET` (latch/unlatch coil), `TON`/`TOF`
  (on/off-delay timer), `CTU`/`CTD` (up/down counter), or a `COMPARE` block
  (`>`, `<`, `=`, `≥`, `≤` against an analog value or constant).
- **FBD** (Function Block Diagram) — `FbdView.tsx` re-renders the same
  `GridProgram` as connected function blocks.
- **ST** (Structured Text) — `iec-compiler.ts`'s `compileGridProgram()`
  builds an AST from the grid (proper boolean-expression tree per rung, not
  a string template), then `compiledProgramToStructuredText()` prints valid
  IEC 61131-3 ST syntax. This AST is also what the AI prompts (§3) are
  shown, and what the guest-mode/legacy `render-st.ts` path used before the
  AST compiler existed.

**Addressing standard**: Mitsubishi/JIS-style, enforced project-wide
(scripts and prompts explicitly forbid IEC's generic `%I`/`%Q` in favor of
this convention): `X0`–`X7` digital inputs, `Y0`–`Y7` digital outputs,
`M0`–`M99` internal relays, `T0`–`T99` timers, `C0`–`C99` counters,
`AI0`–`AI15` analog inputs. Earlier project iterations used generic `I`/`Q`
naming; a full migration (`Task-set 1`, see commit history) removed it
platform-wide in favor of the addresses above, since that is what students
will encounter on real Mitsubishi/JIS-family PLC hardware.

### 4.2 Scan-Cycle Execution Model

`runGridScan()` / `runScan()` (`src/lib/ladder/grid-engine.ts`,
`engine.ts`) implement a textbook PLC scan cycle, run once per simulation
tick:

1. **Read inputs** — the current `Inputs`/`AnalogInputs` snapshot (from a
   student toggling a switch, or from a live game binding like
   `mazeBinding.readInputs()`) is frozen for the whole scan.
2. **Solve logic, top to bottom** — every rung is evaluated in program
   order; a coil write from an earlier rung is visible to a later rung's
   contact **in the same scan** (mirrors a real PLC's in-scan I/O image
   table, not a "settle over multiple ticks" model).
3. **Edge-triggered counters** — `CTU`/`CTD` increment/decrement on a
   rising edge of their own rung's energized state, not on a time base;
   `.DN` (done bit) is `cv >= preset` for `CTU`, `cv <= 0` for `CTD`.
4. **Time-based timers** — `TON`/`TOF` accumulate `.ACC` by one tick's
   worth of simulated time per scan while their enabling condition holds;
   `.DN` flips once `.ACC >= .PRE`.
5. **Write outputs** — `applyOutputWrite()` commits every coil's final
   value into `SimMemory` for this tick. A `COIL` node's defining property
   (relevant to the "two grids writing the same coil" hazard, §4.4) is that
   it writes **unconditionally every scan**, including `false` when its own
   rung doesn't conduct — so if two independent grids ever end in
   `COIL(sameAddress)`, whichever is *last* in program order always wins,
   silently. The fix used throughout `scripts/level-gen/*.ts` for
   multi-phase programs (e.g. Hybrid Game Mode's shared Maze/Factory
   addresses) is to union the conditions into **one** grid with parallel
   AND-branches, tied together at the coil column (`orRung()`), so the
   engine's own flood-fill ORs them into a single write.

This model is deliberately **not** event-driven or asynchronous — a
faithful, if simplified, model of a real PLC's synchronous scan, which is
the core concept the platform exists to teach.

### 4.3 Competency Scoring — Mathematical Models

`src/lib/analytics/competency.ts` computes 6 axes, each `clamp0to100(...)`:

| Axis | Formula | Data source |
| --- | --- | --- |
| `ladder_programming` | `completionFraction × avgScore`, where `completionFraction = distinctLevelsPassed / totalLevels` and `avgScore` = mean of each passed level's *best* score | `play_logs` |
| `problem_solving` | `completionFraction × attemptEfficiency × 100`, where `attemptEfficiency = distinctLevelsPassed / totalSubmitAttempts` (rewards not brute-forcing) | `play_logs` |
| `wiring_skills` | Manual only — teacher-entered, defaults to 0 | `student_scores` |
| `debugging_testing` | Manual if set, else auto: `recoveryRatio × completionFraction × 100`, where `recoveryRatio` = fraction of levels whose **first-ever** attempt failed but were eventually passed (true first attempt found via `created_at` sort, not query row order, which Postgres does not guarantee) | `play_logs`, or `student_scores` override |
| `advanced_challenge` | Manual if set, else auto: `distinctChallengesPassed / totalChallenges × 100` (pass/fail only, no per-attempt score exists for Challenge Mode) | `challenge_play_logs`, or override |
| `system_control` | Manual if set, else auto: `distinctGameLevelsPassed / totalGameLevels × 100` across all 3 Game Mode tracks combined (150 levels) | `game_play_logs`, or override |

Both `ladder_programming` and `problem_solving` are deliberately weighted
by `completionFraction` against the **total** level count in the system
(not just attempted levels) — passing a handful of easy levels perfectly
cannot alone read as high mastery; the score dilutes automatically as new
levels are added until the student catches up.

**Certificate gate** (`CERTIFICATE_THRESHOLD = 80`): an axis certificate
unlocks at `score >= 80`. For the two axes derived from `play_logs`
specifically, there's an *additional* gate:
`computeAllLevelsAverage() >= 80` — the mean of every level's best score
across the **entire** level catalog (0 for never-attempted), not
completion-fraction-weighted like the axis score itself. This exists so
"80 on the axis" cannot be achieved by acing 5 easy levels and ignoring the
rest; it must reflect genuinely broad mastery. This same gate is
re-evaluated live, server-side, by the public certificate-verify page — a
screenshot-edited certificate cannot bypass it.

**Leaderboard rank** (`computeLeaderboard()`) uses the unweighted **mean of
all 6 axes** as the default sort key (or any single axis, selectable),
ranked by standard competition ranking (ties share the lower rank number;
the next distinct value skips ahead, e.g. `1, 1, 3`).

**Level score itself** (`evaluateGridLevel()`, Levels only — Challenge
Mode and Game Mode are pass/fail): `100` at or under
`optimal_blocks_count`, `-10` per block over that count, floored at `20`
for any pass (including a Skip Token) — a pass can never read as 0.

### 4.4 Content Generation & Self-Verification Discipline

All procedurally-generated content (`scripts/level-gen/*.ts`: 50-level
Maze, 50-level Factory, 50-level Hybrid tracks, 30-level Efficiency batch)
follows one non-negotiable rule: **every generated level's reference
solution is replayed through the real grading engine before being written
to the database** — never hand-calculated or assumed correct. A generator
that produces N levels reports exactly which ones fail self-verification
and why (the actual `evaluateGridLevel`/`runGameLevelToCompletion` outcome),
and a script is not considered done until 100% pass. This caught several
real bugs during development that hand-reasoning missed — e.g. a factory
conveyor gate's off-by-one at the exact boundary position, or a maze-hazard
generator's deadlock under a swapped-wiring requirement — because the
*actual simulated outcome*, not the designer's mental model, is the source
of truth.

Database writes to already-populated tracks distinguish two operations
with very different risk profiles: a **full content replace** (delete +
re-insert, used when level *numbering itself* changes) is always preceded
by a safety check refusing to proceed if any `*_play_logs` row references
an existing row about to be deleted; a **text-only refresh** (title /
description / hints, used for copy edits) updates in place by
`(game_type, level_number)` and never touches structural fields
(map layout, success conditions, reference solution) — safe to run even
against a live, already-played track.

### 4.5 Certificate Generation Pipeline

Entirely client-side, no server render step: `CertificateGenerator`
(`src/components/progress/CertificateGenerator.tsx`) lets a student pick
one of 6 pre-designed backgrounds (`/public/certificate/*.png`, defaulting
to a fixed per-axis assignment — one of each of the 6 competency axes maps
to one of the 6 backgrounds), then `src/lib/certificate/generate.ts`:

1. Fetches the chosen background PNG and converts it to a `data:` URL
   (`loadImageAsDataUrl()`) — deliberately, rather than a CSS
   `background-image` pointing at the `/public` path, since `html2canvas`
   would otherwise race an async image load with no reliable "loaded" event
   to wait on.
2. Builds a plain inline-styled (no Tailwind classes — `html2canvas` cannot
   parse Tailwind v4's generated `oklch()`/`color-mix()` CSS) off-screen DOM
   node with the student's name, student ID, axis, score, leaderboard rank,
   date, and a QR code (`qrcode` package) pointing at the public
   verification URL.
3. Rasterizes it with `html2canvas` at 2× scale, then either wraps the PNG
   in a `jsPDF` landscape document (`generateCertificatePdf`) or downloads
   the canvas directly as a PNG (`generateCertificateImage`).

The verification URL (`/certificate/verify/[userId]/[axis]`) is the only
part of this pipeline that touches the server again — and re-derives the
score, all-levels-average gate, and pass/fail live from the database at
scan time, never trusting anything printed on the PDF itself.
