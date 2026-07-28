-- Coins/energy economy system. Run once in the Supabase SQL Editor.

alter table public.users
  add column energy_updated_at timestamptz not null default now(),
  add column hint_credits integer not null default 3,
  add column skip_tokens integer not null default 0;

-- ============================================================
-- SECURITY HARDENING (found while adding coins/energy):
-- the existing "users can update own profile" policy only checks row
-- ownership, not which columns changed - a student's own client could
-- currently PATCH their own role/approval_status/coins/energy directly.
-- No app code does this today, but it's a live gap now that coins/energy
-- are meaningful currency. Closes it with a trigger: self-updates always
-- keep these columns at their old value; only a teacher (via RLS-checked
-- authenticated client) or the service-role admin client may change them.
-- ============================================================
create or replace function public.protect_system_managed_columns()
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
