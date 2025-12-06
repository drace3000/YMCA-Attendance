---
title: Expo login & onboarding outline (branch + nickname + Supabase auth)
---

## Goals
- Enforce branch-scoped nickname onboarding before auth signup/sign-in.
- Support Email/Password and Google.
- Persist session; return directly to Today’s classes on subsequent app opens.
- Update `instructors.last_login_at` via RPC after successful auth.
- Let instructors declare if the nickname is existing vs new; validate against `(branch_id, nickname)` accordingly.

## Screens / flow (recommended)
1) Splash/loading: restore Supabase session; if valid, go to Today’s classes.
2) Branch & nickname check:
   - Ask: “Have you used a nickname on a class schedule before?” Yes/No (existing vs new).
   - Select branch (list from `branches`, default “Main”).
   - If Yes: enter nickname → verify `(branch_id, nickname)` exists.
   - If No: enter desired nickname → verify `(branch_id, nickname)` is available.
3) Profile capture: first_name, last_name (optional pin later).
4) Auth choice:
   - Email/Password signup or sign-in.
   - Google OAuth (Supabase `auth.signInWithOAuth`).
5) Post-auth:
   - Link Supabase user to instructor: ensure `auth.user.id = instructors.id` (or store mapping) when nickname matched/created.
   - Call RPC `update_last_login()` (security definer) to set `last_login_at`.
   - Navigate to Today’s classes (tab or stack screen).
6) Today’s classes screen:
   - Query sessions for today via `session_instructors` → `class_sessions` with RLS filtering to auth user.
   - Show class name, time, location, headcount field; allow submit/update headcount; display `last_login_at`.

## Data/API calls
- `branches`: `select id, code, name` for branch picker.
- Nickname check:
  - Existing: `select id from instructors where branch_id = ? and nickname = ? limit 1`.
  - New: same query to confirm none exists, then insert instructor (service role or RPC) OR reuse existing if seeded.
- Auth:
  - Email/password: `signUp({ email, password, options: { data: { branch_id, nickname } } })` or `signInWithPassword`.
  - Google: `signInWithOAuth({ provider: 'google', options: { redirectTo: <scheme>://auth/callback, queryParams: { access_type: 'offline', prompt: 'consent' }}})`; set `scheme` in `app.json` and allow this redirect in Supabase Auth settings.
- Post-auth:
  - Call `rpc('update_last_login')`.
  - Fetch today’s sessions:
    ```sql
    select cs.*, c.name as class_name, l.name as location_name
    from session_instructors si
    join class_sessions cs on cs.id = si.session_id
    join classes c on c.id = cs.class_id
    join locations l on l.id = cs.location_id
    where si.instructor_id = auth.uid()
      and cs.day_of_week = :today
    order by cs.start_time;
    ```
  - Update headcount: `update class_sessions set headcount = ?, headcount_updated_at = now(), headcount_submitted_at = coalesce(headcount_submitted_at, now()) where id = ?`

## RLS alignment
- Already applied: SELECT/UPDATE on `class_sessions` for sessions linked via `session_instructors`.
- `session_instructors`: SELECT where `instructor_id = auth.uid()`.
- `instructors`: self SELECT/UPDATE.
- Ensure onboarding links `auth.uid()` to the correct instructor row.

## Redirect config for Google
- App scheme is set to `ymcaattendance` in `app.json`; OAuth redirect uses `ymcaattendance://auth/callback`.
- Add this redirect URL to Supabase Auth → Google provider → Redirect URLs.

## UX notes
- Cache branch/nickname choice locally to prefill on next app open if session expired.
- On nickname “No” path, enforce uniqueness before proceeding to auth.
- Surface last login time on Today’s screen (read from `instructors.last_login_at`).

## What to implement first in the app
- Add Supabase client (already present in `lib/supabase.ts`).
- Add navigation routes for: Splash → Nickname/Branch → Profile → Auth → Today’s classes.
- Wire Email/Password and Google sign-in.
- Call `update_last_login()` after successful auth.
- Query today’s sessions using the RLS-filtered join above; render attendance list with headcount input.

