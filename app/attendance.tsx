import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
    ActivityIndicator,
    BackHandler,
    FlatList,
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    Platform,
    StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ThemedDialog, { DialogButton } from '@/components/themed-dialog';
import {
    AttendancePeriod,
    dayNames,
    FALLBACK_EFFECTIVE_MONTH,
    fetchInstructorSessions,
    SessionRow,
    updateHeadcount,
} from '@/lib/attendance';
import { supabase } from '@/lib/supabase';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

const periodOptions: AttendancePeriod[] = ['month', 'week', 'day'];
const DEFAULT_BRANCH_LABEL = 'Of the Greater Rochester Area';
type BranchOption = { id: string; name: string; isPrimary: boolean };

type SaveBanner = { type: 'success' | 'error'; text: string };

const weekdayRank = dayNames.reduce(
  (acc, day, index) => {
    acc[day] = index;
    return acc;
  },
  {} as Record<string, number>
);
const FALLBACK_DAY_RANK = dayNames.length + 1;
const weekdayIndexByLower = Object.fromEntries(dayNames.map((d, i) => [d.toLowerCase(), i])) as Record<string, number>;

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatMmDdYyyy = (d: Date) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
const formatTime12h = (timeStr?: string | null) => {
  if (!timeStr) return '';
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return String(timeStr);
  const hours24 = Number(match[1]);
  const minutes = Number(match[2]);
  if ([hours24, minutes].some((n) => Number.isNaN(n))) return String(timeStr);
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = ((hours24 + 11) % 12) + 1;
  return `${pad2(hours12)}:${pad2(minutes)} ${suffix}`;
};
const parseYmd = (ymd?: string | null) => {
  if (!ymd) return null;
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);
  if ([year, month, day].some((n) => Number.isNaN(n))) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0); // noon avoids DST edge cases
};

// Derive a concrete date within the schedule month for display, based on day-of-week.
// If "today" is within the schedule month, we show the next occurrence on/after today.
// Otherwise, we show the first occurrence in the month.
const getSessionDateLabel = (dayOfWeek: string, effectiveMonthYmd: string, anchorNow: Date) => {
  const target = weekdayIndexByLower[dayOfWeek.trim().toLowerCase()];
  const monthStart = parseYmd(effectiveMonthYmd);
  if (target == null || !monthStart) return '';

  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12, 0, 0, 0);
  const anchor = new Date(anchorNow.getFullYear(), anchorNow.getMonth(), anchorNow.getDate(), 12, 0, 0, 0);
  const base = anchor >= monthStart && anchor <= monthEnd ? anchor : monthStart;

  const delta = (target - base.getDay() + 7) % 7;
  let candidate = new Date(base);
  candidate.setDate(base.getDate() + delta);
  if (candidate > monthEnd) {
    const firstDelta = (target - monthStart.getDay() + 7) % 7;
    candidate = new Date(monthStart);
    candidate.setDate(monthStart.getDate() + firstDelta);
  }
  return formatMmDdYyyy(candidate);
};

const timeToSeconds = (timeStr?: string | null) => {
  if (!timeStr) return Number.POSITIVE_INFINITY;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return Number.POSITIVE_INFINITY;
  const [, h, m, s] = match;
  const hours = Number(h);
  const minutes = Number(m);
  const seconds = Number(s ?? '0');
  if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return Number.POSITIVE_INFINITY;
  return hours * 3600 + minutes * 60 + seconds;
};

export default function AttendanceScreen() {
  useImmersiveNavBar();
  const params = useLocalSearchParams<{ branchId?: string; period?: AttendancePeriod; nickname?: string }>();
  const [period, setPeriod] = useState<AttendancePeriod>(params.period ?? 'month');
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [headcounts, setHeadcounts] = useState<Record<string, string>>({});
  const [resolvedNickname, setResolvedNickname] = useState<string | null>(null);
  const [resolvedFirstName, setResolvedFirstName] = useState<string | null>(null);
  const [resolvedLastName, setResolvedLastName] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [effectiveMonth, setEffectiveMonth] = useState<string>(FALLBACK_EFFECTIVE_MONTH);
  const [scheduleLabel, setScheduleLabel] = useState<string>('Schedule');
  const [classNameById, setClassNameById] = useState<Record<string, string>>({});
  const [locationNameById, setLocationNameById] = useState<Record<string, string>>({});
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(params.branchId ?? null);
  const [selectedBranchName, setSelectedBranchName] = useState<string>(DEFAULT_BRANCH_LABEL);
  const [saveBannerBySessionId, setSaveBannerBySessionId] = useState<Record<string, SaveBanner>>({});
  const saveBannerTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string; buttons?: DialogButton[] }>({
    visible: false,
    title: '',
    message: '',
    buttons: undefined,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const canSetBehavior = Constants.appOwnership !== 'expo';
    if (canSetBehavior) {
      NavigationBar.setBehaviorAsync('inset-swipe').catch(() => {});
    }
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    RNStatusBar.setHidden(true, 'slide');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const canSetBehavior = Constants.appOwnership !== 'expo';
      if (canSetBehavior) {
        NavigationBar.setBehaviorAsync('inset-swipe').catch(() => {});
      }
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      RNStatusBar.setHidden(true, 'slide');
    }, [])
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showDialog = (title: string, message: string, buttons?: DialogButton[]) => {
    setDialog({ visible: true, title, message, buttons });
  };
  const closeDialog = () => setDialog({ visible: false, title: '', message: '', buttons: undefined });

  const showSaveBanner = useCallback((sessionId: string, banner: SaveBanner) => {
    setSaveBannerBySessionId((prev) => ({ ...prev, [sessionId]: banner }));

    const existing = saveBannerTimersRef.current[sessionId];
    if (existing) clearTimeout(existing);

    saveBannerTimersRef.current[sessionId] = setTimeout(() => {
      setSaveBannerBySessionId((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      delete saveBannerTimersRef.current[sessionId];
    }, 7000);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(saveBannerTimersRef.current).forEach((t) => clearTimeout(t));
      saveBannerTimersRef.current = {};
    };
  }, []);

  const openCloseAppDialog = useCallback(() => {
    showDialog(
      'Close app',
      'Select Logout to log on as another instructor or just close the app and stay logged in ?',
      [
        {
          label: 'Logout',
          align: 'left',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/auth/login');
          },
        },
        { label: 'No', onPress: closeDialog },
        { label: 'Yes', onPress: () => BackHandler.exitApp() },
      ]
    );
  }, []);

  const subtitle = useMemo(() => {
    if (!resolvedNickname && !resolvedFirstName && !resolvedLastName) return '';
    const parts = [resolvedFirstName, resolvedLastName].filter(Boolean);
    const namePart = parts.length ? parts.join(' ') : '';
    const nickPart = resolvedNickname ? `(${resolvedNickname})` : '';
    const text = [namePart, nickPart].filter(Boolean).join(' ').trim();
    return text ? `For: ${text}` : '';
  }, [resolvedNickname, resolvedFirstName, resolvedLastName]);

  const isDayView = period === 'day';
  const isWeekView = period === 'week';

  const resolveLatestSchedule = useCallback(async (branchId?: string | null) => {
    if (!branchId) return null;
    // Prefer "published" schedules; fall back to approved (legacy semantics).
    // NOTE: Some environments may not grant app users SELECT on schedules. In that case,
    // fall back to deriving the latest month from class_sessions (which includes schedule_id).
    try {
      // Try published first (fresh builder each time to avoid mutating filters).
      const published = await supabase
        .from('schedules')
        .select('id, name, month_start, status, is_approved, published_at')
        .eq('branch_id', branchId)
        .eq('status', 'published')
        .order('month_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!published.error && published.data) return published.data;

      // Fall back to approved schedules (many environments keep status=draft but still treat as published).
      const approved = await supabase
        .from('schedules')
        .select('id, name, month_start, status, is_approved, published_at')
        .eq('branch_id', branchId)
        .or('is_approved.eq.true,published_at.not.is.null')
        .order('month_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!approved.error && approved.data) return approved.data;

      // As a last resort, take the latest schedule row for the branch.
      const any = await supabase
        .from('schedules')
        .select('id, name, month_start, status, is_approved, published_at')
        .eq('branch_id', branchId)
        .order('month_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!any.error && any.data) return any.data;
    } catch (err) {
      // Ignore and fall back below.
    }

    // Fallback: derive latest month + schedule_id directly from class_sessions for this branch.
    const fromSessions = await supabase
      .from('class_sessions')
      .select('effective_month, schedule_id')
      .eq('branch_id', branchId)
      .order('effective_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fromSessions.error && fromSessions.data?.schedule_id && fromSessions.data?.effective_month) {
      const monthStart = String(fromSessions.data.effective_month);
      const name = new Date(`${monthStart}T00:00:00`).toLocaleString(undefined, { month: 'long', year: 'numeric' });
      return {
        id: String(fromSessions.data.schedule_id),
        name,
        month_start: monthStart,
        status: null,
        is_approved: null,
        published_at: null,
      } as any;
    }

    return null;
  }, []);

  const loadSessions = useCallback(
    async (explicitInstructorId?: string | null, explicitBranchId?: string | null) => {
      const targetInstructor = explicitInstructorId ?? instructorId;
      if (!targetInstructor) {
        setLoading(false);
        return;
      }
      const branchFilter = explicitBranchId ?? selectedBranchId;
      const schedule = await resolveLatestSchedule(branchFilter);
      const resolvedScheduleId = schedule?.id ?? null;
      const resolvedEffectiveMonth = schedule?.month_start ? String(schedule.month_start) : effectiveMonth;
      const resolvedLabel =
        schedule?.name && String(schedule.name).trim()
          ? String(schedule.name).trim()
          : resolvedEffectiveMonth
            ? new Date(`${resolvedEffectiveMonth}T00:00:00`).toLocaleString(undefined, { month: 'long', year: 'numeric' })
            : 'Schedule';
      setScheduleId(resolvedScheduleId);
      setEffectiveMonth(resolvedEffectiveMonth);
      setScheduleLabel(resolvedLabel);
      setLoading(true);
      const { data, error } = await fetchInstructorSessions({
        period,
        instructorId: targetInstructor,
        dayOfWeek: period === 'day' ? selectedDay : undefined,
        effectiveMonth: resolvedEffectiveMonth,
        scheduleId: resolvedScheduleId ?? undefined,
        branchId: branchFilter ?? undefined,
      });
      if (error) {
        showDialog('Error', error.message ?? 'Unable to load sessions');
        setLoading(false);
        return;
      }
      const deduped: SessionRow[] = [];
      const seen = new Set<string>();
      (data ?? []).forEach((row) => {
        const key = row.session_id;
        if (key && !seen.has(key)) {
          seen.add(key);
          deduped.push(row);
        }
      });
      deduped.sort((a, b) => {
        const csA = a.class_sessions;
        const csB = b.class_sessions;
        // Prefer true session dates when present; fall back to weekday ordering.
        const dateA = csA?.session_date ? parseYmd(csA.session_date) : null;
        const dateB = csB?.session_date ? parseYmd(csB.session_date) : null;
        if (dateA && dateB && dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
        const rankA = csA?.day_of_week ? weekdayRank[csA.day_of_week] ?? FALLBACK_DAY_RANK : FALLBACK_DAY_RANK;
        const rankB = csB?.day_of_week ? weekdayRank[csB.day_of_week] ?? FALLBACK_DAY_RANK : FALLBACK_DAY_RANK;
        if (rankA !== rankB) return rankA - rankB;
        const timeA = timeToSeconds(csA?.start_time);
        const timeB = timeToSeconds(csB?.start_time);
        if (timeA !== timeB) return timeA - timeB;
        return 0;
      });

      const nextCounts: Record<string, string> = {};
      (data ?? []).forEach((row) => {
        const cs = row.class_sessions;
        if (cs?.id) {
          if (Number.isFinite(cs.headcount as number)) {
            nextCounts[cs.id] = String(cs.headcount);
          } else {
            nextCounts[cs.id] = '';
          }
        }
      });

      // If embedded class/location names are missing, fetch by IDs as a fallback.
      const missingClassIds: string[] = [];
      const missingLocationIds: string[] = [];
      for (const row of deduped) {
        const cs: any = row.class_sessions;
        if (!cs) continue;
        const embeddedClassName = (Array.isArray(cs.classes) ? cs.classes[0]?.name : cs.classes?.name) ?? null;
        const embeddedLocationName = (Array.isArray(cs.locations) ? cs.locations[0]?.name : cs.locations?.name) ?? null;
        if (!embeddedClassName && cs.class_id) missingClassIds.push(String(cs.class_id));
        if (!embeddedLocationName && cs.location_id) missingLocationIds.push(String(cs.location_id));
      }
      const uniqClassIds = Array.from(new Set(missingClassIds)).filter(Boolean);
      const uniqLocationIds = Array.from(new Set(missingLocationIds)).filter(Boolean);

      if (uniqClassIds.length) {
        const { data: classRows } = await supabase.from('classes').select('id, name').in('id', uniqClassIds);
        if (classRows?.length) {
          const next = Object.fromEntries(
            (classRows as any[]).filter((r) => r?.id && r?.name).map((r) => [String(r.id), String(r.name)])
          ) as Record<string, string>;
          setClassNameById((prev) => ({ ...prev, ...next }));
        }
      }

      if (uniqLocationIds.length) {
        const { data: locationRows } = await supabase.from('locations').select('id, name').in('id', uniqLocationIds);
        if (locationRows?.length) {
          const next = Object.fromEntries(
            (locationRows as any[]).filter((r) => r?.id && r?.name).map((r) => [String(r.id), String(r.name)])
          ) as Record<string, string>;
          setLocationNameById((prev) => ({ ...prev, ...next }));
        }
      }

      setSessions(deduped);
      setHeadcounts(nextCounts);
      setLoading(false);
    },
    [instructorId, period, selectedBranchId, selectedDay, effectiveMonth, resolveLatestSchedule]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        showDialog('Auth error', sessionErr.message ?? 'Unable to check session');
        setLoading(false);
        return;
      }
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        showDialog('Sign in required', 'Please sign in to view attendance.', [
          { label: 'Go to welcome', onPress: () => router.replace('/welcome') },
        ]);
        setLoading(false);
        return;
      }

      const { data: instructor, error: instructorErr } = await supabase
        .from('instructors')
        .select('id, nickname, branch_id, first_name, last_name')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (instructorErr) {
        showDialog('Error', instructorErr.message ?? 'Unable to load instructor');
        setLoading(false);
        return;
      }
      if (!instructor) {
        showDialog('Not found', 'No instructor linked to this account.');
        setLoading(false);
        return;
      }

      setResolvedNickname(instructor.nickname ?? null);
      setResolvedFirstName(instructor.first_name ?? null);
      setResolvedLastName(instructor.last_name ?? null);

      const { data: branchesData, error: branchesErr } = await supabase
        .from('instructor_branches')
        .select('branch_id, is_primary, ymca_branches(name)')
        .eq('instructor_id', instructor.id);

      let branchList: BranchOption[] = [];
      let branchIdToUse: string | null = params.branchId ?? instructor.branch_id ?? null;

      if (branchesErr) {
        console.warn('Failed to load instructor branches', branchesErr);
      } else if (branchesData) {
        const branchRows = branchesData as any[];
        branchList =
          branchRows
            ?.filter((item) => Boolean(item.branch_id))
            .map((item) => ({
              id: item.branch_id,
              name:
                // PostgREST embed name may differ across environments; check common keys.
                item?.ymca_branches?.name ??
                item?.branches?.name ??
                'Branch',
              isPrimary: Boolean(item.is_primary),
            })) ?? [];
        if (branchList.length) {
          branchIdToUse =
            params.branchId ??
            branchList.find((b) => b.isPrimary)?.id ??
            instructor.branch_id ??
            branchList[0]?.id ??
            null;
        }
      }

      setBranchOptions(branchList);
      setSelectedBranchId(branchIdToUse);
      const initialBranchName = branchList.find((b) => b.id === branchIdToUse)?.name ?? DEFAULT_BRANCH_LABEL;
      setSelectedBranchName(initialBranchName);
      setInstructorId(instructor.id);
    };
    load();
  }, [params.branchId, params.nickname]);

  useEffect(() => {
    if (!selectedBranchId) {
      setSelectedBranchName(DEFAULT_BRANCH_LABEL);
      return;
    }
    const match = branchOptions.find((b) => b.id === selectedBranchId);
    setSelectedBranchName(match?.name ?? DEFAULT_BRANCH_LABEL);
  }, [selectedBranchId, branchOptions]);

  useEffect(() => {
    if (!instructorId) return;
    loadSessions(instructorId);
  }, [instructorId, loadSessions]);

  useEffect(() => {
    if (!instructorId) return;
    if (!selectedBranchId) return;
    loadSessions(instructorId, selectedBranchId);
  }, [selectedBranchId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const saveHeadcount = async (sessionId: string, headcountValue: string, submittedAt?: string | null) => {
    const headcount = Number(headcountValue || 0);
    setSavingId(sessionId);

    const nowIso = new Date().toISOString();
    const prevCs = sessions.find((r) => r.class_sessions?.id === sessionId)?.class_sessions ?? null;
    const prevFields = prevCs
      ? {
          headcount: prevCs.headcount,
          headcount_submitted_at: prevCs.headcount_submitted_at,
          headcount_updated_at: prevCs.headcount_updated_at,
        }
      : null;
    const prevHeadcountText = headcounts[sessionId] ?? '';
    const optimisticSubmittedAt = submittedAt ?? prevCs?.headcount_submitted_at ?? nowIso;

    // Optimistic UI update: avoid full refresh/flash.
    setSessions((prev) =>
      prev.map((row) => {
        const cs = row.class_sessions;
        if (!cs || cs.id !== sessionId) return row;
        return {
          ...row,
          class_sessions: {
            ...cs,
            headcount,
            headcount_updated_at: nowIso,
            headcount_submitted_at: optimisticSubmittedAt,
          },
        };
      })
    );

    const { error } = await updateHeadcount(sessionId, headcount, submittedAt);
    if (error) {
      // Roll back optimistic changes.
      if (prevFields) {
        setSessions((prev) =>
          prev.map((row) => {
            const cs = row.class_sessions;
            if (!cs || cs.id !== sessionId) return row;
            return {
              ...row,
              class_sessions: {
                ...cs,
                headcount: prevFields.headcount,
                headcount_submitted_at: prevFields.headcount_submitted_at,
                headcount_updated_at: prevFields.headcount_updated_at,
              },
            };
          })
        );
      }
      setHeadcounts((prev) => ({ ...prev, [sessionId]: prevHeadcountText }));
      showSaveBanner(sessionId, { type: 'error', text: 'Save failed' });
    } else {
      showSaveBanner(sessionId, { type: 'success', text: 'Saved' });
    }

    setSavingId(null);
  };

  const renderItem = ({ item }: { item: SessionRow }) => {
    const cs = item.class_sessions;
    if (!cs) return null;
    const countValue = headcounts[cs.id] ?? '';
    const className =
      (Array.isArray(cs.classes) ? cs.classes[0]?.name : cs.classes?.name) ??
      '';
    const locationName =
      (Array.isArray(cs.locations) ? cs.locations[0]?.name : cs.locations?.name) ??
      '';
    const resolvedClassName =
      (className && String(className).trim()) ||
      (cs.class_id ? classNameById[String(cs.class_id)] : '') ||
      'Unknown class';
    const resolvedLocationName =
      (locationName && String(locationName).trim()) ||
      (cs.location_id ? locationNameById[String(cs.location_id)] : '') ||
      '';
    const sessionDateLabel = cs.session_date
      ? formatMmDdYyyy(parseYmd(cs.session_date) ?? new Date(String(cs.session_date)))
      : getSessionDateLabel(cs.day_of_week, effectiveMonth, now);
    const startLabel = formatTime12h(cs.start_time);
    const endLabel = formatTime12h(cs.end_time);
    const saveBanner = saveBannerBySessionId[cs.id];
    const hasExistingHeadcount =
      Number.isFinite(cs.headcount as number) || Boolean(cs.headcount_submitted_at) || Boolean(cs.headcount_updated_at);
    return (
      <View style={[styles.card, dialog.visible && styles.cardDimmed]}>
        <Text style={styles.className}>{resolvedClassName}</Text>
        {resolvedLocationName ? <Text style={styles.meta}>{resolvedLocationName}</Text> : null}
        <Text style={styles.meta}>
          {cs.day_of_week}
          {sessionDateLabel ? ` ${sessionDateLabel}` : ''} • {startLabel || cs.start_time} - {endLabel || cs.end_time}
        </Text>
        {saveBanner ? (
          <View
            style={[
              styles.saveBanner,
              saveBanner.type === 'success' ? styles.saveBannerSuccess : styles.saveBannerError,
            ]}
          >
            <Text style={styles.saveBannerText}>{saveBanner.text}</Text>
          </View>
        ) : null}
        <TextInput
          style={[styles.input, dialog.visible && styles.inputDimmed]}
          keyboardType="number-pad"
          placeholder="Headcount"
          value={countValue}
          onChangeText={(text) =>
            setHeadcounts((prev) => ({
              ...prev,
              [cs.id]: text.replace(/[^0-9]/g, ''),
            }))
          }
        />
        <Text style={styles.helper}>
          {cs.headcount_submitted_at
            ? `Submitted: ${new Date(cs.headcount_submitted_at).toLocaleString()}`
            : 'Not submitted yet'}
        </Text>
        <Text style={styles.helper}>
          {cs.headcount_updated_at ? `Updated: ${new Date(cs.headcount_updated_at).toLocaleString()}` : ''}
        </Text>
        <View style={styles.buttonRowCompact}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={savingId === cs.id}
            style={[styles.saveButton, savingId === cs.id ? styles.saveButtonDisabled : null]}
            onPress={() => saveHeadcount(cs.id, countValue, cs.headcount_submitted_at)}>
            <Text style={styles.saveButtonText}>
              {savingId === cs.id ? 'Saving...' : hasExistingHeadcount ? 'Update headcount' : 'Save headcount'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <>
      <ThemedDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={closeDialog}
      />
    <LinearGradient colors={['#01A490', '#052e16']} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
      <LinearGradient colors={['#01A490', '#0f172a']} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandHeader}>
            <Image source={require('../assets/images/ymca-logo.v2.png')} style={styles.brandLogo} />
            <View style={styles.brandText}>
              <Text style={styles.title}>YMCA Attendance</Text>
              <Text style={styles.branchText} numberOfLines={2} ellipsizeMode="tail">
                {selectedBranchName || DEFAULT_BRANCH_LABEL}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.subtitleCentered}>{scheduleLabel}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitleCentered}>{subtitle}</Text> : null}
        {branchOptions.length > 1 ? (
          <View style={styles.branchPicker}>
            <Text style={styles.helperSmall}>Select Branch</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedBranchId ?? branchOptions[0]?.id}
                onValueChange={(val) => setSelectedBranchId(String(val))}
                style={styles.picker}
              >
                {branchOptions.map((branch) => (
                  <Picker.Item key={branch.id} label={branch.name} value={branch.id} />
                ))}
              </Picker>
            </View>
          </View>
        ) : null}
        <View style={styles.periodRow}>
          <View style={styles.periodButtons}>
            {periodOptions.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPeriod(p)}
                style={[styles.periodButton, period === p ? styles.periodSelected : null]}>
                <Text style={[styles.periodButtonText, period === p ? styles.periodButtonTextSelected : null]}>
                  {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={openCloseAppDialog}
            style={styles.closeInlineButton}>
            <Ionicons name="close" size={16} color="#0f172a" />
            <Text style={styles.closeInlineText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.liveClock}>
          {`${now.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: '2-digit',
            year: 'numeric',
          })} @ ${now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })}`}
        </Text>
        {isDayView ? (
          <View style={styles.pickerContainer}>
            <Picker selectedValue={selectedDay} onValueChange={(val) => setSelectedDay(val)} style={styles.picker}>
              {dayNames.map((d) => (
                <Picker.Item key={d} label={d} value={d} />
              ))}
            </Picker>
          </View>
        ) : null}
        {isWeekView ? (
          <Text style={styles.helperSmall}>Week view shows all days grouped for the month.</Text>
        ) : null}
      </LinearGradient>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.session_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#facc15" />
              <Text style={styles.empty}>Loading sessions…</Text>
            </View>
          ) : (
            <Text style={styles.empty}>No sessions found.</Text>
          )
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </SafeAreaView>
    </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  header: { paddingTop: 10, paddingHorizontal: 14, paddingBottom: 10, gap: 6, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderWidth: 1, borderColor: 'rgba(248,250,252,0.16)' },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  brandLogo: { width: 48, height: 48 },
  brandText: { gap: 2, alignItems: 'flex-start', flexShrink: 1, flex: 1 },
  title: { fontSize: 26, fontWeight: '700', color: '#f8fafc', textAlign: 'left' },
  branchText: { color: '#e2e8f0', fontWeight: '600', textAlign: 'left', flexShrink: 1, flexWrap: 'wrap' },
  logout: {
    color: '#0f172a',
    fontWeight: '700',
    backgroundColor: '#facc15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  subtitle: { color: '#f8fafc' },
  subtitleCentered: { color: '#f8fafc', textAlign: 'center', fontWeight: '700', marginTop: 10, fontSize: 18, width: '100%' },
  titleRow: { alignItems: 'center', marginTop: 10, width: '100%' },
  notice: { color: '#b91c1c', marginTop: 4 },
  periodRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, marginTop: 6 },
  periodButtons: { flexDirection: 'row', gap: 8, flexShrink: 1, flexWrap: 'wrap', flex: 1 },
  liveClock: {
    marginTop: 6,
    textAlign: 'center',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  closeInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#facc15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  closeInlineText: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    borderRadius: 8,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  periodButtonText: { color: '#e2e8f0', fontWeight: '700' },
  periodButtonTextSelected: { color: '#0f172a' },
  periodSelected: { borderColor: '#facc15', backgroundColor: '#facc15', fontWeight: '800' },
  list: { padding: 12, gap: 8 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 28, gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.22)',
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#ffffff',
    gap: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardDimmed: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  className: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#1f2937', fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDimmed: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderColor: 'rgba(255,255,255,0.35)',
    color: '#f8fafc',
  },
  helper: { color: '#1f2937', fontSize: 13 },
  helperSmall: { color: '#334155', fontSize: 12 },
  saveBanner: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  saveBannerSuccess: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  saveBannerError: { backgroundColor: '#fee2e2', borderColor: '#dc2626' },
  saveBannerText: { color: '#0f172a', fontWeight: '800', fontSize: 12 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 4 },
  buttonRowCompact: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 5 },
  saveButton: {
    backgroundColor: '#01A490',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
  },
  saveButtonText: { color: '#fff', fontWeight: '700' },
  saveButtonDisabled: { opacity: 0.6 },
  empty: { textAlign: 'center', marginTop: 40, color: '#e2e8f0' },
  branchPicker: { marginTop: 8, gap: 4 },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  picker: { marginTop: -4, color: '#f8fafc' },
});


