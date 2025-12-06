-- Adds headcount and approval tracking fields to class_sessions
alter table public.class_sessions
  add column if not exists headcount integer,
  add column if not exists headcount_submitted_at timestamptz,
  add column if not exists headcount_updated_at timestamptz,
  add column if not exists manager_approved boolean,
  add column if not exists manager_approved_at timestamptz;

-- Optional (not applied): add a constraint to keep approval timestamp aligned
-- alter table public.class_sessions
--   add constraint manager_approval_timestamp_check
--   check (
--     (manager_approved is true and manager_approved_at is not null)
--     or (manager_approved is false or manager_approved is null) and manager_approved_at is null
--   );

