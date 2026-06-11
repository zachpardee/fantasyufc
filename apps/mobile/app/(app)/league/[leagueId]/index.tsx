import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import type { League, Matchup } from '@fantasy-ufc/shared';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtScore(n: number, isStaking: boolean): string {
  if (isStaking) {
    return n < 0 ? `($${Math.abs(n).toFixed(0)})` : `$${n.toFixed(0)}`;
  }
  return n.toFixed(1);
}

export default function LeagueHomeScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: matchup } = useQuery<Matchup | null>({
    queryKey: ['matchup', 'current', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/current`),
  });

  if (!league) return null;

  const isStaking = (league as any).leagueFormat === 'staking';

  const navItems = [
    { label: 'Matchup', icon: 'VS', route: `/(app)/league/${leagueId}/matchup` },
    { label: 'Standings', icon: '#', route: `/(app)/league/${leagueId}/standings` },
    { label: 'Picks', icon: '★', route: `/(app)/league/${leagueId}/picks` },
    { label: 'Playoffs', icon: '🏆', route: `/(app)/league/${leagueId}/playoffs` },
    { label: 'Schedule', icon: '📅', route: `/(app)/league/${leagueId}/schedule` },
    { label: 'Rules', icon: '📋', route: `/(app)/league/${leagueId}/rules` },
    { label: 'Compare', icon: '👁', route: `/(app)/league/${leagueId}/picks-comparison` },
    { label: 'Manage', icon: '⚙️', route: `/(app)/league/${leagueId}/commissioner` },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.leagueName}>{league.name}</Text>
        <View style={[styles.statusBadge, league.status === 'active' && styles.activeBadge]}>
          <Text style={styles.statusText}>{league.status.toUpperCase()}</Text>
        </View>
      </View>

      {matchup && (
        <View style={styles.matchupPreview}>
          <Text style={styles.matchupLabel}>CURRENT MATCHUP</Text>
          <View style={styles.matchupScores}>
            <View style={styles.teamScore}>
              <Text style={styles.teamName}>{(matchup as any).homeTeamName}</Text>
              <Text style={styles.score}>{fmtScore(matchup.homeScore, isStaking)}</Text>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={[styles.teamScore, styles.awayTeam]}>
              <Text style={styles.teamName}>{(matchup as any).awayTeamName}</Text>
              <Text style={styles.score}>{fmtScore(matchup.awayScore, isStaking)}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.nav}>
        {chunk(navItems, 3).map((row, ri) => (
          <View key={ri} style={styles.navRow}>
            {row.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.navItem}
                onPress={() => router.push(item.route as never)}
              >
                <Text style={styles.navIcon}>{item.icon}</Text>
                <Text style={styles.navLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            {/* Fill empty slots in last row so items don't stretch */}
            {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={[styles.navItem, { opacity: 0 }]} />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>{league.memberCount} / {league.maxTeams} teams</Text>
        <Text style={styles.infoText}>Invite: {league.inviteCode}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leagueName: { fontSize: 22, fontWeight: 'bold', color: '#fff', flex: 1 },
  statusBadge: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  activeBadge: { backgroundColor: '#1a3a1a' },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  matchupPreview: {
    margin: 16, backgroundColor: '#1a1a1a', borderRadius: 12,
    padding: 20, borderWidth: 1, borderColor: '#c8102e33',
  },
  matchupLabel: { fontSize: 11, color: '#c8102e', fontWeight: '700', letterSpacing: 1, marginBottom: 16 },
  matchupScores: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamScore: { flex: 1 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { fontSize: 13, color: '#999', marginBottom: 4 },
  score: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  vs: { color: '#666', fontWeight: '700', paddingHorizontal: 16 },
  nav: { padding: 8, gap: 8 },
  navRow: { flexDirection: 'row', gap: 8 },
  navItem: {
    flex: 1, padding: 12, alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a',
  },
  navIcon: { fontSize: 24, marginBottom: 6 },
  navLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  info: { padding: 24, flexDirection: 'row', justifyContent: 'space-between' },
  infoText: { color: '#555', fontSize: 13 },
});
