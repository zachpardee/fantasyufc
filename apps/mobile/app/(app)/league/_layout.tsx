import { Stack } from 'expo-router';

export default function LeagueLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Leagues' }} />
      <Stack.Screen name="create" options={{ title: 'Create League' }} />
      <Stack.Screen name="[leagueId]" options={{ headerShown: false }} />
    </Stack>
  );
}
