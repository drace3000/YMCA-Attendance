import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ThemedDialog from '@/components/themed-dialog';
import { supabase } from '@/lib/supabase';

const lastClaimKey = 'last-attendance-claim';

export default function WelcomeScreen() {
  const [checking, setChecking] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);

  const moreContent = (
    <View style={styles.moreContent}>
      <View style={styles.moreItem}>
        <Text style={styles.moreIcon}>•</Text>
        <Text style={styles.moreText}>Instructors were originally added to class schedules using a nickname.</Text>
      </View>
      <View style={styles.moreItem}>
        <Text style={styles.moreIcon}>•</Text>
        <Text style={styles.moreText}>On your first login use Onboarding:</Text>
      </View>
      <View style={styles.moreSubItem}>
        <Text style={styles.moreIcon}>›</Text>
        <Text style={styles.moreSubText}>Enter the nickname exactly as it appears on the manual schedule</Text>
      </View>
      <View style={styles.moreSubItem}>
        <Text style={styles.moreIcon}>›</Text>
        <Text style={styles.moreSubText}>Select your branch/location</Text>
      </View>
      <View style={styles.moreSubItem}>
        <Text style={styles.moreIcon}>›</Text>
        <Text style={styles.moreSubText}>Create your account with email and password</Text>
      </View>
      <View style={styles.moreItem}>
        <Text style={styles.moreIcon}>•</Text>
        <Text style={styles.moreText}>Once completed, the app links the nickname to your account. Classes are ready for headcount entry.</Text>
      </View>
      <View style={styles.moreItem}>
        <Text style={styles.moreIcon}>•</Text>
        <Text style={styles.moreText}>After the first login:</Text>
      </View>
      <View style={styles.moreSubItem}>
        <Text style={styles.moreIcon}>›</Text>
        <Text style={styles.moreSubText}>App opens directly to the Attendance screen every time</Text>
      </View>
      <View style={styles.moreSubItem}>
        <Text style={styles.moreIcon}>›</Text>
        <Text style={styles.moreSubText}>View classes by Day, Week, or Month</Text>
      </View>
      <View style={styles.moreSubItem}>
        <Text style={styles.moreIcon}>›</Text>
        <Text style={styles.moreSubText}>Locate your class, enter the headcount — done</Text>
      </View>
      <View style={styles.moreItem}>
        <Text style={styles.moreIcon}>•</Text>
        <Text style={styles.moreText}>No extra steps. Everything connects automatically after the first login.</Text>
      </View>
    </View>
  );

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
          <Image source={require('../assets/images/ymca-logo.v2.png')} style={styles.logo} />
          <Text style={styles.title}>YMCA Attendance</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Greater Rochester Area</Text>
          </View>

          <LinearGradient colors={['#01A490', '#0f172a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <Text style={styles.cardTitle}>Body, Mind &amp; Spirit</Text>
            <View style={styles.cardUnderline} />

            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>📋</Text>
              <View style={styles.featureTextBlock}>
                <Text style={styles.featureTitle}>Empower Instructors</Text>
                <Text style={styles.featureSubtitle}>Manage your classes efficiently</Text>
              </View>
            </View>

            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>📊</Text>
              <View style={styles.featureTextBlock}>
                <Text style={styles.featureTitle}>Capture Headcounts</Text>
                <Text style={styles.featureSubtitle}>Track community engagement</Text>
              </View>
            </View>

            <View style={styles.featureRow}>
              <Text style={styles.featureIcon}>💚</Text>
              <View style={styles.featureTextBlock}>
                <Text style={styles.featureTitle}>Grow Together</Text>
                <Text style={styles.featureSubtitle}>Stay connected to the mission</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.helperRow}>
            <Text style={styles.helper}>
              Fast student attendance for instructors. First-time users onboard in seconds, then go straight to class Attendance.
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setMoreVisible(true)}
              style={styles.moreButton}>
              <Text style={styles.moreButtonText}>More</Text>
            </Pressable>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              disabled={checking}
              style={[styles.startButton, checking ? styles.startButtonDisabled : null]}
              onPress={handleStart}>
              <Text style={styles.startButtonText}>
                {checking ? 'Checking Access...' : 'Start Session  →'}
              </Text>
            </Pressable>
          </View>

          {checking ? <ActivityIndicator color="#fff" style={styles.spinner} /> : null}
          <Text style={styles.footer}>© {new Date().getFullYear()} YMCA of Greater Rochester</Text>
        </View>
      </SafeAreaView>
      <ThemedDialog
        visible={moreVisible}
        title="About the YMCA Attendance Tracker"
        message={moreContent}
        onClose={() => setMoreVisible(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 14,
  },
  logo: { width: 88, height: 88, resizeMode: 'contain' },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', marginTop: 4, textAlign: 'center' },
  badge: {
    marginTop: 4,
    backgroundColor: 'rgba(15,23,42,0.4)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: { color: '#cbd5e1', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  card: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginTop: 10,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.35)',
  },
  cardTitle: { textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#facc15' },
  cardUnderline: {
    alignSelf: 'center',
    width: 64,
    height: 3,
    backgroundColor: '#facc15',
    borderRadius: 999,
  },
  featureRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  featureIcon: { fontSize: 20, width: 26, textAlign: 'center', marginLeft: 35 },
  featureTextBlock: { flex: 1, marginLeft: 20 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  featureSubtitle: { fontSize: 13, color: '#e2e8f0' },
  helperRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
  },
  helper: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'left',
    flexShrink: 1,
  },
  moreButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.65)',
    backgroundColor: 'rgba(15,23,42,0.2)',
  },
  moreButtonText: { color: '#f8fafc', fontWeight: '700' },
  moreContent: { gap: 8 },
  moreItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  moreSubItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginLeft: 12 },
  moreIcon: { fontSize: 16, fontWeight: '700', color: '#facc15', lineHeight: 20 },
  moreText: { fontSize: 16, fontWeight: '700', color: '#e2e8f0', lineHeight: 22, flex: 1 },
  moreSubText: { fontSize: 16, fontWeight: '500', color: '#e2e8f0', lineHeight: 22, flex: 1 },
  buttonRow: { marginTop: 6, width: '100%' },
  startButton: {
    backgroundColor: '#facc15',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: { color: '#1f2937', fontWeight: '800', fontSize: 17 },
  startButtonDisabled: { opacity: 0.7 },
  spinner: { marginTop: 12 },
  footer: { marginTop: 18, color: '#cbd5e1', fontSize: 12, textAlign: 'center' },
});

