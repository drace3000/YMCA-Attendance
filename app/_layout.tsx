import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Platform, StatusBar as RNStatusBar } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useImmersiveNavBar();

  useEffect(() => {
    const handle = (event: { url: string }) => {
      if (event?.url?.includes('/oauth-callback')) {
        router.push('/oauth-callback');
      }
    };
    const sub = Linking.addEventListener('url', handle);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setHidden(true, 'slide');
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ title: 'Welcome', headerShown: false }} />
        <Stack.Screen name="oauth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ title: 'Sign In', headerShown: false }} />
        <Stack.Screen
          name="auth/onboarding"
          options={{
            title: 'Instructor Login',
            headerStyle: { backgroundColor: '#ffffff' },
            headerShadowVisible: false,
            headerTintColor: '#0f172a',
            headerTitleStyle: { color: '#0f172a', fontWeight: '700' },
          }}
        />
        <Stack.Screen name="auth/reset" options={{ title: 'Reset Password', headerShown: false }} />
        <Stack.Screen name="attendance" options={{ title: 'Attendance', headerShown: false }} />
        <Stack.Screen name="today" options={{ title: 'Today' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
