import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

// Per-screen back button. Reads this screen's own params (not global, so it never
// leaks a stale `from` between screens). When deep-linked from the Current Event tab
// (`from=event`) a plain back would pop the league stack to league home, so we return
// to that tab instead.
function BackBtn({ from, leagueId }: { from?: string; leagueId?: string }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => {
        if (from === 'event') {
          router.replace('/(app)/current-event');
          return;
        }
        if (router.canGoBack()) {
          router.back();
          return;
        }
        router.replace(`/(app)/league/${leagueId}`);
      }}
      hitSlop={8}
      style={{ paddingRight: 12 }}
    >
      <ChevronLeft size={24} color="#fff" />
    </TouchableOpacity>
  );
}

export default function LeagueDetailLayout() {
  return (
    <Stack
      screenOptions={({ route }) => {
        const params = (route.params ?? {}) as { leagueId?: string; from?: string };
        return {
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#fff',
          headerBackTitle: 'Back',
          headerLeft: () => <BackBtn from={params.from} leagueId={params.leagueId} />,
        };
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="event" options={{ headerShown: false }} />
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
