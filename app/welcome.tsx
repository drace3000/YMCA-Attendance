import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ThemedDialog from '@/components/themed-dialog';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';
import { supabase } from '@/lib/supabase';

const lastClaimKey = 'last-attendance-claim';

export default function WelcomeScreen() {
  useImmersiveNavBar();
  const [checking, setChecking] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreBody, setMoreBody] = useState<string | null>(null);
  const [moreHeader, setMoreHeader] = useState<string | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [notificationBody, setNotificationBody] = useState<string | null>(null);
  const [notificationHeader, setNotificationHeader] = useState<string | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [footerHidden, setFooterHidden] = useState(false);
  const [footerHiddenIntro, setFooterHiddenIntro] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const footerPulse = useRef(new Animated.Value(0)).current;
  const footerShouldHide =
    footerHidden ||
    footerHiddenIntro ||
    moreVisible ||
    notificationVisible ||
    moreLoading ||
    notificationLoading;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [glowAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(footerPulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(footerPulse, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [footerPulse]);

  const renderMoreMessage = () => {
    if (moreLoading) {
      return (
        <View style={styles.dialogMessageWrapper}>
          <ActivityIndicator color="#fff" style={styles.moreDialogSpinner} />
        </View>
      );
    }

    const lines =
      moreBody
        ?.split('\n')
        .map((line) => line.trim())
        .filter(Boolean) ?? [];

    if (!lines.length) {
      return <Text style={styles.moreDialogText}>No information available.</Text>;
    }

    return (
      <View style={styles.moreContent}>
        {lines.map((line, idx) => {
          const isSub = line.startsWith('›');
          const isBullet = line.startsWith('•');
          const text = (isSub || isBullet ? line.slice(1) : line).trim();
          const rowStyle = isSub ? styles.moreSubItem : styles.moreItem;
          const textStyle = isSub ? styles.moreSubText : styles.moreText;
          return (
            <View style={rowStyle} key={`line-${idx}`}>
              <Text style={styles.moreIcon}>{isSub ? '\u203A' : '\u2022'}</Text>
              <Text style={textStyle}>{text}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const handleFooterPress = async () => {
    setFooterHidden(true);
    setNotificationLoading(true);
    let willShowNotification = false;
    try {
      const { data, error } = await supabase
        .from('Notifications')
        .select('notification, header')
        .eq('title', 'AWD')
        .maybeSingle();

      if (error) {
        throw error;
      }

      setNotificationHeader(data?.header ?? null);
      setNotificationBody(data?.notification ?? 'No message available.');
      setNotificationVisible(true);
      willShowNotification = true;
    } catch (err) {
      console.warn('Failed to load AWD notification text', err);
    } finally {
      if (!willShowNotification) {
        setFooterHidden(false);
      }
      setNotificationLoading(false);
    }
  };

  const handleNotificationClose = () => {
    setNotificationVisible(false);
    setFooterHidden(false);
    setNotificationBody(null);
    setNotificationHeader(null);
  };

  const handleMoreOpen = async () => {
    setFooterHiddenIntro(true);
    setMoreLoading(true);
    let willShowDialog = false;
    try {
      const { data, error } = await supabase
        .from('Notifications')
        .select('notification, header')
        .eq('title', 'Intro')
        .maybeSingle();

      if (error) {
        throw error;
      }

      setMoreHeader(data?.header ?? null);
      setMoreHeader(data?.header ?? null);
      setMoreBody(data?.notification ?? 'No information available.');
      setMoreVisible(true);
      willShowDialog = true;
    } catch (err) {
      console.warn('Failed to load intro notification text', err);
      setMoreBody('No information available.');
      setMoreVisible(true);
      willShowDialog = true;
    } finally {
      if (!willShowDialog) {
        setFooterHiddenIntro(false);
      }
      setMoreLoading(false);
    }
  };

  const handleMoreClose = () => {
    setMoreVisible(false);
    setMoreBody(null);
    setMoreHeader(null);
    setMoreLoading(false);
    setFooterHiddenIntro(false);
  };

  const handleStart = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('Failed to get session; signing out', error);
        await supabase.auth.signOut();
        router.push('/auth/login');
        return;
      }
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
            <Animated.View
              style={[
                styles.moreButtonGlow,
                {
                  borderColor: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(250,204,21,0.45)', 'rgba(250,204,21,1)'],
                  }),
                  shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }),
                  shadowRadius: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 16] }),
                  backgroundColor: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['rgba(250,204,21,0.18)', 'rgba(250,204,21,0.32)'],
                  }),
                },
              ]}>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={handleMoreOpen}
                style={styles.moreButton}>
                <Text style={styles.moreButtonText}>Help</Text>
              </Pressable>
            </Animated.View>
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
          {moreLoading && !moreVisible ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
          <Text style={styles.footer}>© {new Date().getFullYear()} YMCA of Greater Rochester</Text>
          <View style={styles.footerLogoContainer}>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={handleFooterPress}
              disabled={notificationLoading}
              style={styles.footerLogoPressable}>
              <Animated.Image
                source={require('../assets/images/awd.just.logo.small.png')}
                style={[
                  styles.footerLogo,
                  footerShouldHide
                    ? { opacity: 0 }
                    : {
                        transform: [
                          {
                            scale: footerPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 0.93],
                            }),
                          },
                          {
                            translateY: footerPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 3],
                            }),
                          },
                        ],
                        opacity: footerPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.92],
                        }),
                      },
                ]}
              />
            </Pressable>
            {notificationLoading ? <ActivityIndicator color="#fff" style={styles.footerSpinner} /> : null}
          </View>
        </View>
      </SafeAreaView>
      <ThemedDialog
        visible={moreVisible}
        title={moreHeader ?? 'About the YMCA Attendance Tracker'}
        message={<View style={styles.dialogMessageWrapper}>{renderMoreMessage()}</View>}
        customButtons={
          <View style={styles.dialogLogoButtonRow}>
            <View style={styles.dialogInlineLogoWrap}>
              <Image source={require('../assets/images/awd.just.logo.small.png')} style={styles.dialogInlineLogo} />
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.dialogInlineButton}
              onPress={handleMoreClose}>
              <Text style={styles.dialogInlineButtonText}>OK</Text>
            </Pressable>
          </View>
        }
        onClose={handleMoreClose}
      />
      <ThemedDialog
        visible={notificationVisible}
        title={notificationHeader ?? 'Affordable Web Designers (AWD)'}
        message={
          <View style={styles.dialogMessageWrapper}>
            <Text style={styles.dialogMessageText}>{notificationBody ?? 'No message available.'}</Text>
            <Image source={require('../assets/images/awd.just.logo.small.png')} style={styles.dialogBottomLogo} />
          </View>
        }
        onClose={handleNotificationClose}
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
  loadingOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
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
  moreButtonGlow: {
    borderRadius: 999,
    padding: 2,
    borderWidth: 1,
    shadowColor: '#facc15',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  moreContent: { gap: 8 },
  moreItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  moreSubItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginLeft: 12 },
  moreIcon: { fontSize: 16, fontWeight: '700', color: '#facc15', lineHeight: 20 },
  moreText: { fontSize: 16, fontWeight: '700', color: '#e2e8f0', lineHeight: 22, flex: 1 },
  moreSubText: { fontSize: 16, fontWeight: '400', color: '#e2e8f0', lineHeight: 22, flex: 1 },
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
  footerLogoContainer: { marginTop: 12, width: '100%', alignItems: 'center' },
  footerLogoPressable: { padding: 4 },
  footerSpinner: { marginTop: 6 },
  footerLogo: { width: 120, height: 40, resizeMode: 'contain' },
  footerLogoHidden: { opacity: 0 },
  dialogMessageWrapper: { gap: 12, alignItems: 'stretch' },
  dialogMessageText: { color: '#e2e8f0', fontSize: 15, lineHeight: 21, textAlign: 'left', width: '100%' },
  dialogBottomLogo: { width: 120, height: 40, resizeMode: 'contain', alignSelf: 'center', marginTop: 12 },
  moreDialogText: { color: '#e2e8f0', fontSize: 15, lineHeight: 21, textAlign: 'left', width: '100%' },
  moreDialogSpinner: { marginVertical: 8 },
  dialogLogoButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: -6,
  },
  dialogInlineLogoWrap: { flex: 1, alignItems: 'center' },
  dialogInlineLogo: { width: 80, height: 28, resizeMode: 'contain' },
  dialogInlineButton: {
    backgroundColor: '#facc15',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dialogInlineButtonText: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
});

