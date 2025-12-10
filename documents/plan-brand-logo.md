# Plan: Brand Screens with YMCA Logo

## 1. Asset & Helper Setup
- Download the YMCA icon (`https://ymcasouthflorida.org/wp-content/uploads/2023/10/Icon-logo.png`) and add it to `assets/images/`.
- Create a reusable header component or helper that renders the logo plus branch text. Default branch label: “Of the Greater Rochester Area”; allow override when the instructor’s branch name is available.

## 2. Update Targeted Screens
- `app/welcome.tsx`: add the logo/branch header to the top-left, sized responsively.
- `app/auth/login.tsx`: same branded header above the form.
- `app/auth/onboarding.tsx`: add header to the main screen and (if needed) the modal so the branding remains consistent.
- `app/attendance.tsx`: add header row with the logo on the left and branch text (resolved from params/instructor) beside it.

## 3. Branch Detection Logic
- Treat the instructor’s `branch_id` chosen during onboarding as their primary branch. When a session already exists, fetch the branch name from Supabase and cache it next to the `last-attendance-claim` entry so all screens can reuse it.
- For screens without a resolved branch (before login), display the default “Of the Greater Rochester Area.” Once a session or instructor context exists, show the actual branch name (or the cached one).

## 4. Polish & Theme Alignment
- Ensure logo sizing and spacing look good across phone sizes and match the existing green gradient theme.
- Update imports and shared helpers as needed so the branded header can be reused on the four screens.


