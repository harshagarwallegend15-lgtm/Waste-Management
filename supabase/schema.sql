-- ============================================================
-- WasteWise — Supabase schema
-- Run this in the Supabase SQL editor.
--
-- Security model:
--   • The Node server runs on the SERVICE-ROLE key, which bypasses
--     row-level security — server behaviour is unaffected by RLS.
--   • RLS (enabled below) locks every table down for the PUBLIC
--     anon key shipped to browsers: reads stay open (frontend +
--     Realtime need them), but anon cannot insert/update any row
--     except creating its own profile. All writes go through /api.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Geographic model ----------

create table if not exists areas (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists societies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  area_id uuid references areas(id) on delete cascade,
  address text,
  gps_lat double precision,
  gps_lng double precision,
  created_at timestamptz not null default now()
);

-- Allow re-running this file against an existing database that predates the
-- geolocation columns (fresh installs get them from the create table above).
alter table societies
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision;

-- ---------- Users ----------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('resident','collector','admin')),
  name text not null,
  phone text,
  address_text text,
  gps_lat double precision,
  gps_lng double precision,
  society_id uuid references societies(id),
  area_id uuid references areas(id),
  points integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_area on profiles(area_id);
create index if not exists idx_profiles_society on profiles(society_id);

-- ---------- Collection requests ----------

create table if not exists collection_requests (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid references profiles(id),
  society_id uuid references societies(id),
  area_id uuid references areas(id),
  waste_type text not null default 'mixed' check (waste_type in ('wet','dry','recyclable','mixed','hazardous')),
  status text not null default 'pending'
    check (status in ('pending','collected','verified','flagged','rejected')),
  before_photo_url text,
  before_gps_lat double precision,
  before_gps_lng double precision,
  before_timestamp timestamptz,
  after_photo_url text,
  after_gps_lat double precision,
  after_gps_lng double precision,
  after_timestamp timestamptz,
  collector_id uuid references profiles(id),
  match_score double precision,
  cv_method text check (cv_method in ('local','ai','hybrid')),
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- REPAIR FOR EXISTING DATABASES
-- A Supabase project may already contain a table called `collection_requests`
-- belonging to a different app (community_id / member_id / verified). In that
-- case `create table if not exists` above is a NO-OP, so the columns this app
-- needs would be missing and the indexes below would fail with
-- "column area_id does not exist". Add only what is missing; fresh installs
-- already have everything from the CREATE TABLE statement.
-- ---------------------------------------------------------------------------
alter table collection_requests
  add column if not exists resident_id uuid,
  add column if not exists society_id uuid,
  add column if not exists area_id uuid,
  add column if not exists before_photo_url text,
  add column if not exists before_gps_lat double precision,
  add column if not exists before_gps_lng double precision,
  add column if not exists before_timestamp timestamptz,
  add column if not exists after_photo_url text,
  add column if not exists after_gps_lat double precision,
  add column if not exists after_gps_lng double precision,
  add column if not exists after_timestamp timestamptz,
  add column if not exists collector_id uuid,
  add column if not exists match_score double precision,
  add column if not exists cv_method text,
  add column if not exists verified_by uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- The API uses PostgREST embeds that name these constraints explicitly, eg.
-- profiles!collection_requests_resident_id_fkey, so on a pre-existing table
-- the foreign keys must be created with exactly these names.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'collection_requests_resident_id_fkey') then
    alter table collection_requests add constraint collection_requests_resident_id_fkey foreign key (resident_id) references profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'collection_requests_society_id_fkey') then
    alter table collection_requests add constraint collection_requests_society_id_fkey foreign key (society_id) references societies(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'collection_requests_area_id_fkey') then
    alter table collection_requests add constraint collection_requests_area_id_fkey foreign key (area_id) references areas(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'collection_requests_collector_id_fkey') then
    alter table collection_requests add constraint collection_requests_collector_id_fkey foreign key (collector_id) references profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'collection_requests_verified_by_fkey') then
    alter table collection_requests add constraint collection_requests_verified_by_fkey foreign key (verified_by) references profiles(id);
  end if;
end $$;

create index if not exists idx_requests_area_status on collection_requests(area_id, status);
create index if not exists idx_requests_resident on collection_requests(resident_id);

-- ---------- Dumping reports ----------

create table if not exists dumping_reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references profiles(id),
  society_id uuid references societies(id),
  area_id uuid references areas(id),
  photo_url text,
  gps_lat double precision,
  gps_lng double precision,
  report_timestamp timestamptz not null default now(),
  description text,
  status text not null default 'pending'
    check (status in ('pending','verified','rejected','duplicate')),
  reward integer not null default 0,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Same repair for a pre-existing `dumping_reports` table from another app.
alter table dumping_reports
  add column if not exists reporter_id uuid,
  add column if not exists society_id uuid,
  add column if not exists area_id uuid,
  add column if not exists photo_url text,
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision,
  add column if not exists report_timestamp timestamptz not null default now(),
  add column if not exists reward integer not null default 0,
  add column if not exists verified_by uuid,
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dumping_reports_reporter_id_fkey') then
    alter table dumping_reports add constraint dumping_reports_reporter_id_fkey foreign key (reporter_id) references profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dumping_reports_society_id_fkey') then
    alter table dumping_reports add constraint dumping_reports_society_id_fkey foreign key (society_id) references societies(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dumping_reports_area_id_fkey') then
    alter table dumping_reports add constraint dumping_reports_area_id_fkey foreign key (area_id) references areas(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dumping_reports_verified_by_fkey') then
    alter table dumping_reports add constraint dumping_reports_verified_by_fkey foreign key (verified_by) references profiles(id);
  end if;
end $$;

create index if not exists idx_reports_status on dumping_reports(status);
create index if not exists idx_reports_area on dumping_reports(area_id);

-- ---------- Verification audit ----------

create table if not exists verification_events (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('collection','report')),
  entity_id uuid not null,
  verifier text not null default 'auto',
  verdict text not null check (verdict in ('verified','flagged','rejected')),
  cv_score double precision,
  gps_distance double precision,
  time_delta integer,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_entity on verification_events(entity_type, entity_id);

-- ---------- Points ledger ----------

create table if not exists points_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  delta integer not null,
  reason text not null,
  source_type text not null check (source_type in ('collection','report','education','bonus','penalty','adjustment')),
  source_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_points_user on points_transactions(user_id);

-- Atomic ledger write + profile balance update. The server calls this with
-- db.rpc('award_points', { p_user, p_delta, p_reason, p_source_type, p_source_id }).
-- Both statements run in the caller's transaction, so a failed update rolls
-- back the ledger row as well.
create or replace function award_points(
  p_user uuid,
  p_delta int,
  p_reason text,
  p_source_type text,
  p_source_id uuid
) returns int
language plpgsql
as $$
declare
  v_points int;
begin
  if p_source_type not in ('collection','report','education','bonus','penalty','adjustment') then
    raise exception 'Invalid points source_type: %', p_source_type;
  end if;

  insert into points_transactions (user_id, delta, reason, source_type, source_id)
  values (p_user, p_delta, p_reason, p_source_type, p_source_id);

  update profiles
     set points = points + p_delta
   where id = p_user
  returning points into v_points;

  if v_points is null then
    raise exception 'Profile % not found', p_user;
  end if;

  return v_points;
end;
$$;

revoke all on function award_points(uuid, int, text, text, uuid) from public;
grant execute on function award_points(uuid, int, text, text, uuid) to service_role;

-- ---------- Learn & earn quiz sessions ----------

create table if not exists learn_earn_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  score integer not null default 0,
  total integer not null default 0,
  points_earned integer not null default 0,
  question_ids integer[] not null default '{}',
  submitted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table learn_earn_sessions
  add column if not exists submitted boolean not null default false;

create index if not exists idx_learn_earn_user_created on learn_earn_sessions(user_id, created_at);

-- ---------- Society problems + comments ----------

create table if not exists society_problems (
  id uuid primary key default uuid_generate_v4(),
  society_id uuid references societies(id),
  resident_id uuid references profiles(id),
  title text not null,
  description text,
  photo_url text,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists problem_comments (
  id uuid primary key default uuid_generate_v4(),
  problem_id uuid references society_problems(id) on delete cascade,
  user_id uuid references profiles(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------- Scores + leaderboards ----------

create table if not exists society_scores (
  id uuid primary key default uuid_generate_v4(),
  society_id uuid references societies(id),
  period_start date not null,
  period_end date not null,
  score double precision not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (society_id, period_start, period_end)
);

-- ---------- Education (stub) ----------

create table if not exists education_content (
  id uuid primary key default uuid_generate_v4(),
  trigger_type text not null,
  title text not null,
  content text not null,
  reward integer not null default 5
);

-- ---------- Community challenges ----------

create table if not exists challenges (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  challenge_type text not null check (challenge_type in ('collections','reports','participation','score')),
  target numeric not null default 10,
  reward_points integer not null default 25,
  starts_at date not null default current_date,
  ends_at date not null,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

-- Society-level completions. Reward points are paid out exactly once per (challenge, society).
create table if not exists challenge_completions (
  challenge_id uuid references challenges(id) on delete cascade,
  society_id uuid references societies(id) on delete cascade,
  completed_at timestamptz not null default now(),
  reward_awarded boolean not null default false,
  primary key (challenge_id, society_id)
);

-- ============================================================
-- REALTIME — publish changed tables so dashboards update live.
-- Safe to re-run: each table is added only if it is not already a member.
-- ============================================================

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['profiles','societies','areas','collection_requests','dumping_reports','points_transactions','learn_earn_sessions','society_scores','society_problems','problem_comments','challenges','challenge_completions']
    loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ============================================================
-- PRODUCTION HARDENING — row-level security.
-- The Node server runs on the service-role key (bypasses RLS), so
-- enabling this never changes server behaviour. What it DOES do is
-- lock the data down for the PUBLIC anon key shipped to browsers:
--   • SELECT is allowed everywhere so the frontend + Realtime work;
--   • INSERT/UPDATE from the anon key is rejected on every table
--     except a user creating/editing their own profile row.
-- ============================================================

alter table areas enable row level security;
alter table societies enable row level security;
alter table profiles enable row level security;
alter table collection_requests enable row level security;
alter table dumping_reports enable row level security;
alter table verification_events enable row level security;
alter table points_transactions enable row level security;
alter table learn_earn_sessions enable row level security;
alter table society_problems enable row level security;
alter table problem_comments enable row level security;
alter table society_scores enable row level security;
alter table education_content enable row level security;
alter table challenges enable row level security;
alter table challenge_completions enable row level security;

-- Public reference data / live feeds: readable by everyone.
drop policy if exists "areas public read" on areas;
create policy "areas public read" on areas for select using (true);
drop policy if exists "societies public read" on societies;
create policy "societies public read" on societies for select using (true);
drop policy if exists "education public read" on education_content;
create policy "education public read" on education_content for select using (true);
drop policy if exists "challenges public read" on challenges;
create policy "challenges public read" on challenges for select using (true);

-- Profiles: readable for leaderboards + society views. A user can only
-- create or update their OWN row with the anon key (the server bypasses
-- RLS when registering users via the service role). The WITH CHECK clause
-- stops a user from moving their row to someone else's id on UPDATE.
drop policy if exists "profiles public read" on profiles;
create policy "profiles public read" on profiles for select using (true);
drop policy if exists "profiles insert own" on profiles;
create policy "profiles insert own" on profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- A user may create/edit their own profile, but not the privileged fields —
-- without this guard the anon key could self-assign an admin role or unlimited
-- points (the INSERT policy alone would allow role='admin' at signup).
-- The Node server authenticates as service_role and must stay unrestricted;
-- a missing JWT claim (SQL editor / migrations) is trusted too.
create or replace function guard_profile_privileged_fields()
returns trigger
language plpgsql
as $$
begin
  -- Check the actual database role, not request.jwt.claim.role: PostgREST does
  -- not set that GUC on every Supabase project, which would silently disable
  -- the guard. service_role (Node server) and postgres (SQL editor) are trusted.
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
     or new.area_id is distinct from old.area_id
  then
    raise exception 'Cannot change protected profile fields via the anon key';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileged_fields on profiles;
create trigger trg_guard_profile_privileged_fields
  before insert or update on profiles
  for each row execute function guard_profile_privileged_fields();

-- Activity rows: read-only for anon (realtime + public lists). All writes
-- happen server-side through the service role, so no anon write policies
-- are granted.
drop policy if exists "requests public read" on collection_requests;
create policy "requests public read" on collection_requests for select using (true);
drop policy if exists "reports public read" on dumping_reports;
create policy "reports public read" on dumping_reports for select using (true);
drop policy if exists "events public read" on verification_events;
create policy "events public read" on verification_events for select using (true);
drop policy if exists "points public read" on points_transactions;
create policy "points public read" on points_transactions for select using (true);
drop policy if exists "learn earn public read" on learn_earn_sessions;
create policy "learn earn public read" on learn_earn_sessions for select using (true);
drop policy if exists "problems public read" on society_problems;
create policy "problems public read" on society_problems for select using (true);
drop policy if exists "comments public read" on problem_comments;
create policy "comments public read" on problem_comments for select using (true);
drop policy if exists "scores public read" on society_scores;
create policy "scores public read" on society_scores for select using (true);
drop policy if exists "completions public read" on challenge_completions;
create policy "completions public read" on challenge_completions for select using (true);
