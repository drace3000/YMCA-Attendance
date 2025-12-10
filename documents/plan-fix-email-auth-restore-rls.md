# Plan: Fix Email Auth & Restore RLS

## 1) Audit current auth flow and RLS assumptions
- Review `app/auth/onboarding.tsx` email/password logic and session handling, confirm Supabase env vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) and PKCE usage in `lib/supabase.ts`.
- Verify required RPCs exist and align with code: `nickname_exists`, `claim_instructor`, `update_last_login` (per `documents/auth-branch-nickname-login-plan.md`).
- Check current Supabase auth settings (email confirmation, redirect URLs) for project `YMCS-Attendance-Tracker`.

## 2) Fix email auth onboarding path
- Adjust `handleEmailAuth` in `app/auth/onboarding.tsx` to handle sign-in vs sign-up cleanly, surface confirm-email state, and ensure `completeOnboarding` runs exactly once when a session exists.
- Ensure branch/nickname validation gates auth, and avoid flows that leave the user signed-in without claiming.

## 3) Restore secure RLS
- Remove temporary open policies in `documents/temp-rls-test-policy.sql` and re-apply intended policies from `documents/supabase-auth-user-mapping.sql` (class_sessions, session_instructors, instructors) in the Supabase project.
- Confirm tables have RLS enabled and policies reference `auth.uid()` via `auth_user_id`; ensure `claim_instructor` links the current user.

## 4) Validate end-to-end with RLS on
- With RLS enforced, run onboarding for: (a) existing nickname and (b) new nickname; verify sessions load and headcount updates succeed.
- Attempt unauthorized access (different user, anon) to confirm selects/updates are blocked. Document results in `documents/` for future reference.

### Todos
- Audit auth flow, env vars, and required RPCs
- Patch onboarding email/password flow and claiming
- Drop temp open policies and apply intended RLS
- Test flows with RLS on and document results


