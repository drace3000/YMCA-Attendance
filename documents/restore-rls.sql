-- Restore production RLS for YMCS-Attendance-Tracker
-- Run with service_role or SQL editor (not anon).

-- 1) Remove temporary open policies
drop policy if exists "test_read_sep2025_class_sessions" on public.class_sessions;
drop policy if exists "test_read_sep2025_session_instructors" on public.session_instructors;

-- 2) Ensure RLS is enabled
alter table public.class_sessions enable row level security;
alter table public.session_instructors enable row level security;
alter table public.instructors enable row level security;

-- 3) Recreate intended instructor-scoped policies
-- class_sessions
drop policy if exists "instructor_can_read_own_sessions" on public.class_sessions;
drop policy if exists "instructor_can_update_own_sessions" on public.class_sessions;

create policy "instructor_can_read_own_sessions" on public.class_sessions
for select
using (
  exists (
    select 1
    from public.session_instructors si
    join public.instructors i on i.id = si.instructor_id
    where si.session_id = class_sessions.id
      and i.auth_user_id = auth.uid()
  )
);

create policy "instructor_can_update_own_sessions" on public.class_sessions
for update
using (
  exists (
    select 1
    from public.session_instructors si
    join public.instructors i on i.id = si.instructor_id
    where si.session_id = class_sessions.id
      and i.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.session_instructors si
    join public.instructors i on i.id = si.instructor_id
    where si.session_id = class_sessions.id
      and i.auth_user_id = auth.uid()
  )
);

-- session_instructors
drop policy if exists "instructor_can_read_session_links" on public.session_instructors;

create policy "instructor_can_read_session_links" on public.session_instructors
for select
using (
  exists (
    select 1 from public.instructors i
    where i.id = session_instructors.instructor_id
      and i.auth_user_id = auth.uid()
  )
);

-- instructors
drop policy if exists "instructor_can_read_self" on public.instructors;
drop policy if exists "instructor_can_update_self" on public.instructors;

create policy "instructor_can_read_self" on public.instructors
for select
using (auth.uid() is not null and auth.uid() = auth_user_id);

create policy "instructor_can_update_self" on public.instructors
for update
using (auth.uid() is not null and auth.uid() = auth_user_id)
with check (auth.uid() is not null and auth.uid() = auth_user_id);

-- 4) Ensure claim_instructor is executable by authenticated users
grant execute on function public.claim_instructor(uuid, text, text, text) to authenticated;


