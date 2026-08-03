# PLC Algorithm Practice

A browser-based training platform for learning PLC (Programmable Logic
Controller) Ladder Logic programming — built for mechatronics students.
Students solve real industrial automation scenarios (motors, conveyors,
pumps, traffic lights, tank/heater processes) by wiring circuits in an
industrial-software-style grid editor (drag-and-drop, live wiring, keyboard
shortcuts), then watch a deterministic simulator grade the result instantly.

Three graded modes share one editor:

- **Levels** — 130 self-contained ladder-logic exercises, scored 0–100.
- **Challenge Mode** — 50 multi-stage industrial scenarios with a live
  SCADA-style process panel and safety-interlock monitoring.
- **Game Mode** — 3 real-time simulation tracks (Maze Explorer, Factory
  Simulator, Hybrid AGV+Factory), 50 levels each, where the student's
  circuit controls an actual simulated robot or production line.

Progress feeds a 6-axis engineering-competency radar, a class leaderboard,
AI-generated hints/code review/coaching (Google Gemini), and downloadable
PDF/PNG certificates with QR-code verification.

For a full breakdown of the architecture, data flow, and AI prompts, see
[`PLC_Architecture_And_Flow.md`](./PLC_Architecture_And_Flow.md). For
in-app usage docs, see [`PLAYER_GUIDE.md`](./PLAYER_GUIDE.md) (student) and
[`TEACHER_GUIDE.md`](./TEACHER_GUIDE.md) (teacher) — both are also
rendered live at `/dashboard/guide`.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database & Auth | [Supabase](https://supabase.com) (PostgreSQL, Row Level Security, Supabase Auth) |
| AI | Google [Gemini](https://ai.google.dev) (`gemini-flash-latest`) |
| Charts | Chart.js + react-chartjs-2 |
| Certificates | jsPDF + html2canvas + qrcode (client-side PDF/PNG generation) |
| Markdown | react-markdown + remark-gfm + rehype-slug |

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) project (free tier is enough for development)
- A [Google AI Studio](https://aistudio.google.com/apikey) API key for Gemini (optional — the app runs fine without one, with AI features degrading to a disabled state or a deterministic fallback)

### 1. Clone and install

```bash
git clone https://github.com/Engi3/PLC_Algorithm_City_Game.git
cd PLC_Algorithm_City_Game
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your own values:

```bash
cp .env.local.example .env.local
```

| Variable | Where to find it | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → `anon` `public` key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` key. **Server-only — never expose this to the browser or commit it.** Used for admin operations (user creation/deletion, class-wide leaderboard/analytics reads that must bypass a student's own Row Level Security). | Yes |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Optional — AI hints/review/coaching/insights are disabled or fall back to a deterministic message without it |

`.env.local` is git-ignored; never commit real keys.

### 3. Set up the database

In the Supabase Dashboard, open **SQL Editor** and run, **in order**:

1. `supabase/schema.sql` — base schema (`users`, `levels`, `play_logs`, `student_scores`, RLS policies, the `handle_new_user()` signup trigger).
2. Every file in `supabase/migrations/`, in filename order (`0002_...sql` through the highest-numbered file) — each is a standalone, idempotent-per-run change (new tables, new columns, RLS policy updates). Run each once.

There is no automated migration runner — this project intentionally keeps
migrations as plain SQL files reviewed and run by hand in the SQL Editor,
since several of them touch RLS policies and irreversible data changes.

### 4. Seed content (optional but recommended)

The repository ships with generator scripts that procedurally build and
**self-verify** every level against the real grading engine before writing
it to the database (see `PLC_Architecture_And_Flow.md` §4.4). To populate a
fresh database:

```bash
npx tsx scripts/level-gen/generate-maze-50.ts
npx tsx scripts/level-gen/generate-factory-50.ts
npx tsx scripts/level-gen/generate-hybrid-50.ts
npx tsx scripts/replace-maze-levels.ts
npx tsx scripts/replace-factory-levels.ts
npx tsx scripts/replace-hybrid-levels.ts
```

The 130 Levels and 50 Challenge Mode scenarios are seeded via the
`npm run seed*` scripts (`package.json`) — run `npm run seed`, then
`npm run seed:levels`, `npm run seed:efficiency`, `npm run seed:challenges`,
`npm run seed:game-levels` as needed. Check each script's header comment
before running against a database that already has student data — several
of these are additive/idempotent, but the `replace-*-levels.ts` scripts
delete-and-reinsert an entire track and refuse to run if any student has
already logged an attempt against it.

### 5. Create your first teacher account

Sign-ups via `/register` are always created as `student` accounts pending
approval. To bootstrap the very first teacher account, insert one directly
via the Supabase SQL Editor (or use the Supabase Auth dashboard to create
the `auth.users` row with `user_metadata: { role: "teacher", ... }`, which
the `handle_new_user()` trigger will mirror into `public.users`).

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run a production build locally |
| `npm run lint` | ESLint |
| `npm run seed` | Base data seed |
| `npm run seed:levels` / `seed:efficiency` / `seed:challenges` | Seed each content track |
| `npm run generate:levels` / `generate:efficiency` | Regenerate procedural level JSON (self-verified before write) |
| `npm run generate:game-levels` / `seed:game-levels` | **Legacy** — the original single-track 100-level Game Mode, superseded by the 3-track Maze/Factory/Hybrid system (§4 above, `scripts/level-gen/generate-{maze,factory,hybrid}-50.ts` + `scripts/replace-*-levels.ts`). Kept for historical reference only — do not run against a fresh database expecting current Game Mode content. |

## Deployment Guide (Vercel + Supabase)

### Supabase (production project)

1. Create a new project at [supabase.com](https://supabase.com) — pick a
   region close to your users.
2. In **SQL Editor**, run `supabase/schema.sql`, then every file in
   `supabase/migrations/` in order — same as local setup (§3 above).
3. Under **Authentication → Providers**, confirm Email is enabled (this app
   authenticates by username, translated to a synthetic
   `username@plc-city.internal` email — no real email delivery is needed,
   so you can leave email confirmation requirements as the Supabase
   default; the app always creates users with `email_confirm: true`).
4. Under **Project Settings → API**, copy the **Project URL**, **anon
   public** key, and **service_role** key — you'll need these for Vercel's
   environment variables next.
5. Seed content the same way as local setup (§4 above), pointing your local
   `.env.local` at the production Supabase project temporarily, or run the
   scripts from a CI job with the production service-role key.
6. Bootstrap a teacher account (§5 above) against the production database.

### Vercel

1. Push this repository to GitHub (see [Git Operations](#git-operations)
   below) if you haven't already.
2. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub
   repository. Vercel auto-detects the Next.js framework — no build
   configuration needed.
3. Before the first deploy, add the environment variables (**Project
   Settings → Environment Variables**, applied to all environments —
   Production/Preview/Development, or scoped per-environment if you run a
   separate staging Supabase project):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` (optional)
4. Deploy. Vercel builds with `next build` and serves the App Router
   automatically, including the Server Actions and the one Route Handler
   (`/api/evaluate-submission`).
5. Once live, visit `https://<your-project>.vercel.app/register` to confirm
   student sign-up works end-to-end, and sign in with the teacher account
   you bootstrapped in Supabase to confirm `/dashboard/students` and
   `/dashboard/analytics` load.
6. **Custom domain** (optional): **Project Settings → Domains** → add your
   domain and follow Vercel's DNS instructions.

Every subsequent `git push` to the branch connected in Vercel (typically
`main`) triggers an automatic redeploy; pull requests get their own preview
deployment URL.

## Git Operations

To publish local changes to GitHub:

```bash
git add <files>
git commit -m "Final Polish: Dashboards, Certificates, and Docs"
git push origin main
```

If this is the first push of a new local repository to an empty GitHub
remote:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

## License

No license file is currently included in this repository — all rights
reserved by default. Add a `LICENSE` file if you intend to open-source
this project.
