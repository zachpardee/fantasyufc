import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../../src/api/client';

function fmtBankroll(n: number): string {
  const abs = Math.abs(n);
  return (n < 0 ? '-$' : '+$') + abs.toFixed(0);
}

export default function TeamScreen() {
  const { leagueId, memberId } = useLocalSearchParams<{ leagueId: string; memberId: string }>();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: standings, isLoading } = useQuery<any[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/standings`),
  });

  const member = standings?.find((m) => m.teamId === memberId || m.id === memberId);
  const isStaking = league?.leagueFormat === 'staking';

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  if (!member) {
    return (
      <View style={s.center}>
        <Text style={s.emptyText}>Team not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container}>
      {/* Stat bar */}
      <View style={s.statBar}>
        <View style={s.stat}>
          <Text style={s.statLabel}>{isStaking ? 'Season Bankroll' : 'Season Points'}</Text>
          <Text style={[
            s.statValue,
            isStaking && { color: (+(member.stakingBalance ?? 0)) >= 0 ? '#4caf50' : '#ff5252' },
          ]}>
            {isStaking
              ? fmtBankroll(+(member.stakingBalance ?? 0))
              : (+(member.totalPoints ?? 0)).toFixed(1)}
          </Text>
        </View>
        <View style={s.divider} />
        <View style={s.stat}>
          <Text style={s.statLabel}>Record</Text>
          <Text style={s.statValue}>
            {member.wins}-{member.losses}{member.ties > 0 ? `-${member.ties}` : ''}
          </Text>
        </View>
        <View style={s.divider} />
        <View style={s.stat}>
          <Text style={s.statLabel}>Manager</Text>
          <Text style={s.statValue} numberOfLines={1}>@{member.username}</Text>
        </View>
      </View>

      {/* Additional info rows */}
      <View style={s.infoSection}>
        {member.streak !== 0 && member.streak != null && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Current Streak</Text>
            <Text style={[s.infoValue, { color: member.streak > 0 ? '#4caf50' : '#ff5252' }]}>
              {member.streak > 0 ? `W${member.streak}` : `L${Math.abs(member.streak)}`}
            </Text>
          </View>
        )}
        {member.waiverPriority != null && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Waiver Priority</Text>
            <Text style={s.infoValue}>#{member.waiverPriority}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  emptyText: { color: '#666', fontSize: 16 },

  statBar: {
    backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
    padding: 20, flexDirection: 'row', alignItems: 'center',
  },
  stat: { flex: 1, gap: 4 },
  statLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  divider: { width: 1, height: 40, backgroundColor: '#2a2a2a', marginHorizontal: 16 },

  infoSection: { marginTop: 16, marginHorizontal: 16 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111',
  },
  infoLabel: { color: '#888', fontSize: 14 },
  infoValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
