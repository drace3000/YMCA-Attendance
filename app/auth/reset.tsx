import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ThemedDialog from '@/components/themed-dialog';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'form' | 'code'>('form');
  const [cooldown, setCooldown] = useState(0);
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  const showDialog = (title: string, message: string) => setDialog({ visible: true, title, message });
  const closeDialog = () => setDialog({ visible: false, title: '', message: '' });

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      showDialog('Email required', 'Enter your email address.');
      return;
    }
    setSending(true);
    setStatus('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setStatus('A 6-digit code was sent to your email.');
      setMode('code');
      setCooldown(240);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      showDialog('Send failed', err?.message ?? 'Unable to send reset code.');
    } finally {
      setSending(false);
    }
  };

  const resendCode = async () => {
    if (cooldown > 0 || sending) return;
    await sendCode();
  };

  const verifyAndReset = async () => {
    if (!email.trim() || !email.includes('@')) {
      showDialog('Email required', 'Enter your email address.');
      return;
    }
    if (!code.trim()) {
      setStatus('Enter the 6-digit code.');
      return;
    }
    if (!newPassword.trim()) {
      setStatus('Enter a new password.');
      return;
    }
    setLoading(true);
    setStatus('Verifying code and updating password…');
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'email',
      });
      if (verifyErr) throw verifyErr;

      await supabase.auth.updateUser({ password: newPassword.trim() });
      await supabase.auth.signOut();
      showDialog('Success', 'Password updated. Sign in with your new password.');
      setStatus('Password updated.');
      setMode('form');
      setCode('');
      setNewPassword('');
    } catch (err: any) {
      setStatus(err?.message ?? 'Reset failed. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ThemedDialog visible={dialog.visible} title={dialog.title} message={dialog.message} onClose={closeDialog} />
      <LinearGradient colors={['#01A490', '#0f172a']} style={styles.gradient}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAwareScrollView
            style={styles.flex}
            contentContainerStyle={styles.container}
            enableOnAndroid
            enableAutomaticScroll
            extraScrollHeight={100}
            extraHeight={100}
            keyboardOpeningTime={0}
            enableResetScrollToCoords={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.helper}>Enter your email to get a 6-digit code. Then enter the code and a new password.</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
            />

            {mode === 'code' && (
              <>
                <Text style={styles.label}>6-digit code</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  placeholder="123456"
                />
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                />
              </>
            )}

            <View style={styles.buttons}>
              {mode === 'form' ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  style={[styles.button, sending ? styles.buttonDisabled : null]}
                  onPress={sending ? undefined : sendCode}>
                  <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send code'}</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    style={[styles.button, loading ? styles.buttonDisabled : null]}
                    onPress={loading ? undefined : verifyAndReset}>
                    <Text style={styles.buttonText}>{loading ? 'Updating…' : 'Set new password'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    style={[styles.button, styles.secondaryButton, (sending || cooldown > 0) ? styles.buttonDisabled : null]}
                    onPress={sending || cooldown > 0 ? undefined : resendCode}>
                    <Text style={styles.buttonText}>
                      {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    style={[styles.button, styles.secondaryButton]}
                    onPress={() => {
                      setMode('form');
                      setCode('');
                      setNewPassword('');
                      setStatus('');
                    }}>
                    <Text style={styles.buttonText}>Back</Text>
                  </Pressable>
                </>
              )}
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                style={[styles.button, styles.secondaryButton]}
                onPress={() => router.replace('/auth/login')}>
                <Text style={styles.buttonText}>Back to login</Text>
              </Pressable>
            </View>

            {status ? <Text style={styles.helper}>{status}</Text> : null}
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#f8fafc' },
  helper: { color: '#e2e8f0', fontSize: 14 },
  label: { color: '#f8fafc', fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  buttons: { gap: 10, marginTop: 12 },
  button: {
    backgroundColor: '#facc15',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonText: { color: '#0f172a', fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.3)',
  },
  buttonDisabled: { opacity: 0.6 },
});



