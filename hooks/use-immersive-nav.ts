import { useCallback, useEffect } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect } from 'expo-router';

/**
 * Ensures the Android navigation bar stays hidden until swiped up.
 * Runs on mount and on screen focus. Avoids setBehaviorAsync/position to keep
 * edge-to-edge happy.
 */
export function useImmersiveNavBar() {
  const hideBars = useCallback(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    RNStatusBar.setHidden(true, 'slide');
  }, []);

  useEffect(() => {
    hideBars();
    const timer = setTimeout(hideBars, 300);
    return () => clearTimeout(timer);
  }, [hideBars]);

  useFocusEffect(
    useCallback(() => {
      hideBars();
      const timer = setTimeout(hideBars, 300);
      return () => clearTimeout(timer);
    }, [hideBars])
  );
}



