-- ============================================================
-- WasteWise — post-deploy verification
-- Run this in the Supabase SQL editor AFTER schema.sql and
-- migration_challenges.sql. Every status column should read OK / true.
-- ============================================================

-- 1. All tables the Node API expects
with expected(name) as (
  values
    ('areas'), ('societies'), ('profiles'), ('collection_requests'),
    ('dumping_reports'), ('verification_events'), ('points_transactions'),
    ('learn_earn_sessions'), ('society_problems'), ('problem_comments'),
    ('society_scores'), ('education_content'), ('challenges'),
    ('challenge_completions')
)
select e.name,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = e.name
       ) then 'OK' else 'MISSING' end as status
from expected e
order by 1;

-- 2. Columns added to tables that already existed from another app
with expected(table_name, column_name) as (
  values
    ('collection_requests','resident_id'),
    ('collection_requests','society_id'),
    ('collection_requests','area_id'),
    ('collection_requests','before_photo_url'),
    ('collection_requests','after_photo_url'),
    ('collection_requests','collector_id'),
    ('collection_requests','match_score'),
    ('collection_requests','cv_method'),
    ('dumping_reports','reporter_id'),
    ('dumping_reports','society_id'),
    ('dumping_reports','area_id'),
    ('dumping_reports','photo_url'),
    ('dumping_reports','gps_lat'),
    ('dumping_reports','gps_lng')
)
select e.table_name, e.column_name,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = e.table_name
           and column_name = e.column_name
       ) then 'OK' else 'MISSING' end as status
from expected e
order by 1, 2;

-- 3. Foreign keys used by PostgREST relationship embeds
select conname,
       case when conname is not null then 'OK' else 'MISSING' end as status
from pg_constraint
where conname in (
  'collection_requests_resident_id_fkey',
  'collection_requests_collector_id_fkey',
  'dumping_reports_reporter_id_fkey'
)
order by conname;

-- 4. Points RPC and profile guard trigger
select 'award_points function' as object,
       case when exists (select 1 from pg_proc where proname = 'award_points')
            then 'OK' else 'MISSING' end as status
union all
select 'profile guard trigger',
       case when exists (select 1 from pg_trigger where tgname = 'trg_guard_profile_privileged_fields')
            then 'OK' else 'MISSING' end;

-- 5. RLS enabled on every table
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relkind = 'r'
  and relnamespace = 'public'::regnamespace
  and relname in (
    'areas','societies','profiles','collection_requests','dumping_reports',
    'verification_events','points_transactions','learn_earn_sessions',
    'society_problems','problem_comments','society_scores','education_content',
    'challenges','challenge_completions'
  )
order by relname;
