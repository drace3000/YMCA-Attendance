# Supabase Schema Overview (YMCA)

## Core Tables
- **schedules**: `id (uuid, PK)`, `name`, `month_start`, `status`, `published_at`, `created_at`  
  Defines a schedule period (e.g., “September 2025”).
- **classes**: `id (uuid, PK)`, `name`, `description?`, `category?`, `created_at`  
  Catalog of class types.
- **locations**: `id (uuid, PK)`, `code`, `name`, `created_at`  
  Physical/virtual locations (e.g., Studio, MB/Mindbody).
- **instructors**: `id (uuid, PK)`, `raw_name`, `first_name?`, `last_name?`, `nickname?`, `pin?`, `created_at`  
  People who teach classes. (`raw_name` holds the source display name.)

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
  Purpose: Instances of classes in a given schedule (when/where/what).

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

