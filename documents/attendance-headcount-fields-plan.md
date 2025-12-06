---
name: attendance-headcount-fields
overview: Add headcount, timestamps, and manager approval fields to class_sessions in Supabase.
---

# Add headcount & approval fields to `class_sessions`

- Add five columns: `headcount` (integer, nullable), `headcount_submitted_at` (timestamptz), `headcount_updated_at` (timestamptz), `manager_approved` (boolean), `manager_approved_at` (timestamptz).
- Migration: apply `documents/supabase-headcount-migration.sql` to add the columns (nulls allowed; no triggers/constraints needed now).
- API usage: instructors set `headcount` on submit and update `headcount_updated_at`; first submission sets `headcount_submitted_at`. Managers set `manager_approved` and `manager_approved_at`.
- RLS: headcount updates can be enabled for instructors now; approval-related RLS and logic are deferred until an approval process is decided. Managers’ approval policy can be added later.
- Docs: schema overview updated to list the new columns and note that approval is not yet enforced.

