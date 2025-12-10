# Plan: Fix Email Auth, Pending-Email UX, Welcome Splash, and Restore RLS

## 1) Audit auth flow and RLS assumptions
- Review `app/auth/onboarding.tsx` email/password logic, nickname validation, and session handling; confirm Supabase env vars and PKCE setup in `lib/supabase.ts`.
- Verify RPCs `nickname_exists`, `claim_instructor`, `update_last_login` exist and align with onboarding logic.
- Check Supabase auth settings (email confirmation required?, allowed redirect URLs) for `YMCS-Attendance-Tracker`.

## 2) Implement pending-email UX and onboarding rules
- For first-time instructors with only nickname: require branch + nickname validation, first/last name, email, and password. After sign-up, show popup instructing them to confirm email; block further login until confirmed.
- On re-entry with unconfirmed email: when nickname is validated, show popup that confirmation is pending and display the email used; route back to Welcome screen.
- Ensure `completeOnboarding` only runs when session is confirmed; handle nickname-claim errors cleanly.

## 3) Add welcome splash flow and authenticated routing
- Create a startup Welcome screen with splash text and a Start button. If a session exists, Start routes directly to `Attendance`; if not, to onboarding.
- Adjust root navigation to include Welcome as the initial screen (while preserving deep links). Ensure onboarding also routes authenticated users straight to Attendance.

## 4) Add logout access from Attendance
- Add a logout button at the top of the `attendance` screen to sign out and return to Welcome.

## 5) Restore secure RLS
- Drop temporary open policies and reapply intended instructor-scoped RLS (`documents/restore-rls.sql` / `documents/supabase-auth-user-mapping.sql`), ensuring RLS is enabled on `class_sessions`, `session_instructors`, `instructors` and `claim_instructor` is executable by `authenticated`.

## 6) Validate end-to-end with RLS on
- Test flows: (a) new nickname signup with email confirmation required, (b) existing nickname login with correct password, (c) pending-email retry showing reminder and returning to Welcome, (d) anonymous/other-user access blocked by RLS, (e) logout from Attendance returns to Welcome.
- Document results in `documents/`.

### Todos  _(updated Dec 7, 2025 16:45 ET)_
- Audit auth flow, env vars, RPCs ✅
- Pending-email UX and onboarding rules ✅
- Welcome splash and routing changes ✅
- Add logout on Attendance ✅
- Branding polish across screens (welcome, onboarding, attendance, today) ✅
- Restore RLS (drop temp policies, reapply intended) ✅
- Validate auth/RLS flows and document ⏳

