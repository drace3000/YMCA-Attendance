# Plan: Login Screen (Nickname or Email) & Routing

## Goals

1. Add a dedicated `auth/login` screen where instructors can sign in with either their schedule nickname (branch-scoped) or their email + password.
2. Ensure nickname logins resolve to the correct email via a Supabase RPC (`nickname_login_email`) before calling `signInWithPassword`.
3. Update the welcome/start flow:
   - The app always opens on `welcome`.
   - Tapping “Start” checks for an existing session; if present, route directly to `attendance` (using cached branch/nickname if available). Otherwise route to the new login screen.
4. Keep onboarding focused on branch + nickname validation, with instructor detail entry now fully managed inside the themed modal.

## Work Completed

- Created `app/auth/login.tsx`, a themed login screen with:
  - Identifier field (nickname or email) and dynamic branch picker for nickname cases.
  - Password input and “Sign In” CTA that executes `signInWithPassword` after resolving nickname → email via `nickname_login_email`.
  - “Need a new account?” link to `/auth/onboarding`.
  - Stores last-claim details in AsyncStorage upon successful login to preserve direct Attendance routing.
- Added a new Supabase function `public.nickname_login_email(p_branch_id uuid, p_nickname text)` plus grants.
- Registered the screen in `_layout.tsx`.
- Simplified `index.tsx` to redirect to `/welcome` (Welcome controls session-based navigation).
- Updated `welcome.tsx` so “Start” now routes to the login screen when unauthenticated, and straight to Attendance when a session exists.
- Removed inline instructor detail form from onboarding; details modal now collects those fields and runs the auth flow.
- Ensured all popups/modals (nickname dialogs, detail modal) use the YMCA gradient theme.

## Completed Todos

- `modal-form` ✅
- `remove-inline-form` ✅
- `wire-modal-auth` ✅
- `login-screen` (Add new login screen for nickname/email auth) ✅
- `link-login-routing` (Wire welcome Start to login screen) ✅
- `login-sync-main` (Update welcome/onboarding to drop inline form) ✅



