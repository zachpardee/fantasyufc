import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/client';
import type { League } from '@fantasy-ufc/shared';
import LeagueEventScreen from './league/[leagueId]/event';

// "Current Event" tab — renders the league's event home (old scoreboard +
// fight-card design) for your active league, in-place so this tab stays
// highlighted.
export default function CurrentEventScreen() {
  const router = useRouter();

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

  const target =
    leagues.find((l) => l.status === 'active' || l.status === 'playoffs') ?? leagues[0];

  if (!target) {
    return (
      <View style={s.center}>
        <Text style={s.title}>No leagues yet</Text>
        <Text style={s.text}>Join or create a league to get started.</Text>
        <TouchableOpacity style={s.btn} onPress={() => router.replace('/(app)/league')}>
          <Text style={s.btnText}>Go to Leagues</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <LeagueEventScreen leagueIdProp={target.id} />;
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  text: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  btn: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
