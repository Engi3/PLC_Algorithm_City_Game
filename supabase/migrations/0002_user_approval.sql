-- Adds the student self-registration approval workflow to an already-
-- provisioned database (schema.sql already reflects this for fresh
-- installs). Run once in the Supabase SQL Editor.

create type public.approval_status as enum ('pending', 'approved', 'rejected');

alter table public.users
  add column approval_status public.approval_status not null default 'approved';

create or replace function public.handle_new_user()
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
