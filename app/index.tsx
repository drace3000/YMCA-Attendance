import { Redirect } from 'expo-router';
import { useImmersiveNavBar } from '@/hooks/use-immersive-nav';

export default function RootRedirect() {
  useImmersiveNavBar();
  return <Redirect href="/welcome" />;
}



