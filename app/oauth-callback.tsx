import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

const pendingClaimContextKey = 'pending-claim-context';
const lastClaimKey = 'last-attendance-claim';

export default function OAuthCallbackScreen() {
  useImmersiveNavBar();
  const url = Linking.useURL();
  const [message, setMessage] = useState('Finishing sign-in…');
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const looksLikeVerifyLink = (text?: string | null) =>
    Boolean(
      text &&
        (text.includes('auth/v1/verify') || text.includes('auth%2Fv1%2Fverify')) &&
        (text.includes('token=') || text.includes('token%3D'))
    );

  const decodeSafeLinkIfNeeded = (text: string) => {
    if (text.includes('safelinks.protection') && text.includes('url=')) {
      const match = text.match(/url=([^&]+)/i);
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1]);
        } catch (err) {
          console.warn('Failed to decode safelink', err);
        }
      }
    }
    return text;
  };

  const normalizeRedirectTo = (text: string) => {
    // Replace any redirect_to param with the intended deep link
    const redirectParam = 'redirect_to=';
    if (!text.includes(redirectParam)) return text;
    return text.replace(/redirect_to=[^&]+/i, 'redirect_to=exp+ymcaattendance://oauth-callback');
  };

  const loadFromClipboard = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (!clip) {
        setError('Clipboard is empty.');
        return;
      }
      const decoded = decodeSafeLinkIfNeeded(clip);
      if (!looksLikeVerifyLink(decoded)) {
        setError('Clipboard does not look like a confirmation link.');
        return;
      }
      const normalized = normalizeRedirectTo(decoded.trim());
      setManualUrl(normalized);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to read clipboard.');
    }
  };

  useEffect(() => {
    const prefillFromClipboard = async () => {
      try {
        if (manualUrl) return;
        const clip = await Clipboard.getStringAsync();
        if (!clip) return;
        const decoded = decodeSafeLinkIfNeeded(clip);
        if (looksLikeVerifyLink(decoded)) {
          setManualUrl(decoded.trim());
        }
      } catch (err) {
        console.warn('Clipboard read failed', err);
      }
    };
    prefillFromClipboard();
  }, [manualUrl]);

  useEffect(() => {
    let cancelled = false;
    const handleCallback = async () => {
      try {
        const deepLink = url ?? (await Linking.getInitialURL());
        if (!deepLink) throw new Error('Missing callback URL.');

        setMessage('Exchanging code for a session…');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(deepLink);
        if (exchangeError) throw exchangeError;

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) throw new Error('No session found after confirmation.');

        setMessage('Linking your instructor record…');
        let pending: any = null;
        try {
          const pendingRaw = await AsyncStorage.getItem(pendingClaimContextKey);
          pending = pendingRaw ? JSON.parse(pendingRaw) : null;
        } catch (err) {
          console.warn('Failed to read pending claim context', err);
        }

        if (pending?.branchId && pending?.nickname) {
          const { error: claimError } = await supabase.rpc('claim_instructor', {
            p_branch_id: pending.branchId,
            p_nickname: pending.nickname,
            p_first_name: pending.firstName ?? null,
            p_last_name: pending.lastName ?? null,
          });
          if (claimError) {
            console.error('claim_instructor failed', claimError);
            throw claimError;
          }
          await supabase.rpc('update_last_login');
          await AsyncStorage.setItem(
            lastClaimKey,
            JSON.stringify({ branchId: pending.branchId, nickname: pending.nickname })
          );
        } else {
          // no pending context to claim; continue to attendance
        }

        const keysToClear = [pendingClaimContextKey];
        if (pending?.pendingKey) keysToClear.push(pending.pendingKey);
        await AsyncStorage.multiRemove(keysToClear);

        setMessage('Sign-in complete. Redirecting…');
        router.replace('/attendance');
      } catch (err: any) {
        if (cancelled) return;
        console.warn('OAuth callback handling failed', err);
        setError(err?.message ?? 'Something went wrong finishing sign-in. Please try again.');
      }
    };

    handleCallback();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    // Do not auto-redirect on error; keep the screen available for manual paste.
    return () => {};
  }, [error]);

  const handleManualExchange = async () => {
    if (!manualUrl.trim()) {
      setError('Paste your confirmation link first.');
      return;
    }
    setManualBusy(true);
    setError(null);
    try {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(manualUrl.trim());
      if (exchangeError) throw exchangeError;

      // Read pending claim context and link instructor (same as automatic flow)
      let pending: any = null;
      try {
        const pendingRaw = await AsyncStorage.getItem(pendingClaimContextKey);
        pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      } catch (err) {
        console.warn('Failed to read pending claim context', err);
      }

      if (pending?.branchId && pending?.nickname) {
        const { error: claimError } = await supabase.rpc('claim_instructor', {
          p_branch_id: pending.branchId,
          p_nickname: pending.nickname,
          p_first_name: pending.firstName ?? null,
          p_last_name: pending.lastName ?? null,
        });
        if (claimError) {
          console.error('claim_instructor failed', claimError);
          throw claimError;
        }
        await supabase.rpc('update_last_login');
        await AsyncStorage.setItem(
          lastClaimKey,
          JSON.stringify({ branchId: pending.branchId, nickname: pending.nickname })
        );
      } else {
        // no pending context to claim; continue to attendance
      }

      const keysToClear = [pendingClaimContextKey];
      if (pending?.pendingKey) keysToClear.push(pending.pendingKey);
      await AsyncStorage.multiRemove(keysToClear);

      setMessage('Sign-in complete. Redirecting…');
      router.replace('/attendance');
    } catch (err: any) {
      setError(err?.message ?? 'Could not finish sign-in with the pasted link.');
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#01A490" />
      <Text style={styles.title}>{error ? 'Sign-in issue' : 'Completing sign-in'}</Text>
      <Text style={styles.message}>{error ?? message}</Text>
      {error ? <Text style={styles.helper}>You can return to the app and try again, or paste the link below.</Text> : null}
      <View style={styles.manualBox}>
        <Text style={styles.manualLabel}>If stuck, paste confirmation URL:</Text>
        <TextInput
          style={styles.input}
          placeholder="https://...verify?...redirect_to=exp+ymcaattendance://oauth-callback"
          placeholderTextColor="rgba(226,232,240,0.7)"
          value={manualUrl}
          onChangeText={setManualUrl}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          autoFocus
        />
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={loadFromClipboard}>
          <Text style={styles.buttonText}>Load from clipboard</Text>
        </Pressable>
        <Pressable
          style={[styles.button, manualBusy ? styles.buttonDisabled : null]}
          onPress={manualBusy ? undefined : handleManualExchange}>
          <Text style={styles.buttonText}>{manualBusy ? 'Finishing…' : 'Finish with pasted link'}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.replace('/auth/login')}>
          <Text style={styles.buttonText}>Back to Login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0f172a', gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#f8fafc' },
  message: { color: '#e2e8f0', textAlign: 'center' },
  helper: { color: '#cbd5e1', textAlign: 'center', fontSize: 14 },
  manualBox: { width: '100%', marginTop: 12, gap: 6 },
  manualLabel: { color: '#e2e8f0', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.3)',
    borderRadius: 8,
    padding: 10,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  button: {
    marginTop: 6,
    backgroundColor: '#01A490',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.35)',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#f8fafc', fontWeight: '700' },
});