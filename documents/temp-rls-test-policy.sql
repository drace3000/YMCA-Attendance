-- Temporary test policy to allow read access to September 2025 schedule data
-- Applies to class_sessions and session_instructors for the target schedule/effective_month
-- REMOVE before production.

-- Constants (adjust if schedule changes)
-- Schedule ID: a5af3ce8-9729-4073-b399-ee02e3268330
-- Effective month: 2025-09-01

-- class_sessions select for September 2025 to anyone (including anon)
create policy if not exists "test_read_sep2025_class_sessions"
on public.class_sessions
for select
to public
using (
  schedule_id = 'a5af3ce8-9729-4073-b399-ee02e3268330'
  and effective_month = date '2025-09-01'
);

-- session_instructors select for linked sessions in September 2025 to anyone
create policy if not exists "test_read_sep2025_session_instructors"
on public.session_instructors
for select
to public
using (
  exists (
    select 1 from public.class_sessions cs
    where cs.id = session_instructors.session_id
      and cs.schedule_id = 'a5af3ce8-9729-4073-b399-ee02e3268330'
      and cs.effective_month = date '2025-09-01'
  )
);

-- Rollback helpers (run manually when done testing)
-- drop policy if exists "test_read_sep2025_class_sessions" on public.class_sessions;
-- drop policy if exists "test_read_sep2025_session_instructors" on public.session_instructors;



