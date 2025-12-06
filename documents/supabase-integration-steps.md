# Supabase Integration – End-to-End Steps

This documents the flow we used to load the September schedule into Supabase, including data prep, inserts, and verification.

## Prereqs
- Environment vars set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Target schedule: `a5af3ce8-9729-4073-b399-ee02e3268330` (September 2025).
- CSV: `documents/GroupX_TM_MonSun_fixed.csv` (BOM-safe; 124 rows).

## Load Order
1) **Reference tables**
   - `classes`: upsert distinct `Class` (on conflict `name`).
   - `locations`: upsert `LocationCode`/`LocationName` → `code`/`name` (on conflict `code`).
   - `instructors`: split `Instructor` on `/`; insert `raw_name` (we also set `nickname`); no unique constraint on `raw_name`, so fetch-before-insert or add a unique index if desired.

2) **Sessions**
   - Parse each CSV row:
     - `Day`, `Time` (split on `-`, parse am/pm → `HH:MM:SS`), ensure `start < end` same day.
     - Map `Class` → `class_id`; `LocationCode` → `location_id`.
   - Insert into `class_sessions` with fields: `schedule_id`, `class_id`, `location_id`, `day_of_week`, `start_time`, `end_time`, `original_time_text`.
   - We inserted 124 rows for the September schedule.

3) **Instructor links**
   - For each session, match back to the CSV by `day_of_week`, `class_id`, `location_id`, `start_time`, `end_time`.
   - Split `Instructor` on `/`; map to `instructors.id`; insert into `session_instructors` (ignore dups).
   - We inserted 129 links.

## Known Pitfalls & Fixes
- **BOM in CSV header**: use `csv-parse` with `bom: true` or strip BOM; otherwise `Day` may be null and rows will be skipped.
- **Malformed times / overnight ranges**: normalize to `HH:MMam/pm` with `start < end` same day; adjust any cross-midnight spans or fix am/pm typos before insert.
- **Re-runs**: clear `session_instructors` (by session_id) and `class_sessions` for the target schedule before reloading.
- **Missing unique on instructors**: either fetch-before-insert (current approach) or add a unique constraint on `raw_name` and use `onConflict`.

## Verification Queries
- Counts:
  - `select count(*) from class_sessions where schedule_id = '<schedule_id>';`
  - `select count(*) from session_instructors;`
- Spot checks:
  - By instructor: filter `session_instructors` + `class_sessions` + `instructors`.
  - By location: `class_sessions` + `locations`.
  - By class: `class_sessions` + `classes`.

## Current Status (post-load)
- `class_sessions`: 124 rows for September schedule.
- `session_instructors`: 129 links.

