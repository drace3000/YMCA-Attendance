import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
    DEFAULT_EFFECTIVE_MONTH,
    DEFAULT_SCHEDULE_ID,
    fetchInstructorSessions,
    SessionRow,
    updateHeadcount,
} from '@/lib/attendance';
import { supabase } from '@/lib/supabase';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

const periodOptions: AttendancePeriod[] = ['month', 'week', 'day'];
const DEFAULT_BRANCH_LABEL = 'Of the Greater Rochester Area';
type BranchOption = { id: string; name: string; isPrimary: boolean };

const weekdayRank = dayNames.reduce(
  (acc, day, index) => {
    acc[day] = index;
    return acc;
  },
  {} as Record<string, number>
);
const FALLBACK_DAY_RANK = dayNames.length + 1;
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
  const params = useLocalSearchParams<{ branchId?: string; period?: AttendancePeriod }>();
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
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(params.branchId ?? null);
  const [selectedBranchName, setSelectedBranchName] = useState<string>(DEFAULT_BRANCH_LABEL);
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string; buttons?: DialogButton[] }>({
    visible: false,
    title: '',
    message: '',
    buttons: undefined,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    RNStatusBar.setHidden(true, 'slide');
  }, []);

  const showDialog = (title: string, message: string, buttons?: DialogButton[]) => {
    setDialog({ visible: true, title, message, buttons });
  };
  const closeDialog = () => setDialog({ visible: false, title: '', message: '', buttons: undefined });

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
            router.replace('/welcome');
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

  const loadSessions = useCallback(
    async (explicitInstructorId?: string | null, explicitBranchId?: string | null) => {
      const targetInstructor = explicitInstructorId ?? instructorId;
      if (!targetInstructor) {
        setLoading(false);
        return;
      }
      const branchFilter = explicitBranchId ?? selectedBranchId;
      setLoading(true);
      const { data, error } = await fetchInstructorSessions({
        period,
        instructorId: targetInstructor,
        dayOfWeek: period === 'day' ? selectedDay : undefined,
        effectiveMonth: DEFAULT_EFFECTIVE_MONTH,
        scheduleId: DEFAULT_SCHEDULE_ID,
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
        const rankA = csA?.day_of_week ? weekdayRank[csA.day_of_week] ?? FALLBACK_DAY_RANK : FALLBACK_DAY_RANK;
        const rankB = csB?.day_of_week ? weekdayRank[csB.day_of_week] ?? FALLBACK_DAY_RANK : FALLBACK_DAY_RANK;
        if (rankA !== rankB) return rankA - rankB;
        const timeA = timeToSeconds(csA?.start_time);
        const timeB = timeToSeconds(csB?.start_time);
        if (timeA !== timeB) return timeA - timeB;
        return 0;
      });
      setSessions(deduped);
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
      setHeadcounts(nextCounts);
      setLoading(false);
    },
    [instructorId, period, selectedBranchId, selectedDay]
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
        .select('branch_id, is_primary, branches(name)')
        .eq('instructor_id', instructor.id);

      let branchList: BranchOption[] = [];
      let branchIdToUse: string | null = params.branchId ?? instructor.branch_id ?? null;

      if (branchesErr) {
        console.warn('Failed to load instructor branches', branchesErr);
      } else if (branchesData) {
        branchList =
          branchesData
            ?.filter((item) => Boolean(item.branch_id))
            .map((item) => ({
              id: item.branch_id,
              name: item.branches?.name ?? 'Branch',
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
  }, [params.nickname, params.branchId]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const saveHeadcount = async (sessionId: string, headcountValue: string, submittedAt?: string | null) => {
    const headcount = Number(headcountValue || 0);
    setSavingId(sessionId);
    const { error } = await updateHeadcount(sessionId, headcount, submittedAt);
    if (error) {
      showDialog('Save failed', error.message ?? 'Unable to update headcount');
    } else {
      await loadSessions();
    }
    setSavingId(null);
  };

  const renderItem = ({ item }: { item: SessionRow }) => {
    const cs = item.class_sessions;
    if (!cs) return null;
    const countValue = headcounts[cs.id] ?? '';
    return (
      <View style={[styles.card, dialog.visible && styles.cardDimmed]}>
        <Text style={styles.className}>{cs.classes?.name ?? 'Class'}</Text>
        <Text style={styles.meta}>
          {cs.day_of_week} • {cs.start_time} - {cs.end_time} • {cs.locations?.name ?? 'Location'}
        </Text>
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
        <Text style={styles.helperSmall}>Effective month: {cs.effective_month ?? '2025-09-01'}</Text>
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={savingId === cs.id}
            style={[styles.saveButton, savingId === cs.id ? styles.saveButtonDisabled : null]}
            onPress={() => saveHeadcount(cs.id, countValue, cs.headcount_submitted_at)}>
            <Text style={styles.saveButtonText}>{savingId === cs.id ? 'Saving...' : 'Save headcount'}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#01A490', '#052e16']} style={styles.gradient}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="large" color="#facc15" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
          <Text style={styles.subtitleCentered}>September 2025 · Schedule</Text>
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
        {period === 'day' ? (
          <View style={styles.pickerContainer}>
            <Picker selectedValue={selectedDay} onValueChange={(val) => setSelectedDay(val)} style={styles.picker}>
              {dayNames.map((d) => (
                <Picker.Item key={d} label={d} value={d} />
              ))}
            </Picker>
          </View>
        ) : null}
        {period === 'week' ? (
          <Text style={styles.helperSmall}>Week view shows all days grouped for the month.</Text>
        ) : null}
      </LinearGradient>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.session_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No sessions found.</Text>}
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
  header: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16, gap: 10, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderWidth: 1, borderColor: 'rgba(248,250,252,0.16)' },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
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
  subtitleCentered: { color: '#f8fafc', textAlign: 'center', fontWeight: '700', marginTop: 4, fontSize: 18, width: '100%' },
  titleRow: { alignItems: 'center', marginTop: 8, width: '100%' },
  notice: { color: '#b91c1c', marginTop: 4 },
  periodRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, marginTop: 8 },
  periodButtons: { flexDirection: 'row', gap: 8, flexShrink: 1, flexWrap: 'wrap', flex: 1 },
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
  list: { padding: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.22)',
    borderRadius: 18,
    padding: 18,
    backgroundColor: '#ffffff',
    gap: 8,
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
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 4 },
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

