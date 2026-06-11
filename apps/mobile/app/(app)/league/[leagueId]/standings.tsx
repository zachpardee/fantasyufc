import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';

interface StandingsEntry {
  team_id: string;
  team_name: string;
  user_id: string;
  wins: number;
  losses: number;
  ties: number;
  streak: number;
  total_points: number;
  waiver_priority: number;
}

export default function StandingsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const { session } = useAuthStore();

  const { data: standings = [], isLoading } = useQuery<StandingsEntry[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/standings`),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  if (!standings.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No standings yet</Text>
        <Text style={styles.emptySubtext}>Standings update after each event</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.rankCell]}>#</Text>
        <Text style={[styles.headerCell, styles.teamCell]}>Team</Text>
        <Text style={styles.headerCell}>W</Text>
        <Text style={styles.headerCell}>L</Text>
        <Text style={styles.headerCell}>T</Text>
        <Text style={styles.headerCell}>PTS</Text>
        <Text style={[styles.headerCell, styles.streakCell]}>STREAK</Text>
      </View>

      {standings.map((entry, index) => {
        const isMe = entry.user_id === session?.user.id;
        const streakStr = formatStreak(entry.streak);
        const streakPositive = entry.streak > 0;

        return (
          <View
            key={entry.team_id}
            style={[styles.row, isMe && styles.myRow, index % 2 === 0 && styles.evenRow]}
          >
            <View style={[styles.cell, styles.rankCell]}>
              {index < 3 ? (
                <Text style={[styles.rank, index === 0 && styles.gold, index === 1 && styles.silver, index === 2 && styles.bronze]}>
                  {index === 0 ? '1st' : index === 1 ? '2nd' : '3rd'}
                </Text>
              ) : (
                <Text style={styles.rankNum}>{index + 1}</Text>
              )}
            </View>

            <View style={[styles.cell, styles.teamCell]}>
              <Text style={[styles.teamName, isMe && styles.myTeamName]} numberOfLines={1}>
                {entry.team_name}
              </Text>
              {isMe && <Text style={styles.youBadge}>YOU</Text>}
            </View>

            <Text style={[styles.cell, styles.statCell]}>{entry.wins}</Text>
            <Text style={[styles.cell, styles.statCell]}>{entry.losses}</Text>
            <Text style={[styles.cell, styles.statCell]}>{entry.ties}</Text>
            <Text style={[styles.cell, styles.ptsCell]}>{(entry.total_points ?? 0).toFixed(1)}</Text>
            <Text style={[styles.cell, styles.streakCell, streakPositive ? styles.winStreak : styles.lossStreak]}>
              {streakStr}
            </Text>
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Waiver priority resets each week · Worst record = highest priority
        </Text>
      </View>
    </ScrollView>
  );
}

function formatStreak(streak: number): string {
  if (streak === 0) return '—';
  return streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 32 },
  empty: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtext: { color: '#666', fontSize: 14, textAlign: 'center' },

  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: '#111',
  },
  headerCell: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, minWidth: 32, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  evenRow: { backgroundColor: '#080808' },
  myRow: { backgroundColor: '#1a0a0a', borderLeftWidth: 3, borderLeftColor: '#c8102e' },

  cell: { minWidth: 32, textAlign: 'center' },
  rankCell: { minWidth: 36 },
  teamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakCell: { minWidth: 44 },

  rank: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  rankNum: { color: '#666', fontSize: 13, textAlign: 'center' },
  gold: { color: '#ffd700' },
  silver: { color: '#c0c0c0' },
  bronze: { color: '#cd7f32' },

  teamName: { color: '#ddd', fontSize: 14, fontWeight: '500', flex: 1 },
  myTeamName: { color: '#fff', fontWeight: '700' },
  youBadge: { color: '#c8102e', fontSize: 10, fontWeight: '700' },

  statCell: { color: '#aaa', fontSize: 14 },
  ptsCell: { color: '#fff', fontSize: 14, fontWeight: '600', minWidth: 48 },
  winStreak: { color: '#4caf50', fontSize: 13, fontWeight: '700' },
  lossStreak: { color: '#f44336', fontSize: 13, fontWeight: '700' },

  footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: 8 },
  footerText: { color: '#444', fontSize: 11, textAlign: 'center' },
});
