import ThemedDialog, { DialogButton } from '@/components/themed-dialog';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SessionRow = {
  session_id: string;
  class_sessions: {
    id: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
    headcount: number | null;
    headcount_submitted_at: string | null;
    classes: { name: string | null } | null;
    locations: { name: string | null } | null;
  } | null;
};

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TodayScreen() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [headcounts, setHeadcounts] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string; buttons?: DialogButton[] }>({
    visible: false,
    title: '',
    message: '',
    buttons: undefined,
  });

  const showDialog = (title: string, message: string, buttons?: DialogButton[]) => {
    setDialog({ visible: true, title, message, buttons });
  };
  const closeDialog = () => setDialog({ visible: false, title: '', message: '', buttons: undefined });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    const today = dayNames[new Date().getDay()];
    const { data, error } = await supabase
      .from('session_instructors')
      .select(
        'session_id, class_sessions(id, day_of_week, start_time, end_time, headcount, headcount_submitted_at, classes(name), locations(name))'
      )
      .eq('class_sessions.day_of_week', today)
      .order('session_id');

    if (error) {
      showDialog('Error', error.message ?? 'Unable to load sessions');
      setLoading(false);
      return;
    }
    setSessions(data ?? []);
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
  };

  const updateHeadcount = async (sessionId: string, headcount: number, submittedAt?: string | null) => {
    setSavingId(sessionId);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('class_sessions')
        .update({
          headcount,
          headcount_updated_at: nowIso,
          headcount_submitted_at: submittedAt ?? nowIso,
        })
        .eq('id', sessionId);
      if (error) throw error;
      await loadSessions();
    } catch (err: any) {
      showDialog('Save failed', err.message ?? 'Unable to update headcount');
    } finally {
      setSavingId(null);
    }
  };

  const renderItem = ({ item }: { item: SessionRow }) => {
    const cs = item.class_sessions;
    if (!cs) return null;
    const countValue = headcounts[cs.id] ?? '';

    return (
      <View style={styles.card}>
        <Text style={styles.className}>{cs.classes?.name ?? 'Class'}</Text>
        <Text style={styles.meta}>
          {cs.day_of_week} • {cs.start_time} - {cs.end_time} • {cs.locations?.name ?? 'Location'}
        </Text>
        <TextInput
          style={styles.input}
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
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          style={[styles.saveButton, savingId === cs.id ? styles.saveButtonDisabled : null]}
          disabled={savingId === cs.id}
          onPress={() => {
            const hc = Number(countValue || 0);
            updateHeadcount(cs.id, hc, cs.headcount_submitted_at);
          }}>
          <Text style={styles.saveButtonText}>{savingId === cs.id ? 'Saving...' : 'Save headcount'}</Text>
        </Pressable>
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
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.session_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No sessions today</Text>}
        refreshing={loading}
        onRefresh={loadSessions}
      />
    </SafeAreaView>
    </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  empty: { textAlign: 'center', marginTop: 40, color: '#e2e8f0' },
  saveButton: {
    backgroundColor: '#01A490',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});

