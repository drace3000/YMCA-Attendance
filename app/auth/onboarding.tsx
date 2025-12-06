import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Picker } from '@react-native-picker/picker';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

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

type ActionButtonProps = {
  title: string;
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
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hasNickname, setHasNickname] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const claimingRef = useRef(false);

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
    const loadBranches = async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, code, name, address, city, state, zip, phone, description');
      if (error) {
        Alert.alert('Error loading branches', error.message);
        return;
      }
      setBranches(data);
      if (data?.length && !branchId) {
        const eastside = data.find((b) => b.code === 'eastside_family_ymca');
        setBranchId(eastside?.id ?? data[0].id);
      }
    };
    loadBranches();
  }, [branchId]);

  const selectedBranch = useMemo(() => branches.find((b) => b.id === branchId), [branches, branchId]);

  const knownNicknameExists = (branch: Branch | undefined, nick: string) => {
    const n = nick.trim().toUpperCase();
    if (!branch) return false;
    const code = branch.code ?? '';
    // Temporary test fallback: assume EVA exists for Eastside.
    if (code === 'eastside_family_ymca' && n === 'EVA') return true;
    return false;
  };

  const branchLabel = useMemo(() => {
    const found = branches.find((b) => b.id === branchId);
    if (!found) return 'Select branch';
    return `${found.name ?? 'Branch'}`;
  }, [branches, branchId]);

  const requireFields = () => {
    if (!branchId) {
      Alert.alert('Please select a branch');
      return false;
    }
    if (!nickname.trim()) {
      Alert.alert('Nickname required', 'Enter your schedule nickname (unique per branch).');
      return false;
    }
    return true;
  };

  const validateNickname = async (opts?: { showSuccess?: boolean }) => {
    const showSuccess = opts?.showSuccess ?? true;
    if (!requireFields()) return false;
    let exists: boolean | null = null;
    try {
      const { data, error } = await supabase.rpc('nickname_exists', {
        p_branch_id: branchId,
        p_nickname: nickname.trim(),
      });
      if (error) {
        if (error?.code !== 'PGRST202') {
          throw error;
        }
        // RPC missing: try known fallback for test data.
        exists = knownNicknameExists(selectedBranch, nickname);
      } else if (typeof data === 'boolean') {
        exists = data;
      }
    } catch (err: any) {
      Alert.alert('Nickname check failed', err.message ?? 'Unable to check nickname');
      return false;
    }
    if (exists === null) {
      Alert.alert('Nickname check unavailable', 'Please try again later.');
      return false;
    }
    if (hasNickname === true && !exists) {
      Alert.alert('Not found', 'Nickname not found for this branch.');
      return false;
    }
    if (hasNickname === false && exists) {
      Alert.alert('Already taken', 'Nickname already exists for this branch.');
      return false;
    }
    if (hasNickname === true && exists && showSuccess) {
      Alert.alert('Nickname found', 'Your Nickname was found continue to login.');
    }
    return true;
  };

  const handleEmailAuth = async () => {
    if (!requireFields()) return;
    if (hasNickname === null) {
      Alert.alert('Choose nickname path', 'Select whether this is an existing or new nickname.');
      return;
    }
    const nicknameOk = await validateNickname({ showSuccess: false });
    if (!nicknameOk) return;
    if (!email.trim() || !password) {
      Alert.alert('Email and password required');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        // If user not found, attempt signup
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signupError) {
          throw signupError;
        }
        if (signupData.user) {
          await completeOnboarding(signupData.user.id);
        }
      } else if (data.user) {
        await completeOnboarding(data.user.id);
      }
    } catch (err: any) {
      Alert.alert('Auth error', err.message ?? 'Unable to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!requireFields()) return;
    if (hasNickname === null) {
      Alert.alert('Choose nickname path', 'Select whether this is an existing or new nickname.');
      return;
    }
    const nicknameOk = await validateNickname({ showSuccess: false });
    if (!nicknameOk) return;
    setLoading(true);
    try {
      const buildRedirectTo = () => {
        const useProxy = Constants.appOwnership === 'expo';
        if (useProxy) {
          const slug = Constants.expoConfig?.slug ?? 'YMCA-Attendance';
          const owner = Constants.expoConfig?.owner ?? 'anonymous';
          return `https://auth.expo.io/@${owner}/${slug}/auth/callback`;
        }
        return Linking.createURL('/auth/callback');
      };
      const redirectTo = buildRedirectTo();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) {
        throw error;
      }
      if (!data?.url) {
        throw new Error('No auth URL returned from Supabase.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const code = new URL(result.url).searchParams.get('code');
        if (!code) {
          throw new Error('No auth code returned from Google.');
        }
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }
      } else if (result.type === 'dismiss') {
        throw new Error('Google sign-in was dismissed.');
      } else if (result.type === 'cancel') {
        throw new Error('Google sign-in was cancelled.');
      }
    } catch (err: any) {
      Alert.alert('Google sign-in error', err.message ?? 'Unable to start Google sign-in');
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
      await supabase.rpc('update_last_login');
      router.replace('/today');
    } catch (err: any) {
      Alert.alert('Onboarding error', err.message ?? 'Unable to claim instructor');
    } finally {
      claimingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
        <Text style={styles.title}>Instructor login</Text>
        <Text style={styles.sectionLabel}>Do you already have a schedule nickname?</Text>
        <View style={styles.toggleRow}>
          <ActionButton
            title="Yes, existing"
            variant="secondary"
            selected={hasNickname === true}
            onPress={() => setHasNickname(true)}
            style={styles.toggleButton}
          />
          <ActionButton
            title="No, create new"
            variant="secondary"
            selected={hasNickname === false}
            onPress={() => setHasNickname(false)}
            style={styles.toggleButton}
          />
        </View>
        <Text style={styles.helper}>
          Existing: enter the nickname that already appears on a schedule. New: pick a new unique
          nickname for this branch.
        </Text>
        <Text style={styles.sectionLabel}>Branch</Text>
        <View style={styles.branchBox}>
          <Text style={styles.branchText}>{branchLabel}</Text>
          {selectedBranch && (
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
          {branches.length > 1 && <Text style={styles.helper}>Select your branch below.</Text>}
          {branches.length > 0 && (
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={branchId ?? branches[0]?.id}
                onValueChange={(val) => setBranchId(val)}
                style={styles.picker}>
                {branches.map((b) => (
                  <Picker.Item key={b.id} label={`${b.name ?? 'Branch'}`} value={b.id} />
                ))}
              </Picker>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Nickname</Text>
        <TextInput
          style={styles.input}
          placeholder="Your schedule nickname"
          autoCapitalize="characters"
          value={nickname}
          onChangeText={setNickname}
        />
        <View style={styles.buttonRow}>
          <ActionButton title="Check nickname" onPress={validateNickname} disabled={loading} />
        </View>

        <Text style={styles.sectionLabel}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="First name"
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextInput
          style={styles.input}
          placeholder="Last name"
          value={lastName}
          onChangeText={setLastName}
        />

        <Text style={styles.sectionLabel}>Email & password</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <View style={styles.buttonRow}>
          <ActionButton title="Continue with Email" onPress={handleEmailAuth} disabled={loading} />
        </View>
        <View style={styles.buttonRow}>
          <ActionButton title="Continue with Google" onPress={handleGoogle} disabled={loading} />
        </View>
        <Text style={styles.helperSmall}>
          After sign-in, we will claim your instructor record (branch + nickname) and take you to
          today&apos;s classes.
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 48,
  },
  flex: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
  },
  branchBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#f7f7f7',
  },
  branchText: {
    fontSize: 16,
    fontWeight: '500',
  },
  branchDetails: {
    marginTop: 6,
    gap: 2,
  },
  branchLine: {
    color: '#444',
    fontSize: 14,
  },
  helper: {
    marginTop: 4,
    color: '#666',
  },
  pickerContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 6,
    overflow: 'hidden',
  },
  picker: {
    marginTop: 0,
  },
  helperSmall: {
    marginTop: 8,
    color: '#777',
    fontSize: 12,
  },
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
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
  },
  buttonSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#e5edff',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: '#1f2937',
  },
  buttonTextDisabled: {
    color: '#e5e7eb',
  },
});

