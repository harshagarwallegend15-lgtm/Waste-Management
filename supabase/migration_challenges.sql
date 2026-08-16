-- ============================================================
-- WasteWise — Migration: Community challenges
-- Paste into the Supabase SQL editor and RUN.
-- (Adds the challenges feature on top of the applied schema.sql.)
-- ============================================================

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

-- Realtime: safe to run again -- only adds a table if it is NOT already a member.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenges') then
      alter publication supabase_realtime add table challenges;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenge_completions') then
      alter publication supabase_realtime add table challenge_completions;
    end if;
  end if;
end $$;
