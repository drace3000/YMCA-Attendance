# Import plan for GroupX_TM_MonSun_fixed.csv (Phase 1)

## Schedule to use
- Created `schedules` row for September 2025:
  - id: `a5af3ce8-9729-4073-b399-ee02e3268330`
  - month_start: `2025-09-01`
  - status: `draft`

## Pipeline steps
1) Classes: upsert distinct `Class` into `public.classes(name)`.
2) Locations: upsert distinct `(LocationCode, LocationName)` into `public.locations(code, name)`.
3) Instructors: split instructor strings on `/` and trim; upsert into `public.instructors` with `raw_name`; parse into `first_name`, `last_name`, `nickname` as available; `pin` can be assigned later or left null.
4) Time parsing: fix obvious typos (e.g., `10:15:11:00am` → `10:15-11:00am`, `11:30-12:15am` → `11:30-12:15pm`); split into `start_time`, `end_time`; keep original string in `original_time_text`.
5) Sessions: insert into `public.class_sessions` with `schedule_id = 'a5af3ce8-9729-4073-b399-ee02e3268330'`, plus `class_id`, `location_id`, `day_of_week`, `start_time`, `end_time`, `original_time_text`.
6) Session instructors: for each instructor name in the row (after splitting), link via `public.session_instructors(session_id, instructor_id)`.

## Sample SQL helpers
- Create schedule (already done):
```sql
insert into public.schedules (name, month_start, status)
values ('September 2025', '2025-09-01', 'draft')
on conflict (month_start) do update set name = excluded.name;
```
- Upsert class:
```sql
insert into public.classes (name)
values ($1)
on conflict (name) do nothing
returning id;
```
- Upsert location:
```sql
insert into public.locations (code, name)
values ($1, $2)
on conflict (code) do update set name = excluded.name
returning id;
```
- Upsert instructor:
```sql
insert into public.instructors (raw_name, first_name, last_name, nickname, pin)
values ($1, $2, $3, $4, $5)
on conflict (raw_name) do update
  set first_name = coalesce(excluded.first_name, public.instructors.first_name),
      last_name  = coalesce(excluded.last_name,  public.instructors.last_name),
      nickname   = coalesce(excluded.nickname,   public.instructors.nickname),
      pin        = coalesce(excluded.pin,        public.instructors.pin)
returning id;
```
- Insert session:
```sql
insert into public.class_sessions
  (schedule_id, class_id, location_id, day_of_week, start_time, end_time, original_time_text)
values ($1, $2, $3, $4, $5::time, $6::time, $7)
returning id;
```
- Link instructors to session:
```sql
insert into public.session_instructors (session_id, instructor_id)
values ($1, $2)
on conflict do nothing;
```

## Notes
- Use the provided schedule_id for all September 2025 rows.
- Ensure time parsing to `start_time`/`end_time` in 24h or hh:mm AM/PM before inserting.
- Multi-instructor rows (e.g., `JENN W/ ROBERT`) should create multiple `session_instructors` links.
- `pin` is optional; you can bulk-assign later if needed.

