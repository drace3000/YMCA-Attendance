import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ThemedDialog from '@/components/themed-dialog';
import { supabase } from '@/lib/supabase';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

const OTP_LENGTH = 8;

export default function ResetPasswordScreen() {
  useImmersiveNavBar();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'form' | 'code'>('form');
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });
  const isFormMode = mode === 'form';
  const isCodeMode = mode === 'code';

  const showDialog = (title: string, message: string) => setDialog({ visible: true, title, message });
  const closeDialog = () => {
    if (dialog.title === 'Success') {
      router.replace(`/auth/login?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } else {
      setDialog({ visible: false, title: '', message: '' });
    }
  };

  const focusCodeInput = () => {
    codeInputRef.current?.focus();
  };

  const handleCodeChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(sanitized);
  };

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
      setStatus('An 8-digit code was sent to your email.');
      setMode('code');
      setCodeVerified(false);
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

  useEffect(() => {
    const verifyCode = async () => {
      const trimmedCode = code.trim();
      if (trimmedCode.length !== OTP_LENGTH || verifyingCode || codeVerified) return;

      setVerifyingCode(true);
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: trimmedCode,
          type: 'email',
        });
        if (error) {
          setCodeVerified(false);
          setStatus('Invalid code. Please check and try again.');
        } else {
          setCodeVerified(true);
          setStatus('Code verified. Enter your new password.');
        }
      } catch (err: any) {
        setCodeVerified(false);
        setStatus(err?.message ?? 'Code verification failed.');
      } finally {
        setVerifyingCode(false);
      }
    };

    if (mode === 'code' && code.trim().length === OTP_LENGTH) {
      verifyCode();
    } else {
      setCodeVerified(false);
    }
  }, [code, mode, email]);

  useEffect(() => {
    if (mode === 'form') {
      setCodeVerified(false);
      setCode('');
      setNewPassword('');
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'code') {
      requestAnimationFrame(() => codeInputRef.current?.focus());
    }
  }, [mode]);

  useEffect(() => {
    if (codeVerified && mode === 'code') {
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 100);
    }
  }, [codeVerified, mode]);

  const verifyAndReset = async () => {
    if (!email.trim() || !email.includes('@')) {
      showDialog('Email required', 'Enter your email address.');
      return;
    }
    if (!code.trim()) {
      setStatus(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    if (code.trim().length !== OTP_LENGTH) {
      setStatus(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    if (!codeVerified) {
      setStatus('Please wait for code verification.');
      return;
    }
    if (!newPassword.trim()) {
      setStatus('Enter a new password.');
      return;
    }
    setLoading(true);
    setStatus('Updating password…');
    try {
      await supabase.auth.updateUser({ password: newPassword.trim() });
      await supabase.auth.signOut();
      showDialog('Success', 'Password updated. Sign in with your new password.');
      setStatus('Password updated.');
      setMode('form');
      setCode('');
      setNewPassword('');
      setCodeVerified(false);
    } catch (err: any) {
      setStatus(err?.message ?? 'Reset failed. Please try again.');
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
            <Text style={styles.helper}>
              Enter your email to get an 8-digit code. Then enter the code and a new password.
            </Text>

            {status ? (
              <Text
                style={[
                  styles.statusText,
                  status === 'An 8-digit code was sent to your email.' && styles.statusTextBold,
                ]}>
                {status}
              </Text>
            ) : null}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, isCodeMode && styles.inputDisabled]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              editable={isFormMode}
            />

            {isCodeMode && (
              <>
                <Text style={styles.label}>8-digit code</Text>
                <View style={styles.otpInputWrap}>
                  <Pressable onPressIn={focusCodeInput} style={styles.otpPressable}>
                    <View style={styles.otpRow}>
                      {Array.from({ length: OTP_LENGTH }).map((_, idx) => {
                        const isFilled = code.length > idx;
                        const isActive = idx === Math.min(code.length, OTP_LENGTH - 1);
                        return (
                          <View
                            key={idx}
                            style={[
                              styles.otpCell,
                              isFilled ? styles.otpCellFilled : null,
                              isActive ? styles.otpCellActive : null,
                            ]}>
                            <Text style={styles.otpDigit}>{code[idx] ?? ''}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Pressable>
                  <TextInput
                    ref={codeInputRef}
                    style={styles.otpHiddenInput}
                    pointerEvents="none"
                    keyboardType="number-pad"
                    value={code}
                    onChangeText={handleCodeChange}
                    maxLength={OTP_LENGTH}
                    autoFocus
                    caretHidden
                    selectionColor="transparent"
                    textContentType="oneTimeCode"
                    importantForAutofill="yes"
                  />
                </View>
                <Text style={styles.label}>New password</Text>
                <View style={[styles.passwordContainer, !codeVerified && styles.passwordContainerDisabled]}>
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.passwordInput, !codeVerified && styles.passwordInputDisabled]}
                    secureTextEntry={!showPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="New password"
                    editable={codeVerified}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={8}>
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="#475569"
                    />
                  </Pressable>
                </View>
              </>
            )}

            <View style={styles.buttons}>
              {isFormMode ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  style={[styles.button, sending ? styles.buttonDisabled : null]}
                  onPress={sending ? undefined : sendCode}>
                  <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send code'}</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  style={[styles.button, loading ? styles.buttonDisabled : null]}
                  onPress={loading ? undefined : verifyAndReset}>
                  <Text style={styles.buttonText}>{loading ? 'Updating…' : 'Set new password'}</Text>
                </Pressable>
              )}
            </View>
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
  statusText: { color: '#e2e8f0', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  statusTextBold: { fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  label: { color: '#f8fafc', fontWeight: '600', marginTop: 8 },
  otpPressable: {
    paddingVertical: 2,
  },
  otpInputWrap: {
    marginTop: 8,
    marginBottom: 4,
    position: 'relative',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpCell: {
    flex: 1,
    height: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(15,23,42,0.25)',
    backgroundColor: 'rgba(248,250,252,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellFilled: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  otpCellActive: {
    borderColor: '#0f172a',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  otpHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: '#e2e8f0',
    color: '#94a3b8',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  passwordContainerDisabled: {
    opacity: 0.6,
    backgroundColor: '#e2e8f0',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordInputDisabled: {
    color: '#94a3b8',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
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



