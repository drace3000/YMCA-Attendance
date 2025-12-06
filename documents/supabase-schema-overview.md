# Supabase Schema Overview (YMCA)

## Core Tables
- **branches**: `id (uuid, PK)`, `code (unique)`, `name`, `address?`, `city?`, `state?`, `zip?`, `phone?`, `description?`, `created_at`  
  Organizational branch; combined with instructor `nickname` for uniqueness. Codes are slugified from branch names (e.g., `Schottland Family YMCA` → `schottland_family_ymca`).
- **schedules**: `id (uuid, PK)`, `name`, `month_start`, `status`, `published_at`, `created_at`  
  Defines a schedule period (e.g., “September 2025”).
- **classes**: `id (uuid, PK)`, `name`, `description?`, `category?`, `created_at`  
  Catalog of class types.
- **locations**: `id (uuid, PK)`, `code`, `name`, `created_at`  
  Physical/virtual locations (e.g., Studio, MB/Mindbody).
- **instructors**: `id (uuid, PK)`, `branch_id (FK → branches.id, nullable)`, `raw_name`, `first_name?`, `last_name?`, `nickname?`, `pin?`, `auth_user_id? (uuid, unique)`, `last_login_at?`, `created_at`  
  People who teach classes. (`raw_name` holds the source display name.) `(branch_id, nickname)` is unique when nickname is present. `auth_user_id` links to Supabase Auth users for RLS.

## Event / Join Tables
- **class_sessions**  
  - `id (uuid, PK)`  
  - `schedule_id (FK → schedules.id)`  
  - `class_id (FK → classes.id)`  
  - `location_id (FK → locations.id)`  
  - `day_of_week (text)`  
  - `start_time (time)`, `end_time (time)`  
  - `original_time_text (text)`  
  - `effective_month (date, default 2025-09-01)`  
  - `created_at`  
  - **Headcount/approval tracking**  
    - `headcount (integer, nullable)`  
    - `headcount_submitted_at (timestamptz)` — first submit timestamp  
    - `headcount_updated_at (timestamptz)` — last update timestamp  
    - `manager_approved (boolean, nullable/default false)`  
    - `manager_approved_at (timestamptz)` — approval timestamp  
  Purpose: Instances of classes in a given schedule (when/where/what).

### Current usage notes
- Headcount fields are live for instructor submissions.  
- Approval fields are present but not enforced yet (no approval RLS/logic active); they can remain null until a future approval flow is decided.
- Auth link: instructors map to Supabase Auth users via `auth_user_id`; RLS uses this link.
- RPC helpers: `claim_instructor(branch_id, nickname, first_name?, last_name?)` to claim/create and set `auth_user_id`; `update_last_login()` to stamp `last_login_at`.

- **session_instructors**  
  - `session_id (FK → class_sessions.id)`  
  - `instructor_id (FK → instructors.id)`  
  Purpose: Many-to-many linking instructors to sessions (inherits schedule via the session).

## Relationships
- schedules → class_sessions (1:M) via `class_sessions.schedule_id`  
- classes → class_sessions (1:M) via `class_sessions.class_id`  
- locations → class_sessions (1:M) via `class_sessions.location_id`  
- class_sessions → session_instructors (1:M) via `session_instructors.session_id`  
- instructors → session_instructors (1:M) via `session_instructors.instructor_id`

## Why It’s NL-Friendly
- Clear nouns = tables (who/what/where/when/which schedule).  
- Clear links = FKs and join table: `session_instructors` ties instructors to sessions; `class_sessions` ties schedule/class/location/time.  
- Simple filters/joins for natural questions:  
  - “What does DANIELLE teach on Thursday?” → instructors → session_instructors → class_sessions → classes/locations.  
  - “What’s in the Studio Monday at 5pm?” → class_sessions filter by location/time → classes/instructors.  
  - “Who teaches BODYCOMBAT™ this week?” → classes → sessions → session_instructors → instructors.  
  - “Free time at MB 11–3 Tuesday?” → class_sessions filter by location/time; compute gaps.  
- Times stored as time-of-day with `day_of_week` and `schedule_id`, keeping queries straightforward.

## Current Status (context)
- schedule: September 2025 (`a5af3ce8-9729-4073-b399-ee02e3268330`)  
- `class_sessions`: 124 rows (for this schedule)  
- `session_instructors`: 129 links


