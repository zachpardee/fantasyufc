import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../../src/api/client';
import { MemberAvatar } from '../../../../../src/components/MemberAvatar';

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
  const standingRank = standings ? standings.findIndex((m) => m.teamId === memberId || m.id === memberId) + 1 : 0;
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

  const bankroll = +(member.stakingBalance ?? 0);
  const streak = member.streak ?? 0;

  return (
    <ScrollView style={s.container}>
      {/* Profile header */}
      <View style={s.profileHeader}>
        {member.isChampion && (
          <View style={s.champBadgeRow}>
            <Trophy size={13} color="#ffd700" />
            <Text style={s.champBadge}>Season Champion</Text>
          </View>
        )}
        <MemberAvatar name={member.teamName} color={member.avatarColor} avatarUrl={member.avatarUrl} size={80} />
        <Text style={s.teamName}>{member.teamName}</Text>
        <Text style={s.username}>@{member.username}</Text>
        {standingRank > 0 && (
          <Text style={s.rank}>#{standingRank} in standings</Text>
        )}
      </View>

      {/* Stat row */}
      <View style={s.statBar}>
        <View style={s.stat}>
          <Text style={[
            s.statValue,
            isStaking && { color: bankroll >= 0 ? '#4caf50' : '#ff5252' },
          ]}>
            {isStaking ? fmtBankroll(bankroll) : (+(member.totalPoints ?? 0)).toFixed(1)}
          </Text>
          <Text style={s.statLabel}>{isStaking ? 'Bankroll' : 'Season Pts'}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.stat}>
          <Text style={s.statValue}>
            {member.wins}-{member.losses}{member.ties > 0 ? `-${member.ties}` : ''}
          </Text>
          <Text style={s.statLabel}>Record</Text>
        </View>
        {streak !== 0 && (
          <>
            <View style={s.divider} />
            <View style={s.stat}>
              <Text style={[s.statValue, { color: streak > 0 ? '#4caf50' : '#ff5252' }]}>
                {streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`}
              </Text>
              <Text style={s.statLabel}>Streak</Text>
            </View>
          </>
        )}
      </View>

      {/* Info rows */}
      <View style={s.infoSection}>
        {isStaking && member.weeklyBudget != null && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Weekly Budget</Text>
            <Text style={s.infoValue}>${member.weeklyBudget}</Text>
          </View>
        )}
        {!isStaking && member.pointsFor != null && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Points For</Text>
            <Text style={s.infoValue}>{(+member.pointsFor).toFixed(1)}</Text>
          </View>
        )}
        {!isStaking && member.pointsAgainst != null && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Points Against</Text>
            <Text style={s.infoValue}>{(+member.pointsAgainst).toFixed(1)}</Text>
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

  profileHeader: { alignItems: 'center', padding: 28, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 8 },
  champBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  champBadge: { color: '#ffd700', fontSize: 13, fontWeight: '700' },
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  teamName: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 4 },
  username: { color: '#555', fontSize: 14 },
  rank: { color: '#c8102e', fontSize: 13, fontWeight: '600' },

  statBar: {
    backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
    padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
  divider: { width: 1, height: 44, backgroundColor: '#2a2a2a', marginHorizontal: 12 },

  infoSection: { marginTop: 16, marginHorizontal: 16 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111',
  },
  infoLabel: { color: '#888', fontSize: 14 },
  infoValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
