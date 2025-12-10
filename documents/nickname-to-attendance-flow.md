# Nickname-to-Attendance Flow

## Overview
Add nickname-first entry to attendance and a new instructor attendance screen showing September 2025 classes with headcount updates.

## Steps
1) Add shared attendance data helpers in `lib/attendance.ts` to (a) fetch instructor by branch+nickname, (b) load that instructor’s class sessions for a given period (month/week/day) with default September 2025 schedule/effective_month, and (c) update `class_sessions` headcount + submitted/updated timestamps.
2) Update `app/auth/onboarding.tsx` nickname check to surface a "Nickname exists" confirmation and reveal an `Attendance` button that routes to the new attendance screen with the selected branch/nickname (while keeping the existing auth UI intact for later fixes).
3) Create `app/attendance.tsx` screen that, given branch/nickname, verifies/loads the instructor, shows their classes filtered by Month/Week/Day (default September 2025), and lets the instructor edit/save headcount per session (using the shared helpers). Include loading/empty/error states and pull-to-refresh.
4) Wire navigation by registering the attendance route in `app/_layout.tsx` (Stack screen) and ensure redirect/flow works from onboarding and when already authenticated.

## Todos
- Add shared supabase attendance helpers
- Add nickname confirmation and Attendance button
- New screen with period filters and headcount editing
- Register attendance route and navigation



