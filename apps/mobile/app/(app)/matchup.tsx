import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/client';
import { useLeagueStore } from '../../src/store/league.store';
import type { League } from '@fantasy-ufc/shared';
import MatchupScreen from './league/[leagueId]/matchup';

// "Matchup" tab — renders the head-to-head matchup screen for your active league,
// in-place so this tab stays highlighted.
export default function MatchupTab() {
  const router = useRouter();
  const currentLeagueId = useLeagueStore((s) => s.currentLeagueId);

  const { data: leagues, isLoading } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  if (isLoading || !leagues) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#c8102e" />
      </View>
    );
  }

  // Only show a matchup for an explicitly selected league — no fallback.
  const target = currentLeagueId ? leagues.find((l) => l.id === currentLeagueId) : null;

  if (!target) {
    return (
      <View style={s.center}>
        <Text style={s.title}>No league selected</Text>
        <Text style={s.text}>Pick a league from the League Home tab to view its matchup.</Text>
        <TouchableOpacity style={s.btn} onPress={() => router.replace('/(app)/league')}>
          <Text style={s.btnText}>Go to League Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <MatchupScreen leagueIdProp={target.id} />;
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  text: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  btn: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
