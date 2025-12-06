import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Button,
  Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';

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
      Alert.alert('Error', error.message);
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
      Alert.alert('Save failed', err.message ?? 'Unable to update headcount');
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
        <Button
          title={savingId === cs.id ? 'Saving...' : 'Save headcount'}
          disabled={savingId === cs.id}
          onPress={() => {
            const hc = Number(countValue || 0);
            updateHeadcount(cs.id, hc, cs.headcount_submitted_at);
          }}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    gap: 6,
  },
  className: { fontSize: 18, fontWeight: '600' },
  meta: { color: '#555' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
  },
  empty: { textAlign: 'center', marginTop: 40, color: '#666' },
});

