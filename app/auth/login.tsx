import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';

import ThemedDialog, { DialogButton } from '@/components/themed-dialog';
import { supabase } from '@/lib/supabase';

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

const lastClaimKey = 'last-attendance-claim';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [identifier, setIdentifier] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showBranchList, setShowBranchList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showBranchDetails, setShowBranchDetails] = useState(false);
  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    refocusIdentifier?: boolean;
    buttons?: DialogButton[];
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: undefined,
  });
  const [verifying, setVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'match' | 'mismatch' | 'error'>('idle');
  const [showPassword, setShowPassword] = useState(false);

  const identifierRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const checkRunRef = useRef(0);
  const prefilledEmailVerifiedRef = useRef(false);

  const isEmail = useMemo(() => identifier.trim().includes('@'), [identifier]);
  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branches, branchId]
  );
  const branchLabel = useMemo(() => {
    const found = branches.find((b) => b.id === branchId);
    if (!found) return 'Select branch';
    return `${found.name ?? 'Branch'}`;
  }, [branches, branchId]);
  const headerBranchName = useMemo(() => {
    if (branchId) {
      return branches.find((branch) => branch.id === branchId)?.name ?? 'Branch';
    }
    if (branches.length) {
      return branches[0].name ?? 'Branch';
    }
    return 'Of the Greater Rochester Area';
  }, [branchId, branches]);

  useEffect(() => {
    const loadBranches = async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, code, name, address, city, state, zip, phone, description')
        .order('name');
      if (error) {
        console.warn('Failed to load branches', error);
        return;
      }
      setBranches(data ?? []);
      if (!branchId && data?.length) {
        const eastside = data.find((b) => b.code === 'eastside_family_ymca');
        setBranchId(eastside?.id ?? data[0].id);
      }
    };
    loadBranches();
  }, []);

  useEffect(() => {
    if (params.email) {
      setIdentifier(params.email);
      prefilledEmailVerifiedRef.current = false;
    }
  }, [params.email]);

  useEffect(() => {
    const trimmed = identifier.trim();
    setVerifyStatus('idle');
    setPassword('');
    if (trimmed && branchId) {
      checkIdentifierAgainstBranch(trimmed, branchId, trimmed.includes('@'));
    }
  }, [branchId]);

  // Trigger verification when email is prefilled and branchId becomes available
  useEffect(() => {
    if (
      params.email &&
      identifier === params.email &&
      branchId &&
      branches.length > 0 &&
      !prefilledEmailVerifiedRef.current
    ) {
      const trimmed = identifier.trim();
      if (trimmed) {
        prefilledEmailVerifiedRef.current = true;
        // Small delay to avoid race condition with branchId effect
        const timer = setTimeout(() => {
          checkIdentifierAgainstBranch(trimmed, branchId, trimmed.includes('@'));
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [params.email, identifier, branchId, branches.length]);

  useEffect(() => {
    // When email is prefilled and verification succeeds, focus on password field
    if (params.email && identifier === params.email && verifyStatus === 'match') {
      setTimeout(() => {
        passwordRef.current?.focus();
      }, 100);
    }
  }, [params.email, identifier, verifyStatus]);

  const handleIdentifierChange = (text: string) => {
    // Preserve user input while typing; casing handled on blur
    setIdentifier(text);
    setVerifyStatus('idle');
  };

  const handleIdentifierBlur = () => {
    const trimmed = identifier.trim();
    if (trimmed.length < 11 && !trimmed.includes('@')) {
      setIdentifier(trimmed.toUpperCase());
    } else {
      setIdentifier(trimmed);
    }
    checkIdentifierAgainstBranch(trimmed, undefined, trimmed.includes('@'));
  };

  const showDialog = (
    title: string,
    message: string,
    opts?: { refocusIdentifier?: boolean; buttons?: DialogButton[] }
  ) => {
    setDialog({
      visible: true,
      title,
      message,
      refocusIdentifier: opts?.refocusIdentifier,
      buttons: opts?.buttons,
    });
  };

  const closeDialog = () => {
    const shouldRefocus = dialog.refocusIdentifier;
    setDialog({ visible: false, title: '', message: '', buttons: undefined });
    if (shouldRefocus) {
      setTimeout(() => identifierRef.current?.focus(), 50);
    }
  };

  const checkIdentifierAgainstBranch = async (
    currentIdentifier?: string,
    currentBranchId?: string,
    isEmailOverride?: boolean
  ) => {
    const runId = ++checkRunRef.current;
    const trimmed = (currentIdentifier ?? identifier).trim();
    const targetBranchId = currentBranchId ?? branchId;
    const emailMode = typeof isEmailOverride === 'boolean' ? isEmailOverride : isEmail;
    if (!trimmed || !targetBranchId) {
      setVerifyStatus('idle');
      setVerifying(false);
      return;
    }
    setVerifying(true);
    setVerifyStatus('idle');
    try {
      if (emailMode) {
        const { data, error } = await supabase.rpc('email_in_branch', {
          p_email: trimmed.toLowerCase(),
          p_branch_id: targetBranchId,
        });
        if (error) throw error;
        if (runId !== checkRunRef.current) return;
        if (data) {
          setVerifyStatus('match');
          setTimeout(() => passwordRef.current?.focus(), 50);
        } else {
          setVerifyStatus('mismatch');
          setPassword('');
          showDialog('Not found', 'Nickname or email not linked to this branch.', { refocusIdentifier: true });
        }
      } else {
        // First check if nickname exists in branch
        const { data: exists, error: existsError } = await supabase.rpc('nickname_exists', {
          p_branch_id: targetBranchId,
          p_nickname: trimmed.toUpperCase(),
        });
        if (existsError) throw existsError;
        if (runId !== checkRunRef.current) return;
        
        if (!exists) {
          setVerifyStatus('mismatch');
          setPassword('');
          showDialog('Not found', 'Nickname or email not linked to this branch.', { refocusIdentifier: true });
          return;
        }

        // If nickname exists, check if it has an email (auth_user_id)
        const { data: email, error: emailError } = await supabase.rpc('nickname_login_email', {
          p_branch_id: targetBranchId,
          p_nickname: trimmed.toUpperCase(),
        });
        if (emailError) throw emailError;
        if (runId !== checkRunRef.current) return;
        
        if (email) {
          setVerifyStatus('match');
          setTimeout(() => passwordRef.current?.focus(), 50);
        } else {
          setVerifyStatus('mismatch');
          setPassword('');
          showDialog(
            'Account setup required',
            'This nickname exists but is not linked to an account. Please complete onboarding to create your account.',
            {
              refocusIdentifier: false,
              buttons: [
                {
                  label: 'Go to Onboarding',
                  onPress: () => router.push('/auth/onboarding'),
                  variant: 'primary',
                },
                { label: 'Cancel', variant: 'secondary' },
              ],
            }
          );
        }
      }
    } catch (err: any) {
      if (runId !== checkRunRef.current) return;
      setVerifyStatus('error');
      setPassword('');
      showDialog('Lookup failed', err?.message ?? 'Unable to verify identifier for this branch.', {
        refocusIdentifier: true,
      });
    } finally {
      if (runId === checkRunRef.current) {
        setVerifying(false);
      }
    }
  };

  const handleSignIn = async () => {
    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      showDialog('Required', 'Enter your nickname/email and password.');
      return;
    }
    if (!isEmail && !branchId) {
      showDialog('Select branch', 'Choose your branch before signing in with a nickname.');
      return;
    }
    if (verifyStatus !== 'match') {
      showDialog('Not verified', 'Nickname or email not linked to this branch.', { refocusIdentifier: true });
      return;
    }
    setLoading(true);
    try {
      let emailToUse = trimmedId.toLowerCase();
      if (!isEmail) {
        const { data, error } = await supabase.rpc('nickname_login_email', {
          p_branch_id: branchId,
          p_nickname: trimmedId,
        });
        if (error) throw error;
        if (!data) {
          showDialog('Not found', 'Nickname not linked to an account yet.');
          return;
        }
        emailToUse = String(data).toLowerCase();
      }

      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });
      if (signInError || !authData?.user) {
        throw signInError ?? new Error('Unable to sign in.');
      }

      try {
        const { data: instructor } = await supabase
          .from('instructors')
          .select('branch_id, nickname')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();
        if (instructor?.branch_id && instructor?.nickname) {
          await AsyncStorage.setItem(
            lastClaimKey,
            JSON.stringify({ branchId: instructor.branch_id, nickname: instructor.nickname })
          );
        }
      } catch (err) {
        console.warn('Failed to store last instructor claim', err);
      }

      router.replace('/attendance');
    } catch (err: any) {
      showDialog('Login failed', err?.message ?? 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };


  return (
    <>
      <ThemedDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={closeDialog}
      />
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
        <View>
          <View style={styles.brandHeader}>
            <Image source={require('../../assets/images/ymca-logo.v2.png')} style={styles.logo} />
            <View style={styles.brandTextBlock}>
              <Text style={styles.title}>YMCA Login</Text>
              <Text style={styles.branchText}>{headerBranchName}</Text>
            </View>
          </View>
          <Text style={styles.helper}>
            Use your schedule nickname + branch or the email you registered with, along with your password.
          </Text>

          <Text style={styles.sectionLabel}>Nickname or email</Text>
          <TextInput
            style={styles.input}
            placeholder="Nickname or email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            ref={identifierRef}
            value={identifier}
            onChangeText={handleIdentifierChange}
            onBlur={handleIdentifierBlur}
          />

          {!isEmail && (
            <View style={styles.branchBox}>
              <View style={styles.branchHeaderRow}>
                <Text style={styles.branchText}>{branchLabel}</Text>
                <Pressable
                  style={styles.detailsAction}
                  onPress={() =>
                    setShowBranchDetails((prev) => {
                      const next = !prev;
                      if (!next) {
                        setShowBranchList(false);
                      }
                      return next;
                    })
                  }
                  hitSlop={8}>
                  <Text style={styles.detailsActionText}>
                    {showBranchDetails ? 'Hide' : 'Select'}
                  </Text>
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
                  <Pressable onPress={() => setShowBranchList((prev) => !prev)} style={styles.toggleListAction}>
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
                    onValueChange={setBranchId}
                    style={styles.picker}
                    dropdownIconColor="#facc15"
                    itemStyle={styles.pickerItem}>
                    {branches.map((branch) => (
                      <Picker.Item
                        key={branch.id}
                        label={`${branchId === branch.id ? '• ' : ''}${branch.name ?? 'Branch'}`}
                        value={branch.id}
                      />
                    ))}
                  </Picker>
                </View>
              )}
            </View>
          )}

          <Text style={styles.sectionLabel}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              secureTextEntry={!showPassword}
              ref={passwordRef}
              editable={verifyStatus === 'match'}
              value={password}
              onChangeText={setPassword}
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

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            disabled={loading || verifying}
            style={[styles.button, (loading || verifying) ? styles.buttonDisabled : null]}
            onPress={handleSignIn}
            hitSlop={6}>
            <Text style={styles.buttonText}>
              {loading ? 'Signing in…' : verifying ? 'Checking…' : 'Sign In'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.orDivider}>OR</Text>

        <View style={styles.secondaryActionRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.goButton}
            onPress={() => router.push('/auth/reset')}
            hitSlop={8}>
            <Text style={styles.goButtonText}>Go</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryLinkContainer}
            onPress={() => router.push('/auth/reset')}>
            <Text style={styles.secondaryLink}>Forgot password? Reset with a code</Text>
          </Pressable>
        </View>

        <View style={[styles.secondaryActionRow, { marginTop: 19 }]}>
          <Pressable
            accessibilityRole="button"
            style={styles.goButton}
            onPress={() => router.push('/auth/onboarding')}
            hitSlop={8}>
            <Text style={styles.goButtonText}>Go</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryLinkContainer}
            onPress={() => router.push('/auth/onboarding')}>
            <Text style={styles.secondaryLink}>Need a new account? Start onboarding</Text>
          </Pressable>
        </View>
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
  container: {
    gap: 18,
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandTextBlock: { gap: 2 },
  logo: { width: 56, height: 56, marginTop: -15 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  branchText: { color: '#f8fafc', fontWeight: '600', fontSize: 16 },
  branchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  helper: { color: '#e2e8f0', fontSize: 14, lineHeight: 20, marginTop: 25 },
  sectionLabel: { color: '#f8fafc', fontWeight: '600', marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  branchBox: {
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.5)',
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'rgba(15,23,42,0.5)',
    gap: 10,
    marginTop: 8,
  },
  branchDetails: {
    marginTop: 6,
    gap: 2,
  },
  branchLine: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  branchActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleListAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.5)',
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  toggleListText: { color: '#38bdf8', fontWeight: '600' },
  detailsAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.5)',
    backgroundColor: 'rgba(56,189,248,0.15)',
    minWidth: 76,
    alignItems: 'center',
  },
  detailsActionText: { color: '#38bdf8', fontWeight: '600' },
  pickerContainer: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
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
  picker: { color: '#f8fafc' },
  pickerItem: { color: '#0f172a' },
  buttonRow: { marginTop: 16 },
  button: {
    backgroundColor: '#facc15',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  orDivider: {
    color: '#e2e8f0',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 1,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -1,
    gap: 12,
  },
  goButton: {
    backgroundColor: '#facc15',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryLinkContainer: {
    flex: 1,
  },
  secondaryLink: { color: '#e2e8f0', fontSize: 14 },
});

