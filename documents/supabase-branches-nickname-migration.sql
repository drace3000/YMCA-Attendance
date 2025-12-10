-- Branch + instructor nickname scoping
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text,
  created_at timestamptz default now()
);

alter table public.instructors
  add column if not exists branch_id uuid,
  add column if not exists last_login_at timestamptz;

alter table public.instructors
  add constraint instructors_branch_fk
  foreign key (branch_id) references public.branches(id)
  on update cascade
  on delete set null;

create index if not exists instructors_branch_id_idx
  on public.instructors(branch_id);

-- Seed a default branch and attach existing instructors
insert into public.branches (code, name)
values ('main', 'Main Branch')
on conflict (code) do nothing;

update public.instructors
set branch_id = (select id from public.branches where code = 'main')
where branch_id is null;

-- Enforce uniqueness of nickname per branch (null nicknames are allowed)
create unique index if not exists instructors_branch_nickname_unique
  on public.instructors(branch_id, nickname)
  where nickname is not null;





