import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useDraftStore } from '../../../../src/store/draft.store';
import { useRealtimeDraft } from '../../../../src/hooks/useRealtimeDraft';
import { useAuthStore } from '../../../../src/store/auth.store';
import type { DraftState, Fighter } from '@fantasy-ufc/shared';

export default function DraftScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const { draftState, setDraftState } = useDraftStore();
  const [timeLeft, setTimeLeft] = useState(0);

  useRealtimeDraft(leagueId);

  const { data, refetch } = useQuery<DraftState>({
    queryKey: ['draft', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/draft`),
    onSuccess: setDraftState,
  } as any);

  const pickMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.post(`/leagues/${leagueId}/draft/pick`, { fighterId }),
    onError: (err: any) => Alert.alert('Pick failed', err.error ?? 'Unknown error'),
    onSuccess: () => refetch(),
  });

  // Countdown timer
  useEffect(() => {
    if (!draftState?.session.currentPickDeadline) return;
    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(draftState.session.currentPickDeadline!).getTime() - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [draftState?.session.currentPickDeadline]);

  if (!draftState) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Draft not started yet</Text>
      </View>
    );
  }

  const isMyTurn = draftState.session.currentTeamId &&
    draftState.order.find((o) => o.leagueMemberId === draftState.session.currentTeamId)?.leagueMemberId ===
    draftState.order.find((o) => o.leagueMemberId === session?.user.id)?.leagueMemberId;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.roundText}>Round {draftState.session.currentRound}</Text>
          <Text style={styles.pickText}>Pick {draftState.session.currentPick}</Text>
        </View>
        <View style={[styles.timer, timeLeft <= 10 && styles.timerUrgent]}>
          <Text style={styles.timerText}>{timeLeft}s</Text>
        </View>
      </View>

      {isMyTurn && (
        <View style={styles.yourTurn}>
          <Text style={styles.yourTurnText}>YOUR PICK</Text>
        </View>
      )}

      <FlatList
        data={draftState.availableFighters}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.fighterRow}
            onPress={() => isMyTurn && pickMutation.mutate(item.id)}
            disabled={!isMyTurn}
          >
            <View style={styles.fighterInfo}>
              {item.isChampion && <Text style={styles.champion}>C</Text>}
              <Text style={styles.fighterName}>{item.firstName} {item.lastName}</Text>
              {item.nickname && <Text style={styles.nickname}>"{item.nickname}"</Text>}
            </View>
            <View style={styles.fighterStats}>
              <Text style={styles.ranking}>{item.ranking ? `#${item.ranking}` : 'NR'}</Text>
              <Text style={styles.avgPts}>{item.averageFantasyPoints?.toFixed(1) ?? '--'} pts</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#666', fontSize: 16 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333',
  },
  roundText: { color: '#999', fontSize: 12, fontWeight: '600' },
  pickText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  timer: {
    backgroundColor: '#333', width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  timerUrgent: { backgroundColor: '#c8102e' },
  timerText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  yourTurn: { backgroundColor: '#c8102e', padding: 10, alignItems: 'center' },
  yourTurnText: { color: '#fff', fontWeight: '700', letterSpacing: 1 },
  list: { padding: 8 },
  fighterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, marginBottom: 6,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  fighterInfo: { flex: 1 },
  champion: {
    color: '#ffd700', fontWeight: 'bold', fontSize: 10,
    backgroundColor: '#3a3000', paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, alignSelf: 'flex-start', marginBottom: 2,
  },
  fighterName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  nickname: { color: '#777', fontSize: 12, marginTop: 2 },
  fighterStats: { alignItems: 'flex-end' },
  ranking: { color: '#c8102e', fontWeight: '700', fontSize: 13 },
  avgPts: { color: '#666', fontSize: 12 },
});
