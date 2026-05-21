import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useRealtimeScoring } from '../../../../src/hooks/useRealtimeScoring';
import type { Matchup } from '@fantasy-ufc/shared';

export default function MatchupScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const { data: matchup } = useQuery<(Matchup & { scores: any[] }) | null>({
    queryKey: ['matchup', 'current', leagueId, 'detail'],
    queryFn: async () => {
      const m = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!m) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${m.id}`);
    },
  });

  useRealtimeScoring(matchup?.id);

  if (!matchup) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No upcoming matchup found</Text>
      </View>
    );
  }

  const homeScores = matchup.scores?.filter((s: any) => s.team_id === matchup.homeTeamId) ?? [];
  const awayScores = matchup.scores?.filter((s: any) => s.team_id === matchup.awayTeamId) ?? [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.scoreboard}>
        <View style={styles.team}>
          <Text style={styles.teamName}>{(matchup as any).home_team_name}</Text>
          <Text style={styles.totalScore}>{matchup.homeScore.toFixed(1)}</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={[styles.team, styles.awayTeam]}>
          <Text style={styles.teamName}>{(matchup as any).away_team_name}</Text>
          <Text style={styles.totalScore}>{matchup.awayScore.toFixed(1)}</Text>
        </View>
      </View>

      <View style={styles.eventBadge}>
        <Text style={styles.eventName}>{(matchup as any).event_name}</Text>
        {(matchup as any).event_status === 'live' && (
          <View style={styles.liveDot} />
        )}
      </View>

      <View style={styles.rosters}>
        <View style={styles.rosterColumn}>
          {homeScores.map((score: any) => (
            <View key={score.fighter_id} style={styles.scoreRow}>
              <Text style={styles.fighterName}>{score.first_name} {score.last_name}</Text>
              <Text style={styles.pts}>{score.total_points?.toFixed(1) ?? '--'}</Text>
            </View>
          ))}
        </View>
        <View style={styles.rosterColumn}>
          {awayScores.map((score: any) => (
            <View key={score.fighter_id} style={[styles.scoreRow, styles.awayRow]}>
              <Text style={styles.pts}>{score.total_points?.toFixed(1) ?? '--'}</Text>
              <Text style={styles.fighterName}>{score.first_name} {score.last_name}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#666', fontSize: 16 },
  scoreboard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 24, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333',
  },
  team: { flex: 1 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { color: '#999', fontSize: 13, marginBottom: 4 },
  totalScore: { fontSize: 48, fontWeight: 'bold', color: '#fff' },
  vs: { color: '#555', fontWeight: '700', paddingHorizontal: 16, fontSize: 16 },
  eventBadge: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  eventName: { color: '#888', fontSize: 13, flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#c8102e' },
  rosters: { flexDirection: 'row', padding: 8 },
  rosterColumn: { flex: 1, padding: 4 },
  scoreRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  awayRow: { flexDirection: 'row-reverse' },
  fighterName: { color: '#ddd', fontSize: 13, flex: 1 },
  pts: { color: '#c8102e', fontWeight: '700', fontSize: 15, minWidth: 40, textAlign: 'right' },
});
