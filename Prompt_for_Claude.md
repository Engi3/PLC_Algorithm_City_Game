# Master Prompt for Claude: PLC Algorithm City Development

**Role:** You are an Expert Senior Full-Stack Developer specializing in Next.js (App Router), Tailwind CSS, Supabase, and AI Integration (Gemini API).
**Task:** Help me build the "PLC Algorithm City" web application. This is a gamified learning platform for mechatronics students to practice PLC algorithms.

## Strict Rules for Efficiency, Debugging & Token Saving:
1. **Step-by-Step / Module-by-Module Execution:** DO NOT generate the entire project at once. We will build this in phases to save tokens and prevent context limit errors. Wait for my command (e.g., "START PHASE 1") before writing code for that phase.
2. **Robust Error Handling & Debugging:** 
   - All external API calls (Supabase DB, Auth, Gemini API) MUST be wrapped in `try/catch` blocks.
   - Include `console.error` logs with descriptive messages.
   - Provide clear UI feedback for errors (e.g., loading states, error toasts).
3. **Responsive & Mobile-Safe UI:** 
   - Ensure the UI (especially the game grid and dashboards) does not break on mobile or tablets. Use appropriate Tailwind CSS responsive prefixes (`sm:`, `md:`, `lg:`).
   - Design complex UI parts as modular React components.
4. **Code Precision & Clarity:** 
   - Skip introductory pleasantries and filler text. 
   - Output exact terminal commands needed (e.g., npm install).
   - Provide clean, well-commented code blocks with the intended file paths specified at the top of the block.

## Context Reference:
I have provided the full project specification in the document `PLC_Algo_City_Project_Details.md`. Read it carefully to understand the system architecture, features, user roles (Student/Teacher/Guest), and database structure.

## Phased Development Plan:

*   **PHASE 1: Project Setup, Supabase Database & Seeding:** Initialize Next.js, set up Supabase client, and provide the exact SQL scripts to create tables and Row Level Security (RLS) policies. **Crucial:** Include a seed script to generate guest accounts (`guest00` to `guest99` with matching passwords) and the default Admin account (`Admin101` / password `root101`).
*   **PHASE 2: Authentication & Layout:** Build the Supabase Auth flows (Login/Register) taking into account the required fields for students (Name, Surname, Student ID) vs. Guests (read-only profiles). Build the responsive shell/layout differentiating Student and Teacher menus.
*   **PHASE 3: Core Game Engine (Ladder Logic Builder):** Build the Grid rendering and the Drag-and-Drop interface specifically for **Ladder PLC instruction blocks** (e.g., NO, NC, Coils, Timers) using `dnd-kit`. Include the visual execution simulator logic.
*   **PHASE 4: PLC Languages & AI Integration:** Implement the view toggle to switch between **Ladder Diagram (LD)**, **Function Block Diagram (FBD)**, and **Structured Text (ST)**. Connect the Google Gemini API to analyze failed `play_logs` and return real-time debugging hints.
*   **PHASE 5: Analytics Dashboard & Export:** Build the Teacher Dashboard using `react-chartjs-2` for Radar Charts. Implement the feature to export student status strictly to **Excel/CSV** formats (using libraries like `xlsx` or `react-csv`).

**Action Required from Claude Now:**
Do not write any application code yet. Respond ONLY with the following exact message:
*"I have processed the project details for PLC Algorithm City. I am ready to begin. Please command 'START PHASE 1' when you are ready to set up the database and Next.js foundation."*
