-- ============================================================
-- Hotfix: profile privilege guard
-- Run this in the Supabase SQL editor if you already applied
-- schema.sql. It replaces the guard function/trigger only.
--
-- Why: the previous version checked request.jwt.claim.role. That
-- GUC is not set on every PostgREST/Supabase project, so the guard
-- could be skipped entirely. This version checks current_user,
-- which PostgREST always sets to anon / authenticated / service_role.
-- ============================================================

create or replace function guard_profile_privileged_fields()
returns trigger
language plpgsql
as $$
begin
  -- The Node server (service_role) and the SQL editor (postgres) are trusted.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'resident'
       or coalesce(new.points, 0) <> 0
       or coalesce(new.active, true) is distinct from true then
      raise exception 'Cannot set protected profile fields via the anon key';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.points is distinct from old.points
     or new.active is distinct from old.active
     or new.society_id is distinct from old.society_id
     or new.area_id is distinct from old.area_id then
    raise exception 'Cannot change protected profile fields via the anon key';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileged_fields on profiles;
create trigger trg_guard_profile_privileged_fields
  before insert or update on profiles
  for each row execute function guard_profile_privileged_fields();
