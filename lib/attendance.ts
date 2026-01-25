import { supabase } from './supabase';

export type AttendancePeriod = 'month' | 'week' | 'day';

// Do NOT hardcode schedule IDs/months. Attendance should resolve these at runtime
// based on the most recent published/approved schedule in the DB.
export const FALLBACK_EFFECTIVE_MONTH = '2025-09-01';

export type SessionRow = {
  session_id: string;
  instructor_id?: string;
  instructors?: {
    branch_id?: string | null;
  } | null;
  class_sessions: {
    id: string;
    schedule_id?: string | null;
    effective_month?: string | null;
    session_date?: string | null;
    class_id?: string | null;
    location_id?: string | null;
    day_of_week: string;
    start_time: string;
    end_time: string;
    headcount: number | null;
    headcount_submitted_at: string | null;
    headcount_updated_at: string | null;
    classes: { name: string | null } | null;
    locations: { name: string | null } | null;
  } | null;
};

export const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type DayName = (typeof dayNames)[number];

export type Instructor = {
  id: string;
  nickname: string | null;
  branch_id: string | null;
};

export async function checkNicknameExists(branchId: string, nickname: string): Promise<boolean | null> {
  const trimmed = nickname.trim();
  if (!branchId || !trimmed) return null;
  try {
    const { data, error } = await supabase.rpc('nickname_exists', {
      p_branch_id: branchId,
      p_nickname: trimmed,
    });
    if (error) {
      if (error?.code === 'PGRST202') return null; // function missing in some environments
      throw error;
    }
    return typeof data === 'boolean' ? data : null;
  } catch (err) {
    console.error('checkNicknameExists failed', err);
    return null;
  }
}

export async function fetchInstructorByNickname(opts: { nickname: string; branchId?: string | null }) {
  const { nickname, branchId } = opts;
  const trimmed = nickname.trim();
  if (!trimmed) return { data: null, error: new Error('Nickname required') };
  const base = supabase.from('instructors').select('id, nickname, branch_id').ilike('nickname', trimmed);

  // Try branch-scoped first when branchId is provided
  if (branchId) {
    const scoped = await base.eq('branch_id', branchId).maybeSingle();
    if (!scoped.error && scoped.data) return scoped;
    // If no data but no hard error, fall through to global search
    if (scoped.error) {
      return scoped;
    }
  }

  // Fallback: any branch with that nickname (case-insensitive)
  const fallback = await base.limit(1).maybeSingle();
  return fallback;
}

export async function fetchInstructorSessions(opts: {
  period: AttendancePeriod;
  instructorId: string;
  dayOfWeek?: string;
  scheduleId?: string;
  effectiveMonth?: string;
  branchId?: string | null;
}): Promise<{ data: SessionRow[]; error: any }> {
  const {
    period,
    instructorId,
    dayOfWeek,
    scheduleId,
    effectiveMonth = FALLBACK_EFFECTIVE_MONTH,
    branchId,
  } = opts;

  if (!instructorId) {
    return { data: [], error: new Error('Instructor id is required') };
  }

  const instructorSelect = branchId ? 'instructors!inner(branch_id)' : 'instructors(branch_id)';

  let query = supabase
    .from('session_instructors')
    .select(
      `session_id, instructor_id, ${instructorSelect}, class_sessions(id, schedule_id, effective_month, session_date, class_id, location_id, day_of_week, start_time, end_time, headcount, headcount_submitted_at, headcount_updated_at, classes(name), locations(name))`
    )
    .eq('instructor_id', instructorId)
    .eq('class_sessions.effective_month', effectiveMonth)
    .order('session_date', { referencedTable: 'class_sessions' })
    .order('start_time', { referencedTable: 'class_sessions' });

  if (scheduleId) {
    query = query.eq('class_sessions.schedule_id', scheduleId);
  }

  if (branchId) {
    query = query.eq('instructors.branch_id', branchId);
  }

  if (period === 'day' && dayOfWeek) {
    query = query.eq('class_sessions.day_of_week', dayOfWeek);
  }

  const { data, error } = await query;
  // Supabase/PostgREST relationship typing can vary by environment; cast to our app shape.
  return { data: ((data ?? []) as any) as SessionRow[], error };
}

export async function updateHeadcount(sessionId: string, headcount: number, submittedAt?: string | null) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('class_sessions')
    .update({
      headcount,
      headcount_updated_at: nowIso,
      headcount_submitted_at: submittedAt ?? nowIso,
    })
    .eq('id', sessionId);
  return { error };
}

