import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';

const METHOD_SHORT: Record<string, string> = {
  ko_tko: 'KO',
  submission: 'SUB',
  decision: 'DEC',
  decision_unanimous: 'DEC',
  decision_split: 'DEC',
  decision_majority: 'DEC',
  disqualification: 'DQ',
};

export default function PicksComparisonScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const { session } = useAuthStore();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ['picks-all', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}/all`),
    enabled: !!currentEvent?.id,
    refetchInterval: (query: any) => (query.state.data?.event?.status === 'live' ? 30_000 : false),
  });

  if (!currentEvent) {
    return (
      <View style={s.center}>
        <Text style={s.empty}>No upcoming event scheduled.</Text>
      </View>
    );
  }

  if (isLoading || !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );
  }

  const { event, members, fights, championPicks } = data;
  const isLive = event.status === 'live';
  const isCompleted = event.status === 'completed';
  const isResolved = isLive || isCompleted;
  const isCommissioner =
    session?.user?.id === league?.commissionerId ||
    session?.user?.id === league?.commissionerUserId;

  if (!isCommissioner && !isResolved) {
    return (
      <View style={s.center}>
        <Text style={s.empty}>Pick comparison is only available once the event starts.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.eventName} numberOfLines={1}>
            {event.name}
          </Text>
          {isLive && (
            <View style={s.livePip}>
              <Text style={s.livePipText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={s.eventDate}>
          {new Date(event.scheduledAt).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* Fight-by-fight cards */}
      {fights.map((fight: any, i: number) => {
        const winnerId = fight.resultWinnerId;
        return (
          <View key={fight.id} style={[s.fightCard, i % 2 === 0 ? s.fightCardEven : {}]}>
            {/* Fight header */}
            <View style={s.fightHeader}>
              {fight.isTitleFight && <Text style={s.beltTag}>TITLE</Text>}
              <View style={s.fightNames}>
                <Text style={[s.redName, winnerId === fight.redFighterId && s.winnerName]}>
                  {fight.redLastName}
                </Text>
                <Text style={s.vsText}>vs</Text>
                <Text style={[s.blueName, winnerId === fight.blueFighterId && s.winnerName]}>
                  {fight.blueLastName}
                </Text>
              </View>
              <Text style={s.weightClass}>{fight.weightClassName}</Text>
            </View>

            {/* Member picks */}
            {members.map((m: any) => {
              const pick = fight.picks?.[m.id];
              if (!pick) {
                return (
                  <View key={m.id} style={s.pickRow}>
                    <Text style={s.memberName} numberOfLines={1}>
                      {m.teamName}
                    </Text>
                    <Text style={s.noPick}>No pick</Text>
                  </View>
                );
              }

              const pickedRed = pick.pickedFighterId === fight.redFighterId;
              const method = METHOD_SHORT[pick.pickedMethod] ?? pick.pickedMethod ?? '?';
              const isCorrect = pick.isCorrect === true;
              const isWrong = pick.isCorrect === false;

              return (
                <View
                  key={m.id}
                  style={[
                    s.pickRow,
                    isCorrect && s.pickCorrect,
                    isWrong && s.pickWrong,
                    !isResolved && pickedRed && s.pickRed,
                    !isResolved && !pickedRed && s.pickBlue,
                  ]}
                >
                  <Text style={s.memberName} numberOfLines={1}>
                    {m.teamName}
                  </Text>
                  <View style={s.pickRight}>
                    <Text style={[s.pickedName, pickedRed ? s.redColor : s.blueColor]}>
                      {pickedRed ? fight.redLastName : fight.blueLastName}
                    </Text>
                    <Text style={s.pickedMethod}>{method}</Text>
                    {isCorrect && pick.pointsEarned != null && (
                      <Text style={s.pts}>+{(+pick.pointsEarned).toFixed(0)}</Text>
                    )}
                    {isWrong && <Text style={s.miss}>✗</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Champion picks */}
      {championPicks && Object.keys(championPicks).length > 0 && (
        <View style={[s.fightCard, s.champCard]}>
          <View style={s.fightHeader}>
            <Text style={s.champLabel}>★ Champion Pick</Text>
            <Text style={s.champSub}>+30 pts if they win</Text>
          </View>
          {members.map((m: any) => {
            const cp = championPicks[m.id];
            if (!cp)
              return (
                <View key={m.id} style={s.pickRow}>
                  <Text style={s.memberName} numberOfLines={1}>
                    {m.teamName}
                  </Text>
                  <Text style={s.noPick}>No pick</Text>
                </View>
              );
            const won = (cp.pointsEarned ?? 0) > 0;
            const resolved = isCompleted || (isLive && cp.resultWinnerId !== null);
            return (
              <View
                key={m.id}
                style={[
                  s.pickRow,
                  resolved && won && s.pickCorrect,
                  resolved && !won && s.pickWrong,
                ]}
              >
                <Text style={s.memberName} numberOfLines={1}>
                  {m.teamName}
                </Text>
                <View style={s.pickRight}>
                  <Text style={s.pickedName}>
                    {cp.firstName} {cp.lastName}
                  </Text>
                  {resolved ? (
                    won ? (
                      <Text style={s.pts}>+30</Text>
                    ) : (
                      <Text style={s.miss}>✗</Text>
                    )
                  ) : (
                    <Text style={s.pending}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Totals */}
      {isResolved && (
        <View style={s.totalsCard}>
          <Text style={s.totalsTitle}>EVENT TOTALS</Text>
          {members.map((m: any) => {
            const pickPts = fights.reduce((sum: number, f: any) => {
              const p = f.picks?.[m.id];
              return sum + (p?.pointsEarned ? +p.pointsEarned : 0);
            }, 0);
            const champPts = championPicks?.[m.id]?.pointsEarned
              ? +championPicks[m.id].pointsEarned
              : 0;
            const total = pickPts + champPts;
            const correct = fights.filter((f: any) => f.picks?.[m.id]?.isCorrect === true).length;
            return (
              <View key={m.id} style={s.totalsRow}>
                <Text style={s.totalsTeam} numberOfLines={1}>
                  {m.teamName}
                </Text>
                <Text style={s.totalsCorrect}>
                  {correct}/{fights.length} correct
                </Text>
                <Text style={s.totalsPts}>{total.toFixed(0)} pts</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 32,
  },
  empty: { color: '#555', fontSize: 14, textAlign: 'center' },

  header: {
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    padding: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  eventName: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  livePip: {
    backgroundColor: '#c8102e',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  livePipText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  eventDate: { color: '#666', fontSize: 13 },

  fightCard: { borderBottomWidth: 1, borderBottomColor: '#111' },
  fightCardEven: { backgroundColor: '#080808' },
  champCard: { backgroundColor: '#0d0d00', borderTopWidth: 2, borderTopColor: '#222' },

  fightHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  beltTag: {
    color: '#ffd700',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fightNames: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  redName: { color: '#c8102e', fontSize: 15, fontWeight: '700' },
  blueName: { color: '#4488cc', fontSize: 15, fontWeight: '700' },
  winnerName: { textDecorationLine: 'underline' },
  vsText: { color: '#333', fontSize: 12 },
  weightClass: { color: '#444', fontSize: 11, marginTop: 2 },

  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#111',
  },
  pickCorrect: { backgroundColor: '#0a1a0a' },
  pickWrong: { backgroundColor: '#1a0808', opacity: 0.7 },
  pickRed: { backgroundColor: '#1a0808' },
  pickBlue: { backgroundColor: '#080d1a' },

  memberName: { color: '#888', fontSize: 13, fontWeight: '600', flex: 1 },
  noPick: { color: '#333', fontSize: 14 },
  pickRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickedName: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  redColor: { color: '#e87070' },
  blueColor: { color: '#6699cc' },
  pickedMethod: { color: '#555', fontSize: 12 },
  pts: { color: '#4caf50', fontSize: 13, fontWeight: '700' },
  miss: { color: '#ff5252', fontSize: 14, fontWeight: '700' },
  pending: { color: '#555', fontSize: 12 },

  champLabel: { color: '#ffd700', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  champSub: { color: '#555', fontSize: 11 },

  totalsCard: { backgroundColor: '#111', borderTopWidth: 2, borderTopColor: '#222', padding: 16 },
  totalsTitle: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  totalsTeam: { flex: 1, color: '#aaa', fontSize: 14, fontWeight: '600' },
  totalsCorrect: { color: '#555', fontSize: 12, marginRight: 16 },
  totalsPts: {
    color: '#c8102e',
    fontSize: 20,
    fontWeight: '700',
    minWidth: 64,
    textAlign: 'right',
  },
});
