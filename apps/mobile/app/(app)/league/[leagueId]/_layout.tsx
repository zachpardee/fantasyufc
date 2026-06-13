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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="matchup" options={{ title: 'Matchup' }} />
      <Stack.Screen name="picks" options={{ title: 'Event Picks' }} />
      <Stack.Screen name="standings" options={{ title: 'Standings' }} />
      <Stack.Screen name="playoffs" options={{ title: 'Playoffs' }} />
      <Stack.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Stack.Screen name="rules" options={{ title: 'Rules & Scoring' }} />
      <Stack.Screen name="commissioner" options={{ title: 'Commissioner Tools' }} />
      <Stack.Screen name="picks-comparison" options={{ title: 'Pick Comparison' }} />
      <Stack.Screen name="team/[memberId]" options={{ title: 'Team' }} />
    </Stack>
  );
}
