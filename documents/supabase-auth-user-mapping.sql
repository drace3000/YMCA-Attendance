-- Map auth users to instructors via auth_user_id and update RLS
alter table public.instructors
  add column if not exists auth_user_id uuid;

create unique index if not exists instructors_auth_user_id_unique
  on public.instructors(auth_user_id)
  where auth_user_id is not null;

-- RLS for class_sessions
alter table public.class_sessions enable row level security;

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

-- RLS for session_instructors
alter table public.session_instructors enable row level security;

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

-- RLS for instructors
alter table public.instructors enable row level security;

drop policy if exists "instructor_can_read_self" on public.instructors;
drop policy if exists "instructor_can_update_self" on public.instructors;

create policy "instructor_can_read_self" on public.instructors
for select
using (auth.uid() is not null and auth.uid() = auth_user_id);

create policy "instructor_can_update_self" on public.instructors
for update
using (auth.uid() is not null and auth.uid() = auth_user_id)
with check (auth.uid() is not null and auth.uid() = auth_user_id);

-- RPC to claim or create an instructor by branch/nickname
create or replace function public.claim_instructor(
  p_branch_id uuid,
  p_nickname text,
  p_first_name text default null,
  p_last_name text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_auth uuid := auth.uid();
begin
  if v_auth is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_id
  from public.instructors
  where branch_id = p_branch_id
    and nickname = p_nickname
  limit 1;

  if v_id is null then
    insert into public.instructors (branch_id, nickname, first_name, last_name, raw_name, auth_user_id)
    values (p_branch_id, p_nickname, p_first_name, p_last_name, p_nickname, v_auth)
    returning id into v_id;
  else
    if exists (select 1 from public.instructors where id = v_id and auth_user_id is not null and auth_user_id <> v_auth) then
      raise exception 'Nickname already claimed by another user';
    end if;
    update public.instructors
    set auth_user_id = coalesce(auth_user_id, v_auth),
        first_name = coalesce(p_first_name, first_name),
        last_name = coalesce(p_last_name, last_name),
        raw_name = coalesce(raw_name, p_nickname),
        branch_id = coalesce(branch_id, p_branch_id)
    where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.claim_instructor from public;
grant execute on function public.claim_instructor to authenticated;





