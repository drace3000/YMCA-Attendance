---
name: auth-branch-nickname-login
overview: Add branch-scoped nickname auth flow with Supabase providers and Expo login start for instructors.
---

# Branch-scoped nickname auth & login

- Schema updates: add `branches` table; add `branch_id` FK to `instructors`; enforce unique `(branch_id, nickname)`; add `auth_user_id` (unique) and `last_login_at` to `instructors`; keep instructors as the user entity linked by `auth_user_id`.
- Auth setup: enable Email/Password and Google in Supabase (other providers can be added later); plan JWT claims/metadata to carry instructor_id and branch_id after nickname verification.
- Nickname onboarding flow: screen asks if they have a prior schedule nickname; branch selection + nickname check against `(branch_id, nickname)`; create/link instructor if new nickname (respect uniqueness); collect first/last name; then complete auth signup/sign-in.
- App routing: first-time users go through nickname + profile + provider login; returning users with stored session go directly to today’s classes/attendance list; show last login timestamp.
- Data sync: on login success, call RPC `claim_instructor(branch_id, nickname, first_name?, last_name?)` to set `auth_user_id`, then call `update_last_login()`; fetch today’s `class_sessions` linked via `session_instructors` (RLS uses `auth_user_id`) and show attendance entry.
- RLS outline: instructors can only read/update sessions they teach (via session_instructors); defer approval RLS until defined; scope by `branch_id` where applicable.
- Docs: add schema and flow notes to `documents/` describing new tables/constraints and the login/onboarding steps.

