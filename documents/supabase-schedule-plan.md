# Plan: Supabase schedule schema & manager app outline

## Phase 1: Data model from final CSV (Sept 2025 starting Sep 8)
- Core tables: `schedules` (monthly grouping with status), `classes`, `locations`, `instructors` (first_name, last_name, nickname, pin numeric(4), raw_name), `class_sessions`, `session_instructors` (multi-instructor per session).
- Keys/relations: `class_sessions.schedule_id -> schedules.id`; `class_sessions.class_id -> classes.id`; `class_sessions.location_id -> locations.id`; `session_instructors.session_id -> class_sessions.id`; `session_instructors.instructor_id -> instructors.id`.
- Schedule modeling: `schedules` holds `id`, `name`, `month_start` (e.g., 2025-09-01), `status` (draft/published), `cloned_from_id`, `published_at`. Unique on `month_start`.
- Time modeling: parse `Time` into `start_time` and `end_time` (fix obvious typos like `10:15:11:00am` -> `10:15-11:00am`, `11:30-12:15am` -> `11:30-12:15pm`); store `day_of_week`, `start_time`, `end_time`, plus `original_time_text` for audit.
- Normalization rules: dedupe `Class` into `classes`; dedupe `(LocationCode, LocationName)` into `locations`; split multi-instructor strings (e.g., `JENN W/ ROBERT`, `ROBERT/ JAYME`, `TESS/SAM R`) into multiple linked instructors. Standardize instructor names into first/last/nickname; assign or leave null a 4-digit `pin`.

## Phase 2: App/web manager flow (UI sketch)
- Dashboard: list schedules with status (draft/published) and actions: clone, edit, publish, export.
- Clone flow: pick source schedule (previous month) and target month_start; duplicate sessions + instructor links into the new schedule; classes/locations/instructors remain shared.
- Edit/maintenance: grid/calendar by day-of-week to add/edit/delete sessions (class, location, day, start/end, instructors); inline multi-select for instructors; separate tabs to CRUD instructors (first/last/nickname/pin) and locations.
- Publish: set schedule status to published and timestamp; optionally lock edits after publish or allow soft edits with versioning.
- Export: CSV/XLSX/PDF of draft or published schedule; optional public read-only view fed from published schedules.
- Permissions: manager write access (RLS/service role), optional public read for published schedules.

## Deliverables
- SQL migration draft for the tables/constraints/indexes above (including `schedules` and schedule_id FK on sessions).
- Mapping guide from `GroupX_TM_MonSun_fixed.csv` to the schema (time parsing fixes, instructor splitting, schedule assignment).
- Outline of manager UI flows: clone previous month to new month, adjust sessions/instructors, publish, export.






