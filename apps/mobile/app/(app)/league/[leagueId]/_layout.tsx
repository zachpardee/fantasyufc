import { Stack } from 'expo-router';

export default function LeagueDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'League' }} />
      <Stack.Screen name="matchup" options={{ title: 'Matchup' }} />
      <Stack.Screen name="picks" options={{ title: 'Event Picks' }} />
      <Stack.Screen name="standings" options={{ title: 'Standings' }} />
    </Stack>
  );
}
