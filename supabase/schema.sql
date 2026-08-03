-- PLC Algorithm Practice - Phase 1 schema
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).

-- ============================================================
-- ENUM
-- ============================================================
create type public.user_role as enum ('student', 'teacher', 'guest');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

-- ============================================================
-- TABLES
-- ============================================================

-- Profile table, 1:1 with auth.users. Login is by `username`, not email:
-- the app synthesizes a fake email as `${username}@plc-city.internal`
-- when calling supabase.auth.signInWithPassword (see lib/auth/username.ts).
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  role public.user_role not null default 'student',
  student_id text,
  first_name text,
  last_name text,
  is_guest boolean not null default false,
  coins integer not null default 0,
  energy integer not null default 100,
  -- Energy regenerates lazily from this timestamp (see src/lib/economy/energy.ts).
  energy_updated_at timestamptz not null default now(),
  hint_credits integer not null default 3,
  skip_tokens integer not null default 0,
  -- Self-registered students start 'pending' and can't reach the dashboard
  -- content until a teacher approves them. Guests, teachers, and any
  -- admin-created account default to 'approved'.
  approval_status public.approval_status not null default 'approved',
  created_at timestamptz not null default now()
);

create unique index users_username_lower_idx on public.users (lower(username));

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  level_number integer not null unique,
  title text,
  map_layout_json jsonb not null default '{}'::jsonb,
  optimal_blocks_count integer,
  created_at timestamptz not null default now()
);

create table public.play_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  level_id uuid not null references public.levels (id) on delete cascade,
  ladder_blocks_json jsonb not null default '{}'::jsonb,
  is_success boolean not null default false,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.student_scores (
  user_id uuid primary key references public.users (id) on delete cascade,
  game_logic_score numeric not null default 0,
  onsite_practical_score numeric,
  updated_at timestamptz not null default now()
);

create index play_logs_user_id_idx on public.play_logs (user_id);
create index play_logs_level_id_idx on public.play_logs (level_id);

-- ============================================================
-- HELPER FUNCTION (SECURITY DEFINER avoids RLS recursion on public.users)
-- ============================================================
create function public.is_teacher(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users where id = uid and role = 'teacher'
  );
$$;

-- ============================================================
-- AUTO-CREATE PROFILE ROW WHEN AN AUTH USER IS CREATED
-- Expects auth.users.raw_user_meta_data to carry:
--   username, role, is_guest, first_name, last_name, student_id
-- (set via supabase.auth.admin.createUser / signUp options.data)
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, username, role, is_guest, first_name, last_name, student_id, approval_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student'),
    coalesce((new.raw_user_meta_data ->> 'is_guest')::boolean, false),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'student_id',
    coalesce((new.raw_user_meta_data ->> 'approval_status')::public.approval_status, 'approved')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PROTECT SYSTEM-MANAGED COLUMNS FROM SELF-UPDATE
-- The update policy below only checks row ownership, not which columns
-- changed, so without this trigger a student's own client could PATCH
-- their own role/approval_status/coins/energy directly. Self-updates
-- always keep these columns at their old value; only a teacher (via the
-- RLS-checked authenticated client) or the service-role admin client may
-- change them.
-- ============================================================
create function public.protect_system_managed_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_teacher(auth.uid()) then
    return new;
  end if;

  new.role := old.role;
  new.is_guest := old.is_guest;
  new.approval_status := old.approval_status;
  new.coins := old.coins;
  new.energy := old.energy;
  new.energy_updated_at := old.energy_updated_at;
  new.hint_credits := old.hint_credits;
  new.skip_tokens := old.skip_tokens;
  return new;
end;
$$;

create trigger protect_system_managed_columns_trigger
  before update on public.users
  for each row execute function public.protect_system_managed_columns();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.users enable row level security;
alter table public.levels enable row level security;
alter table public.play_logs enable row level security;
alter table public.student_scores enable row level security;

-- users -------------------------------------------------------
create policy "users can view own profile, teachers view all"
  on public.users for select
  to authenticated
  using (auth.uid() = id or public.is_teacher(auth.uid()));

create policy "users can update own profile, guests cannot, teachers update all"
  on public.users for update
  to authenticated
  using ((auth.uid() = id and is_guest = false) or public.is_teacher(auth.uid()))
  with check ((auth.uid() = id and is_guest = false) or public.is_teacher(auth.uid()));

-- inserts into public.users happen only via the handle_new_user trigger
-- (security definer), so no insert policy is granted to regular roles.

-- levels --------------------------------------------------------
create policy "levels are readable by any authenticated user"
  on public.levels for select
  to authenticated
  using (true);

create policy "only teachers manage levels"
  on public.levels for all
  to authenticated
  using (public.is_teacher(auth.uid()))
  with check (public.is_teacher(auth.uid()));

-- play_logs -------------------------------------------------------
create policy "users manage own play logs, teachers view all"
  on public.play_logs for select
  to authenticated
  using (auth.uid() = user_id or public.is_teacher(auth.uid()));

create policy "users insert own play logs"
  on public.play_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

-- student_scores -------------------------------------------------------
create policy "users view own scores, teachers view all"
  on public.student_scores for select
  to authenticated
  using (auth.uid() = user_id or public.is_teacher(auth.uid()));

create policy "only teachers write scores"
  on public.student_scores for insert
  to authenticated
  with check (public.is_teacher(auth.uid()));

create policy "only teachers update scores"
  on public.student_scores for update
  to authenticated
  using (public.is_teacher(auth.uid()))
  with check (public.is_teacher(auth.uid()));

-- Note: the game engine (Phase 3+) should write game_logic_score via a
-- server-side route using the service-role client, which bypasses RLS,
-- since students must not be able to write their own game score directly.
