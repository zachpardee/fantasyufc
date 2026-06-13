import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/api/supabase';
import { useAuthStore } from '../src/store/auth.store';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

const queryClient = new QueryClient();

function AuthGate() {
  const { session, setSession } = useAuthStore();
  const [ready, setReady] = useState(false);

  usePushNotifications();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [setSession]);

  // Keep the splash up until the stored session is loaded
  if (!ready) return null;

  // Protected routes redirect automatically when their guard flips
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthGate />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
