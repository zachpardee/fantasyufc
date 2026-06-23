import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../src/api/client';

function fmtOutcome(outcome: string): string {
  const map: Record<string, string> = {
    ko_tko: 'KO/TKO',
    submission: 'SUB',
    decision_unanimous: 'DEC (U)',
    decision_split: 'DEC (S)',
    decision_majority: 'DEC (M)',
    draw: 'DRAW',
    no_contest: 'NC',
    disqualification: 'DQ',
  };
  return map[outcome] ?? outcome;
}

export default function FighterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: fighter, isLoading } = useQuery<any>({
    queryKey: ['fighter', id],
    queryFn: () => apiClient.get(`/fighters/${id}`),
  });

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ['fighter-history', id],
    queryFn: () => apiClient.get(`/fighters/${id}/history`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );
  }

  if (!fighter) {
    return (
      <View style={s.center}>
        <Text style={s.empty}>Fighter not found</Text>
      </View>
    );
  }

  const record = fighter.record ?? {};

  return (
    <ScrollView style={s.container}>
      {/* Hero */}
      <View style={s.hero}>
        {fighter.imageUrl ? (
          <Image source={{ uri: fighter.imageUrl }} style={s.heroImage} resizeMode="cover" />
        ) : (
          <View style={s.heroPlaceholder} />
        )}
        <View style={s.heroOverlay}>
          {fighter.isChampion && (
            <View style={s.champBadge}>
              <Text style={s.champBadgeText}>CHAMPION</Text>
            </View>
          )}
          {!fighter.isChampion && fighter.ranking && (
            <View style={s.rankBadge}>
              <Text style={s.rankBadgeText}>#{fighter.ranking}</Text>
            </View>
          )}
          <Text style={s.heroName}>
            {fighter.firstName} {fighter.lastName}
          </Text>
          {fighter.nickname && <Text style={s.heroNickname}>"{fighter.nickname}"</Text>}
          <Text style={s.heroWeightClass}>{fighter.weightClassName}</Text>
        </View>
      </View>

      {/* Record row */}
      <View style={s.recordRow}>
        <StatBox label="Wins" value={record.wins ?? 0} color="#4caf50" />
        <View style={s.divider} />
        <StatBox label="Losses" value={record.losses ?? 0} color="#ff5252" />
        <View style={s.divider} />
        <StatBox label="Draws" value={record.draws ?? 0} color="#888" />
        {record.nc > 0 && (
          <>
            <View style={s.divider} />
            <StatBox label="NC" value={record.nc} color="#888" />
          </>
        )}
      </View>

      {/* Stats */}
      <View style={s.statsGrid}>
        <StatCard
          label="Avg Fantasy Pts"
          value={fighter.averageFantasyPoints?.toFixed(1) ?? '--'}
        />
        <StatCard label="KO/TKO Wins" value={fighter.koTkoWins ?? 0} />
        <StatCard label="Sub Wins" value={fighter.submissionWins ?? 0} />
        {fighter.nationality && <StatCard label="Country" value={fighter.nationality} />}
      </View>

      {/* Fight history */}
      {history.length > 0 && (
        <View style={s.historySection}>
          <Text style={s.sectionTitle}>FIGHT HISTORY</Text>
          {history.map((fight: any, i: number) => {
            const isWin = fight.isWin;
            const isDraw = fight.outcome === 'draw' || fight.outcome === 'no_contest';
            const isPending = !fight.outcome;
            const resultColor = isPending
              ? '#555'
              : isDraw
                ? '#ffd700'
                : isWin
                  ? '#4caf50'
                  : '#ff5252';
            const resultLabel = isPending
              ? 'Upcoming'
              : isDraw
                ? fmtOutcome(fight.outcome)
                : isWin
                  ? `W · ${fmtOutcome(fight.outcome)}`
                  : `L · ${fmtOutcome(fight.outcome)}`;
            return (
              <View key={`${fight.fightId}-${i}`} style={s.historyRow}>
                <View style={[s.historyResult, { backgroundColor: resultColor + '22' }]}>
                  <Text style={[s.historyResultText, { color: resultColor }]}>
                    {isPending ? '–' : isDraw ? 'D' : isWin ? 'W' : 'L'}
                  </Text>
                </View>
                <View style={s.historyInfo}>
                  <Text style={s.historyEvent} numberOfLines={1}>
                    {fight.eventName}
                  </Text>
                  <Text style={s.historyOutcome}>{resultLabel}</Text>
                </View>
                <Text style={s.historyDate}>
                  {fight.scheduledAt
                    ? new Date(fight.scheduledAt).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statBoxValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statBoxLabel}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statCardValue}>{value}</Text>
      <Text style={s.statCardLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#666', fontSize: 16 },

  hero: { height: 280, backgroundColor: '#111', position: 'relative' },
  heroImage: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  heroPlaceholder: { width: '100%', height: '100%', backgroundColor: '#1a1a1a' },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 60,
  },
  champBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffd700',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  champBadgeText: { color: '#000', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  rankBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#c8102e',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  rankBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  heroName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textShadowColor: '#000',
    textShadowRadius: 8,
  },
  heroNickname: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowRadius: 6,
  },
  heroWeightClass: {
    color: '#c8102e',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  recordRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statBoxValue: { fontSize: 24, fontWeight: '800', color: '#fff' },
  statBoxLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  divider: { width: 1, backgroundColor: '#1e1e1e', marginVertical: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  statCardValue: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 2 },
  statCardLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  historySection: { padding: 16, paddingTop: 8 },
  sectionTitle: {
    color: '#444',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  historyResult: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyResultText: { fontSize: 13, fontWeight: '800' },
  historyInfo: { flex: 1 },
  historyEvent: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  historyOutcome: { color: '#666', fontSize: 11, marginTop: 2 },
  historyDate: { color: '#444', fontSize: 11 },
});
