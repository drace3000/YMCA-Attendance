import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const lastClaimKey = 'last-attendance-claim';

export default function WelcomeScreen() {
  const [checking, setChecking] = useState(false);

  const handleStart = async () => {
    setChecking(true);
    try {
      const { data } = await supabase.auth.getSession();
      const hasSession = Boolean(data?.session?.user);
      if (hasSession) {
        try {
          const stored = await AsyncStorage.getItem(lastClaimKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.branchId && parsed?.nickname) {
              router.replace({
                pathname: '/attendance',
                params: { branchId: parsed.branchId, nickname: parsed.nickname },
              });
              return;
            }
          }
        } catch (err) {
          console.warn('Failed to load last attendance claim', err);
        }
        router.replace('/attendance');
      } else {
        router.push('/auth/login');
      }
    } catch (err) {
      console.warn('Start navigation failed', err);
      router.push('/auth/login');
    } finally {
      setChecking(false);
    }
  };

  return (
    <LinearGradient colors={['#01A490', '#0f172a']} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.brandHeader}>
            <Image source={require('../assets/images/ymca-logo.png')} style={styles.logo} />
            <View style={styles.brandTextBlock}>
              <Text style={styles.brand}>YMCA Attendance</Text>
              <Text style={styles.branchText}>Of the Greater Rochester Area</Text>
            </View>
          </View>
          <View style={styles.subtitleBlock}>
            <Text style={styles.subtitle}>Empower Instructors</Text>
            <Text style={styles.subtitle}>Capture Headcounts</Text>
            <Text style={styles.subtitle}>Stay Connected!</Text>
          </View>
          <Text style={styles.helper}>
            Sign in with your schedule nickname. Confirmed users jump straight to Attendance; new users can finish onboarding in minutes.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              disabled={checking}
              style={[styles.startButton, checking ? styles.startButtonDisabled : null]}
              onPress={handleStart}>
              <Text style={styles.startButtonText}>{checking ? 'Checking Access...' : 'Start'}</Text>
            </Pressable>
          </View>
          {checking ? <ActivityIndicator color="#fff" style={styles.spinner} /> : null}
          <Text style={styles.footer}>© {new Date().getFullYear()} YMCA of Greater Rochester</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
    justifyContent: 'flex-start',
    gap: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: { width: 72, height: 72 },
  brandTextBlock: { gap: 2 },
  brand: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: 1.1 },
  branchText: { color: '#cbd5e1', fontWeight: '600' },
  subtitleBlock: { alignItems: 'center', gap: 2 },
  subtitle: { fontSize: 18, fontWeight: '600', color: '#f0fdf4', textAlign: 'center' },
  helper: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  buttonRow: { marginTop: 16 },
  startButton: {
    backgroundColor: '#facc15',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  startButtonText: { color: '#1f2937', fontWeight: '700', fontSize: 16 },
  startButtonDisabled: { opacity: 0.7 },
  spinner: { marginTop: 16 },
  footer: { marginTop: 24, color: '#cbd5e1', fontSize: 12, textAlign: 'center' },
});

