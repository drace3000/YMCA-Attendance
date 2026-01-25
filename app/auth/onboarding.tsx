import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';

import ThemedDialog from '@/components/themed-dialog';
import { checkNicknameExists } from '@/lib/attendance';
import { supabase } from '@/lib/supabase';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

type Branch = {
  id: string;
  code: string | null;
  name: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  description?: string | null;
};

const ALLIANCE_NAME = 'Alliance of New York State YMCAs';
const ASSOCIATION_NAME = 'YMCA of Greater Rochester';
const ASSOCIATION_ID = '25e1812a-29b2-432a-8805-b7e4c6bc5d35';
const OTP_LENGTH = 8;

type ActionButtonProps = {
  title: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  selected?: boolean;
  style?: any;
};

const ActionButton = ({
  title,
  onPress,
  disabled = false,
  variant = 'primary',
  selected = false,
  style,
}: ActionButtonProps) => {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
        selected ? styles.buttonSelected : null,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
        style,
      ]}>
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' ? styles.buttonTextSecondary : null,
          disabled ? styles.buttonTextDisabled : null,
        ]}>
        {title}
      </Text>
    </Pressable>
  );
};

export default function OnboardingScreen() {
  useImmersiveNavBar();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showBranchList, setShowBranchList] = useState(false);
  const [showBranchDetails, setShowBranchDetails] = useState(false);
  const [nickname, setNickname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nicknameExists, setNicknameExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'form' | 'code' | 'password'>('form');
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [hideContent, setHideContent] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string; buttons?: DialogButton[] }>({
    visible: false,
    title: '',
    message: '',
    buttons: undefined,
  });
  const claimingRef = useRef(false);
  const codeInputRef = useRef<TextInput>(null);
  const nicknameInputRef = useRef<TextInput>(null);
  const firstNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  type DialogButton = { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' };
  const showDialog = (title: string, message: string, buttons?: DialogButton[]) => {
    setDialog({
      visible: true,
      title,
      message,
      buttons: buttons?.length ? buttons : undefined,
    });
  };

  const closeDialog = (button?: DialogButton) => {
    button?.onPress?.();
    setDialog({ visible: false, title: '', message: '', buttons: undefined });
  };
  const navigateToLogin = () => {
    setDetailsModalVisible(false);
    router.replace('/auth/login');
  };
  const pendingEmailKey = useMemo(() => {
    if (!branchId || !nickname.trim()) return null;
    return `pending-email:${branchId}:${nickname.trim().toUpperCase()}`;
  }, [branchId, nickname]);
  const pendingClaimContextKey = 'pending-claim-context';
  const lastClaimKey = 'last-attendance-claim';
  const congratsEndpoint = process.env.EXPO_PUBLIC_CONGRATS_ENDPOINT;

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
        resendTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session && !claimingRef.current) {
        await completeOnboarding(session.user.id);
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setNicknameExists(false);
  }, [nickname, branchId]);

  useEffect(() => {
    const loadPendingEmail = async () => {
      if (!pendingEmailKey) return;
      try {
        const pendingRaw = await AsyncStorage.getItem(pendingEmailKey);
        if (!pendingRaw) return;
        const pending = JSON.parse(pendingRaw);
        if (pending?.email && typeof pending.email === 'string') {
          setEmail(pending.email);
          setConfirmEmail(pending.email);
        }
      } catch (err) {
        console.warn('Pending email lookup failed', err);
      }
    };
    loadPendingEmail();
  }, [pendingEmailKey]);

  useEffect(() => {
    if (!hideContent && scrollViewRef.current) {
      // Reset scroll position when content is restored, but don't focus input (no keyboard)
      setTimeout(() => {
        scrollViewRef.current?.scrollToPosition(0, 0, true);
      }, 100);
    }
  }, [hideContent]);
  useEffect(() => {
    if (mode === 'code') {
      requestAnimationFrame(() => codeInputRef.current?.focus());
    }
  }, [mode]);
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        // If already authenticated, go straight to attendance (try stored claim if available)
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
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    const loadBranches = async () => {
      let associationId: string | null = null;
      try {
        const { data: alliance, error: allianceError } = await supabase
          .from('ymca_alliances')
          .select('id')
          .eq('name', ALLIANCE_NAME)
          .maybeSingle();
        if (allianceError) throw allianceError;
        if (!alliance?.id) {
          throw new Error('Alliance not found');
        }
        const { data: association, error: associationError } = await supabase
          .from('ymca_associations')
          .select('id')
          .eq('name', ASSOCIATION_NAME)
          .eq('alliance_id', alliance.id)
          .maybeSingle();
        if (associationError) throw associationError;
        if (!association?.id) {
          throw new Error('Association not found');
        }
        associationId = association.id;
      } catch (err) {
        console.warn('Alliance/association lookup failed; using fallback association id.', err);
        associationId = ASSOCIATION_ID;
      }
      if (!associationId) {
        showDialog('Branch setup error', 'Association not found for this app configuration.');
        return;
      }
      const { data, error } = await supabase
        .from('ymca_branches')
        .select('id, code, name, address, city, state, zip, phone, description')
        .eq('association_id', associationId)
        .order('name');
      if (error) {
        showDialog('Branch setup error', 'Unable to load branch list for this association.');
        return;
      }
      if (!data?.length) {
        setBranches([]);
        showDialog('No branches available', 'No branches are available for the selected association.');
        return;
      }
      setBranches(data);
      if (!branchId) {
        const eastside = data.find((b) => b.code === 'eastside_family_ymca');
        setBranchId(eastside?.id ?? data[0].id);
      }
    };
    loadBranches();
  }, []);

  const selectedBranch = useMemo(() => branches.find((b) => b.id === branchId), [branches, branchId]);

  const knownNicknameExists = (branch: Branch | undefined, nick: string) => {
    // No hardcoded nicknames; rely on RPC or actual data.
    return false;
  };

  const branchLabel = useMemo(() => {
    const found = branches.find((b) => b.id === branchId);
    if (!found) return 'Select branch';
    const name = found.name ?? 'Branch';
    if (name.length >= 28) {
      return `${name.substring(0, 28)}...`;
    }
    return name;
  }, [branches, branchId]);

  const nicknameDisplay = nickname.trim().toUpperCase();

  const requireFields = () => {
    if (!branchId) {
      showDialog('Please select a branch', 'Choose your branch to continue.');
      return false;
    }
    if (!nickname.trim()) {
      showDialog('Nickname required', 'Enter your schedule nickname (unique per branch).');
      return false;
    }
    return true;
  };

  const startResendTimer = (seconds: number) => {
    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
    }
    setResendCooldown(seconds);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) {
            clearInterval(resendTimerRef.current);
            resendTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const focusCodeInput = () => {
    codeInputRef.current?.focus();
  };

  const handleCodeChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(sanitized);
  };

  const validateNickname = async (opts?: { showSuccess?: boolean }) => {
    const showSuccess = opts?.showSuccess ?? true;
    if (!requireFields()) return false;
    setNicknameExists(false);
    let exists: boolean | null = null;
    try {
      exists = await checkNicknameExists(branchId!, nickname);
      if (exists === null) {
        // RPC missing: try known fallback for test data.
        exists = knownNicknameExists(selectedBranch, nickname);
      }
    } catch (err: any) {
      showDialog('Nickname check failed', err.message ?? 'Unable to check nickname');
      return false;
    }
    if (exists === null) {
      showDialog('Nickname check unavailable', 'Please try again later.');
      return false;
    }
    setNicknameExists(Boolean(exists));
    if (exists) {
      // If there is a pending email confirmation for this nickname, alert and offer actions
      const { data: sessionData } = await supabase.auth.getSession();
      const hasSession = Boolean(sessionData?.session?.user);
      if (!hasSession && pendingEmailKey) {
        try {
          const pendingRaw = await AsyncStorage.getItem(pendingEmailKey);
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw);
            if (pending?.email) {
              showDialog(
                'Email confirmation required',
                `We sent a confirmation link to ${pending.email}. Open it, then return and sign in.`,
                [
                  {
                    label: 'Go to Login',
                    onPress: navigateToLogin,
                  },
                  {
                    label: 'Clear pending',
                    onPress: async () => {
                      if (pendingEmailKey) {
                        await AsyncStorage.removeItem(pendingEmailKey);
                      }
                    },
                  },
                ]
              );
              return false;
            }
          }
        } catch (err) {
          console.warn('Pending email lookup failed', err);
        }
      }
    }
    if (!exists) {
      setHideContent(true);
      showDialog('Nickname not found', 'We could not find that nickname for this branch. Please re-enter it.', [
        {
          label: 'OK',
          onPress: () => {
            setNickname('');
            setHideContent(false);
            // Focus will be handled by useEffect when hideContent becomes false
          },
        },
      ]);
      return false;
    }
    if (exists && showSuccess) {
      setDetailsModalVisible(true);
    }
    return true;
  };

  const handleSendOtp = async () => {
    console.warn('Onboarding send OTP attempt', {
      hasBranchId: Boolean(branchId),
      nicknameLength: nickname.trim().length,
      emailLength: email.trim().length,
      confirmLength: confirmEmail.trim().length,
      emailHasAt: email.includes('@'),
      confirmHasAt: confirmEmail.includes('@'),
      emailsMatch: email.trim().toLowerCase() === confirmEmail.trim().toLowerCase(),
    });
    if (!requireFields()) return;
    setPassword('');
    setConfirmPassword('');
    if (!email.trim()) {
      console.warn('Onboarding send OTP blocked: missing email', {
        emailLength: email.trim().length,
        confirmLength: confirmEmail.trim().length,
      });
      showDialog('Email required', 'Enter your email address.');
      return;
    }
    if (!confirmEmail.trim()) {
      console.warn('Onboarding send OTP blocked: missing confirm email', {
        emailLength: email.trim().length,
        confirmLength: confirmEmail.trim().length,
      });
      showDialog('Confirm your email', 'Please re-enter your email to confirm.');
      return;
    }
    const emailNormalized = email.trim().toLowerCase();
    const confirmNormalized = confirmEmail.trim().toLowerCase();
    if (emailNormalized !== confirmNormalized) {
      console.warn('Onboarding send OTP blocked: email mismatch', {
        emailLength: emailNormalized.length,
        confirmLength: confirmNormalized.length,
      });
      showDialog('Emails do not match', 'Please make sure both email fields match.');
      return;
    }
    // Check if email already exists (allow linking an existing account)
    setLoading(true);
    setCodeStatus('');
    let shouldCreateUser = true;
    try {
      const { data: dupData, error: dupErr } = await supabase.rpc('check_email_exists', { p_email: emailNormalized });
      if (dupErr) {
        showDialog('Email check failed', dupErr.message ?? 'Unable to verify email.');
        setLoading(false);
        return;
      }
      shouldCreateUser = dupData !== true;
    } catch (err: any) {
      showDialog('Email check failed', err?.message ?? 'Unable to verify email.');
      setLoading(false);
      return;
    }
    if (!nicknameExists) {
      const nicknameOk = await validateNickname({ showSuccess: false });
      if (!nicknameOk) {
        setLoading(false);
        return;
      }
    }

    // Confirm email prompt
    const emailConfirm = emailNormalized;
    showDialog('Confirm email', `Send code to ${emailConfirm}?`, [
      {
        label: 'Yes',
        onPress: async () => {
          setDialog({ visible: false, title: '', message: '', buttons: undefined });
          if (pendingEmailKey) {
            try {
              await AsyncStorage.setItem(
                pendingEmailKey,
                JSON.stringify({
                  email: emailConfirm,
                  branchId,
                  nickname: nickname.trim(),
                  firstName: firstName.trim() || null,
                  lastName: lastName.trim() || null,
                })
              );
            } catch (err) {
              console.warn('Failed to store pending email', err);
            }
          }
          try {
            const { error: otpErr } = await supabase.auth.signInWithOtp({
              email: emailConfirm,
              options: {
                shouldCreateUser,
              },
            });
            if (otpErr) throw otpErr;

            setCodeSentTo(emailConfirm);
            setMode('code');
            setCodeStatus(
              shouldCreateUser
                ? 'An 8-digit code was sent to your email.'
                : 'An 8-digit code was sent to your email. This will link your existing account to your nickname.'
            );
            setDetailsModalVisible(false);
            startResendTimer(240);
          } catch (err: any) {
            showDialog('Auth error', err.message ?? 'Unable to authenticate');
          } finally {
            setLoading(false);
          }
        },
      },
      {
        label: 'No',
        variant: 'secondary',
        onPress: () => {
          setEmail('');
          setConfirmEmail('');
          setDialog({ visible: false, title: '', message: '', buttons: undefined });
          setLoading(false);
          requestAnimationFrame(() => {
            emailInputRef.current?.focus();
          });
        },
      },
    ]);
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) {
      setCodeStatus(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    if (code.trim().length !== OTP_LENGTH) {
      setCodeStatus(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    if (!codeSentTo) {
      setCodeStatus('Missing email context. Go back and resend the code.');
      return;
    }
    setLoading(true);
    setCodeStatus('Verifying code...');
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: codeSentTo,
        token: code.trim(),
        type: 'email',
      });
      if (verifyErr) throw verifyErr;

      // Optionally set password after OTP if provided
      if (password.trim()) {
        await supabase.auth.updateUser({ password: password });
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error('No session after code verification.');

      // Inform user code was accepted; proceed to complete onboarding.
      showDialog('Code accepted', 'Completing sign-in…');
      setMode('password');
      setCodeStatus('Code verified. Set your password to finish.');
    } catch (err: any) {
      console.warn('OTP verify failed', err);
      setCodeStatus(err?.message ?? 'Verification failed. Check the code and try again.');
      showDialog('Verification failed', err?.message ?? 'Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!password.trim()) {
      showDialog('Password required', 'Enter a password to continue.');
      return;
    }
    if (password !== confirmPassword) {
      showDialog('Passwords do not match', 'Please confirm the same password.');
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error('No session after code verification.');

      const { error: updateErr } = await supabase.auth.updateUser({ password: password.trim() });
      if (updateErr) throw updateErr;

      await completeOnboarding(userId);
      // Try to send a congrats email via an Edge Function if configured.
      try {
        if (congratsEndpoint && codeSentTo) {
          await fetch(congratsEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: codeSentTo,
              nickname: nickname.trim(),
            }),
          });
        }
      } catch (mailErr) {
        console.warn('Congrats email failed (non-blocking)', mailErr);
      }
      showDialog('Success', 'You are signed in.');
    } catch (err: any) {
      showDialog('Password setup failed', err?.message ?? 'Unable to set password.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    if (!codeSentTo) {
      setCodeStatus('Missing email context. Go back and resend from the form.');
      return;
    }
    setLoading(true);
    setCodeStatus('Resending code...');
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: codeSentTo,
        options: {
          shouldCreateUser: true,
        },
      });
      if (otpErr) throw otpErr;
      setCodeStatus('Code resent.');
      startResendTimer(30);
    } catch (err: any) {
      setCodeStatus(err?.message ?? 'Resend failed.');
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async (authUserId: string) => {
    claimingRef.current = true;
    try {
      const { error: claimError } = await supabase.rpc('claim_instructor', {
        p_branch_id: branchId,
        p_nickname: nickname.trim(),
        p_first_name: firstName.trim() || null,
        p_last_name: lastName.trim() || null,
      });
      if (claimError) {
        throw claimError;
      }
      try {
        const keys: string[] = [];
        if (pendingEmailKey) {
          keys.push(pendingEmailKey);
        }
        keys.push(pendingClaimContextKey);
        await AsyncStorage.multiRemove(keys);
        await AsyncStorage.setItem(
          lastClaimKey,
          JSON.stringify({ branchId: branchId ?? null, nickname: nickname.trim() })
        );
      } catch (err) {
        console.warn('Failed to store last attendance claim', err);
      }
      await supabase.rpc('update_last_login');
      router.replace({
        pathname: '/attendance',
        params: {
          branchId: branchId ?? '',
          nickname: nickname.trim(),
        },
      });
    } catch (err: any) {
      showDialog('Onboarding error', err.message ?? 'Unable to claim instructor');
    } finally {
      claimingRef.current = false;
    }
  };

  if (mode === 'code') {
    return (
      <LinearGradient colors={['#01A490', '#0f172a']} style={styles.gradient}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAwareScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            enableOnAndroid
            enableAutomaticScroll
            extraScrollHeight={100}
            extraHeight={100}
            keyboardOpeningTime={0}
            enableResetScrollToCoords={false}
            scrollToOverflowEnabled={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <View style={styles.codeScreenHeader}>
              <Text style={styles.title}>Enter 8-digit code</Text>
              <Text style={styles.helper}>
                We sent a code to {codeSentTo ?? 'your email'}. You have up to 4 minutes to enter it.
              </Text>
            </View>
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
            <View style={styles.buttonRow}>
              <ActionButton title="Verify code" onPress={handleVerifyCode} disabled={loading} />
              <ActionButton
                title={resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend code'}
                onPress={handleResendCode}
                disabled={loading || resendCooldown > 0}
                variant="secondary"
              />
            </View>
            {codeStatus ? <Text style={styles.helperSmall}>{codeStatus}</Text> : null}
            <View style={styles.buttonRow}>
              <ActionButton
                title="Back"
                variant="secondary"
                onPress={() => {
                  setMode('form');
                  setCode('');
                  setCodeStatus('');
                  setResendCooldown(0);
                  setPassword('');
                  setConfirmPassword('');
                  if (resendTimerRef.current) {
                    clearInterval(resendTimerRef.current);
                    resendTimerRef.current = null;
                  }
                }}
              />
            </View>
          </KeyboardAwareScrollView>
          <ThemedDialog
            visible={dialog.visible}
            title={dialog.title}
            message={dialog.message}
            buttons={dialog.buttons}
            onClose={() => closeDialog()}
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (mode === 'password') {
    return (
      <LinearGradient colors={['#01A490', '#0f172a']} style={styles.gradient}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAwareScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            enableOnAndroid
            enableAutomaticScroll
            extraScrollHeight={100}
            extraHeight={100}
            keyboardOpeningTime={0}
            enableResetScrollToCoords={false}
            scrollToOverflowEnabled={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <View style={styles.codeScreenHeader}>
              <Text style={styles.title}>Create a password</Text>
              <Text style={styles.helper}>
                Your code is verified. Set a password to finish creating your account.
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <View style={styles.buttonRow}>
              <ActionButton title="Finish sign-up" onPress={handleSetPassword} disabled={loading} />
              <ActionButton
                title="Back"
                variant="secondary"
                onPress={() => {
                  setMode('code');
                  setPassword('');
                  setConfirmPassword('');
                }}
              />
            </View>
          </KeyboardAwareScrollView>
          <ThemedDialog
            visible={dialog.visible}
            title={dialog.title}
            message={dialog.message}
            buttons={dialog.buttons}
            onClose={() => closeDialog()}
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#01A490', '#0f172a']} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        {!detailsModalVisible && (
          <>
            <View style={styles.brandHeader}>
              <Image source={require('../../assets/images/ymca-logo.v2.png')} style={styles.brandLogo} />
              <View style={styles.brandTextBlock}>
                <Text style={styles.title}>
                  Instructor onboarding
                </Text>
                <Text style={styles.headerBranchText} numberOfLines={1} ellipsizeMode="tail">
                  {selectedBranch?.name ?? 'Of the Greater Rochester Area'}
                </Text>
              </View>
            </View>
            {!hideContent && (
            <KeyboardAwareScrollView
              ref={scrollViewRef}
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              enableOnAndroid
              enableAutomaticScroll
              extraScrollHeight={100}
              extraHeight={100}
              keyboardOpeningTime={0}
              enableResetScrollToCoords={false}
              scrollToOverflowEnabled={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag">
            <Text style={styles.helper}>
          From your schedule: <Text style={styles.prefixBold}>a.</Text> select the branch name <Text style={styles.prefixBold}>b.</Text> locate your nickname <Text style={styles.prefixBold}>c.</Text> select Check Nickname to enter your credential for signup.
        </Text>
        <Text style={styles.sectionLabel}>
          <Text style={styles.prefixBold}>a.</Text> Branch
        </Text>
        <View style={styles.branchBox}>
          <View style={styles.branchHeaderRow}>
            <Text style={styles.branchText}>
              {branchLabel}
            </Text>
            <Pressable
              style={styles.detailsAction}
              onPress={() =>
                setShowBranchDetails((prev) => {
                  const next = !prev;
                  if (!next) setShowBranchList(false);
                  return next;
                })
              }
              hitSlop={8}>
              <Text style={styles.detailsActionText}>{showBranchDetails ? 'Hide' : 'Select'}</Text>
            </Pressable>
          </View>
          {showBranchDetails && selectedBranch && (
            <View style={styles.branchDetails}>
              {selectedBranch.address ? <Text style={styles.branchLine}>{selectedBranch.address}</Text> : null}
              {(selectedBranch.city || selectedBranch.state || selectedBranch.zip) ? (
                <Text style={styles.branchLine}>
                  {[selectedBranch.city, selectedBranch.state].filter(Boolean).join(', ')}
                  {selectedBranch.zip ? ` ${selectedBranch.zip}` : ''}
                </Text>
              ) : null}
              {selectedBranch.phone ? <Text style={styles.branchLine}>{selectedBranch.phone}</Text> : null}
              {selectedBranch.description ? (
                <Text style={styles.branchLine}>{selectedBranch.description}</Text>
              ) : null}
            </View>
          )}
          {showBranchDetails && branches.length > 1 && (
            <View style={styles.branchActions}>
              <Text style={styles.helper}>Select your branch.</Text>
              <Pressable
                onPress={() => setShowBranchList((prev) => !prev)}
                style={styles.toggleListAction}>
                <Text style={styles.toggleListText}>{showBranchList ? 'Hide list' : 'View list'}</Text>
              </Pressable>
            </View>
          )}
          {showBranchList && branches.length > 0 && (
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerHeaderText}>Choose branch</Text>
                <Pressable onPress={() => setShowBranchList(false)} style={styles.closeAction}>
                  <Text style={styles.closeActionText}>Close</Text>
                </Pressable>
              </View>
              <Picker
                selectedValue={branchId ?? branches[0]?.id}
                onValueChange={(val) => setBranchId(val)}
                style={styles.picker}
                dropdownIconColor="#facc15"
                itemStyle={styles.pickerItem}>
                {branches.map((b) => (
                  <Picker.Item
                    key={b.id}
                    label={`${branchId === b.id ? '• ' : ''}${b.name ?? 'Branch'}`}
                    value={b.id}
                    color={branchId === b.id ? '#0f172a' : '#1e293b'}
                  />
                ))}
              </Picker>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>
          <Text style={styles.prefixBold}>b.</Text> Nickname
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Your schedule nickname"
          autoCapitalize="characters"
          value={nickname}
          onChangeText={setNickname}
          ref={nicknameInputRef}
          returnKeyType="done"
          onSubmitEditing={() => validateNickname({ showSuccess: true })}
        />
        <View style={styles.buttonRow}>
          <ActionButton
            title={
              <Text>
                <Text style={styles.prefixBold}>c.</Text> Check Nickname
              </Text>
            }
            onPress={validateNickname}
            disabled={loading}
          />
        </View>
        <Text style={styles.helperSmall}>
          After sign-in and you have completed email confirmation you will be directed to the Attendance screen to review your classes and enter member attendance.
        </Text>
      </KeyboardAwareScrollView>
            )}
          </>
        )}
      </SafeAreaView>
      <Modal
        transparent
        animationType="fade"
        visible={detailsModalVisible}
        onRequestClose={() => setDetailsModalVisible(false)}>
        <View style={styles.detailsModalWrapper}>
          <KeyboardAwareScrollView
            style={styles.detailsScrollView}
            contentContainerStyle={styles.detailsBackdrop}
            enableOnAndroid
            enableAutomaticScroll
            extraScrollHeight={100}
            extraHeight={100}
            keyboardOpeningTime={0}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <LinearGradient colors={['#01A490', '#0f172a']} style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Instructor details</Text>
            <Text style={styles.detailsHelper}>
              Please confirm your name and email so we can finish linking your account.
            </Text>
            {nicknameDisplay ? (
              <View style={styles.nicknameInfo}>
                <Text style={styles.nicknameInfoLabel}>Nick Name</Text>
                <Text style={styles.nicknameInfoValue}>{nicknameDisplay}</Text>
              </View>
            ) : null}
            <TextInput
              style={[styles.input, styles.modalInput]}
              placeholder="First name"
              placeholderTextColor="rgba(248,250,252,0.6)"
              value={firstName}
              onChangeText={setFirstName}
              ref={firstNameInputRef}
            />
            <TextInput
              style={[styles.input, styles.modalInput]}
              placeholder="Last name"
              placeholderTextColor="rgba(248,250,252,0.6)"
              value={lastName}
              onChangeText={setLastName}
            />
            <TextInput
              ref={emailInputRef}
              style={[styles.input, styles.modalInput]}
              placeholder="Email"
              placeholderTextColor="rgba(248,250,252,0.6)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, styles.modalInput]}
              placeholder="Confirm email"
              placeholderTextColor="rgba(248,250,252,0.6)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={confirmEmail}
              onChangeText={setConfirmEmail}
            />
            <View style={styles.detailsButtons}>
              <Pressable
                style={[
                  styles.detailsPrimaryButton,
                  loading && styles.detailsPrimaryButtonDisabled,
                ]}
                disabled={loading}
                onPress={handleSendOtp}>
                <Text style={styles.detailsPrimaryText}>
                  {loading ? 'Processing…' : 'Send 8-digit code'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.detailsSecondaryButton, loading && styles.detailsSecondaryButtonDisabled]}
                disabled={loading}
                onPress={() => setDetailsModalVisible(false)}>
                <Text style={styles.detailsSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
            </LinearGradient>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
      <ThemedDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={() => closeDialog()}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 240,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  flex: { flex: 1 },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  brandLogo: { width: 56, height: 56 },
  brandTextBlock: { gap: 2, flex: 1, minWidth: 0 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerBranchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    color: '#e2e8f0',
  },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalInput: {
    backgroundColor: 'rgba(15,23,42,0.35)',
    borderColor: 'rgba(248,250,252,0.25)',
    color: '#f8fafc',
  },
  branchBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'rgba(15,23,42,0.6)',
    gap: 10,
    overflow: 'hidden',
  },
  branchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  branchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
    minWidth: 0,
  },
  branchDetails: {
    marginTop: 6,
    gap: 2,
  },
  branchLine: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  helper: {
    marginTop: 4,
    color: '#cbd5e1',
  },
  branchActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.5)',
    backgroundColor: 'rgba(56,189,248,0.15)',
    minWidth: 70,
    alignItems: 'center',
    flexShrink: 0,
  },
  detailsActionText: { color: '#38bdf8', fontWeight: '600' },
  toggleListAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.5)',
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  toggleListText: { color: '#38bdf8', fontWeight: '600' },
  pickerContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
  },
  pickerHeaderText: { color: '#f8fafc', fontWeight: '600' },
  closeAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.2)',
  },
  closeActionText: { color: '#38bdf8', fontWeight: '600' },
  picker: {
    marginTop: 0,
    color: '#f8fafc',
  },
  pickerItem: { color: '#0f172a' },
  helperSmall: {
    marginTop: 8,
    color: '#e2e8f0',
    fontSize: 12,
  },
  prefixBold: { fontWeight: '800' },
  buttonRow: {
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-start',
  },
  toggleButton: {
    flex: 1,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#facc15',
    backgroundColor: '#facc15',
  },
  buttonPrimary: {
    backgroundColor: '#facc15',
    borderColor: '#facc15',
  },
  buttonSecondary: {
    backgroundColor: 'rgba(15,23,42,0.4)',
    borderColor: '#94a3b8',
  },
  buttonSelected: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#1f2937',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: '#e2e8f0',
  },
  buttonTextDisabled: {
    color: '#fef3c7',
  },
  detailsModalWrapper: {
    flex: 1,
    marginTop: 56,
    backgroundColor: '#01A490',
    justifyContent: 'center',
    paddingTop: 15,
  },
  detailsScrollView: {
    flexGrow: 0,
  },
  detailsBackdrop: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  detailsCard: {
    width: '100%',
    borderRadius: 28,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(248,250,252,0.85)',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  detailsCardContent: {
    gap: 10,
  },
  detailsTitle: { fontSize: 22, fontWeight: '700', color: '#fef3c7' },
  detailsHelper: { color: '#e2e8f0', marginBottom: 4 },
  nicknameInfo: {
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.35)',
    backgroundColor: 'rgba(71,85,105,0.45)',
  },
  nicknameInfoLabel: {
    color: 'rgba(248,250,252,0.7)',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  nicknameInfoValue: {
    color: '#fef3c7',
    fontSize: 18,
    fontWeight: '700',
  },
  detailsButtons: {
    marginTop: 8,
    gap: 12,
  },
  detailsPrimaryButton: {
    backgroundColor: '#01A490',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailsPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  detailsPrimaryText: { color: '#f8fafc', fontWeight: '700' },
  detailsSecondaryButton: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.35)',
    backgroundColor: 'transparent',
  },
  detailsSecondaryButtonDisabled: {
    opacity: 0.5,
  },
  detailsSecondaryText: { color: '#a7f3d0', fontWeight: '600' },
  codeScreenHeader: {
    marginBottom: 12,
    gap: 6,
  },
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
    height: 60,
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
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  otpHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  codeBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    backgroundColor: 'rgba(56,189,248,0.08)',
    gap: 6,
  },
});

