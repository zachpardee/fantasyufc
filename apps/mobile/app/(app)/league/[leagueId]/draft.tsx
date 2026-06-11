import {
  useEffect, useState, useRef,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useDraftStore } from '../../../../src/store/draft.store';
import { useRealtimeDraft } from '../../../../src/hooks/useRealtimeDraft';
import { useAuthStore } from '../../../../src/store/auth.store';
import type { DraftState } from '@fantasy-ufc/shared';

type Tab = 'fighters' | 'board';

export default function DraftScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const { draftState, setDraftState } = useDraftStore();
  const qc = useQueryClient();
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState(0);
  const [tab, setTab] = useState<Tab>('fighters');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtimeDraft(leagueId);

  const { refetch } = useQuery<DraftState>({
    queryKey: ['draft', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/draft`),
    onSuccess: setDraftState,
  } as any);

  const { data: availableFighters = [], refetch: refetchFighters } = useQuery<any[]>({
    queryKey: ['draft-available', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/draft/available`),
    enabled: !!draftState && draftState.session.status !== 'completed',
  });

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  // Timer
  useEffect(() => {
    if (!draftState?.session.currentPickDeadline || draftState.session.status === 'completed') return;
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor(
        (new Date(draftState.session.currentPickDeadline!).getTime() - Date.now()) / 1000,
      )));
    }, 1000);
    return () => clearInterval(id);
  }, [draftState?.session.currentPickDeadline, draftState?.session.status]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  const pickMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.post(`/leagues/${leagueId}/draft/pick`, { fighterId }),
    onSuccess: () => {
      showToast('Pick submitted!', true);
      qc.invalidateQueries({ queryKey: ['draft', leagueId] });
      qc.invalidateQueries({ queryKey: ['draft-available', leagueId] });
      refetch();
      refetchFighters();
    },
    onError: (err: any) => showToast(err?.error ?? 'Pick failed', false),
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/draft/pause`, {}),
    onSuccess: () => refetch(),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/draft/resume`, {}),
    onSuccess: () => refetch(),
  });

  if (!draftState) {
    return (
      <View style={s.center}>
        <Text style={s.empty}>Draft not started yet</Text>
        <Text style={s.emptySub}>
          {league?.commissionerId === session?.user?.id
            ? 'Start the draft from the league home page once everyone has joined.'
            : 'Waiting for the commissioner to start the draft.'}
        </Text>
      </View>
    );
  }

  const { session: ds, picks, order } = draftState;
  const isCompleted = ds.status === 'completed';
  const isPaused = ds.status === 'paused';

  const isCommissioner =
    session?.user?.id === league?.commissionerId ||
    session?.user?.id === league?.commissionerUserId;

  const myMemberId = members.find((m) => m.userId === session?.user?.id)?.id;
  const isMyTurn = !isCompleted && !isPaused && ds.currentTeamId === myMemberId;
  const currentTeam = order.find((o: any) => o.leagueMemberId === ds.currentTeamId);

  const statusColors: Record<string, string> = {
    active: '#4caf50', paused: '#ffd700', completed: '#888', pending: '#8888ff',
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.roundLabel}>Round {ds.currentRound} / {ds.totalRounds}</Text>
          <Text style={s.pickLabel}>Pick #{ds.currentPick}</Text>
        </View>
        {!isCompleted && (
          <View style={[s.timer, timeLeft <= 10 && !isPaused && s.timerUrgent]}>
            <Text style={s.timerText}>{isPaused ? '⏸' : `${timeLeft}s`}</Text>
          </View>
        )}
        <View style={[s.statusBadge, { borderColor: statusColors[ds.status] ?? '#444' }]}>
          <Text style={[s.statusText, { color: statusColors[ds.status] ?? '#888' }]}>
            {ds.status.toUpperCase()}
          </Text>
        </View>
        {isCommissioner && !isCompleted && (
          isPaused ? (
            <TouchableOpacity style={s.controlBtn} onPress={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <Text style={s.controlBtnText}>Resume</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.controlBtn} onPress={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              <Text style={s.controlBtnText}>Pause</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Toast */}
      {toast && (
        <View style={[s.toast, toast.ok ? s.toastOk : s.toastErr]}>
          <Text style={[s.toastText, { color: toast.ok ? '#4caf50' : '#ff5252' }]}>{toast.msg}</Text>
        </View>
      )}

      {/* Turn banner */}
      {isCompleted ? (
        <View style={s.completeBanner}>
          <Text style={s.completeTitle}>Draft Complete!</Text>
          <Text style={s.completeSub}>All {order.length * ds.totalRounds} picks have been made.</Text>
          <TouchableOpacity style={s.rosterBtn} onPress={() => router.push(`/(app)/league/${leagueId}/roster` as never)}>
            <Text style={s.rosterBtnText}>View My Roster →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[s.turnBanner, isMyTurn && s.turnBannerMine]}>
          <Text style={[s.turnText, isMyTurn && s.turnTextMine]}>
            {isMyTurn ? '🎯 Your pick!' : isPaused ? '⏸ Draft paused' : `On the clock: ${currentTeam?.teamName ?? '...'}`}
          </Text>
        </View>
      )}

      {/* Tab switcher */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'fighters' && s.tabActive]}
          onPress={() => setTab('fighters')}
        >
          <Text style={[s.tabText, tab === 'fighters' && s.tabTextActive]}>
            Available ({availableFighters.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'board' && s.tabActive]}
          onPress={() => setTab('board')}
        >
          <Text style={[s.tabText, tab === 'board' && s.tabTextActive]}>Draft Board</Text>
        </TouchableOpacity>
      </View>

      {tab === 'fighters' ? (
        <FightersList
          fighters={availableFighters}
          isMyTurn={isMyTurn}
          isPending={pickMutation.isPending}
          pendingId={pickMutation.variables as string | undefined}
          onPick={(id) => {
            if (!isMyTurn) return;
            Alert.alert('Confirm Pick', `Draft this fighter?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Draft', onPress: () => pickMutation.mutate(id) },
            ]);
          }}
        />
      ) : (
        <DraftBoard picks={picks} order={order} totalRounds={ds.totalRounds} currentTeamId={ds.currentTeamId} isCompleted={isCompleted} />
      )}
    </View>
  );
}

// ─── Available Fighters List ──────────────────────────────────────────────────

function FightersList({
  fighters, isMyTurn, isPending, pendingId, onPick,
}: {
  fighters: any[];
  isMyTurn: boolean;
  isPending: boolean;
  pendingId: string | undefined;
  onPick: (id: string) => void;
}) {
  if (!fighters.length) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );
  }

  return (
    <FlatList
      data={fighters}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 8 }}
      renderItem={({ item }) => {
        const isPendingThis = pendingId === item.id;
        const canPick = isMyTurn && !isPending;
        return (
          <TouchableOpacity
            style={[
              s.fighterRow,
              canPick && s.fighterRowPickable,
              !isMyTurn && s.fighterRowDisabled,
              isPendingThis && s.fighterRowPending,
            ]}
            onPress={() => canPick && onPick(item.id)}
            disabled={!canPick}
            activeOpacity={canPick ? 0.7 : 1}
          >
            <View style={s.fighterLeft}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={s.fighterPhoto} resizeMode="cover" />
              ) : (
                <View style={s.fighterPhotoPlaceholder}>
                  <Text style={s.fighterInitials}>{item.firstName?.[0]}{item.lastName?.[0]}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  {item.isChampion && <Text style={s.champBadge}>C</Text>}
                  <Text style={s.fighterName} numberOfLines={1}>{item.firstName} {item.lastName}</Text>
                </View>
                {item.weightClassName && <Text style={s.fighterWC}>{item.weightClassName}</Text>}
              </View>
            </View>
            <View style={s.fighterRight}>
              <Text style={s.ranking}>{item.ranking ? `#${item.ranking}` : 'NR'}</Text>
              <Text style={s.avgPts}>{item.averageFantasyPoints?.toFixed(1) ?? '--'} pts</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ─── Draft Board ─────────────────────────────────────────────────────────────

function DraftBoard({
  picks, order, totalRounds, currentTeamId, isCompleted,
}: {
  picks: any[];
  order: any[];
  totalRounds: number;
  currentTeamId: string | null;
  isCompleted: boolean;
}) {
  const rounds = Array.from({ length: totalRounds }, (_, r) =>
    picks.filter((p: any) => p.roundNumber === r + 1),
  );

  return (
    <ScrollView style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ padding: 12 }}>
          {/* Team headers */}
          <View style={s.boardRow}>
            <View style={s.boardRoundCell} />
            {order.map((o: any) => (
              <View
                key={o.leagueMemberId}
                style={[
                  s.boardTeamHeader,
                  !isCompleted && o.leagueMemberId === currentTeamId && s.boardTeamActive,
                ]}
              >
                <Text style={[
                  s.boardTeamText,
                  !isCompleted && o.leagueMemberId === currentTeamId && s.boardTeamTextActive,
                ]} numberOfLines={1}>
                  {o.teamName}
                </Text>
              </View>
            ))}
          </View>

          {/* Rounds */}
          {rounds.map((rPicks, r) => (
            <View key={r} style={[s.boardRow, r % 2 === 0 && s.boardRowEven]}>
              <View style={s.boardRoundCell}>
                <Text style={s.boardRoundLabel}>R{r + 1}</Text>
              </View>
              {order.map((o: any) => {
                const pick = rPicks.find((p: any) => p.leagueMemberId === o.leagueMemberId);
                return (
                  <View key={o.leagueMemberId} style={s.boardPickCell}>
                    {pick?.fighterId ? (
                      <>
                        <Text style={s.boardPickName} numberOfLines={1}>
                          {pick.firstName ? `${pick.firstName[0]}. ${pick.lastName}` : pick.lastName ?? '—'}
                        </Text>
                        {pick.autoPicked && <Text style={s.autoTag}>AUTO</Text>}
                      </>
                    ) : (
                      <Text style={s.boardPickEmpty}>—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 32 },
  empty: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  headerLeft: { flex: 1 },
  roundLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  pickLabel: { color: '#fff', fontSize: 18, fontWeight: '800' },
  timer: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  timerUrgent: { backgroundColor: '#c8102e' },
  timerText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statusBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  controlBtn: { backgroundColor: '#2a2a2a', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#444' },
  controlBtnText: { color: '#ccc', fontSize: 13, fontWeight: '600' },

  toast: { padding: 12, alignItems: 'center', borderBottomWidth: 1 },
  toastOk: { backgroundColor: '#1a2a1a', borderBottomColor: '#4caf5044' },
  toastErr: { backgroundColor: '#2a1a1a', borderBottomColor: '#ff525244' },
  toastText: { fontWeight: '700', fontSize: 14 },

  turnBanner: { backgroundColor: '#141414', borderBottomWidth: 1, borderBottomColor: '#2a2a2a', padding: 12, alignItems: 'center' },
  turnBannerMine: { backgroundColor: '#1a2a0a' },
  turnText: { color: '#888', fontSize: 14, fontWeight: '600' },
  turnTextMine: { color: '#4caf50', fontSize: 15, fontWeight: '700' },

  completeBanner: { backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333', padding: 28, alignItems: 'center' },
  completeTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  completeSub: { color: '#888', fontSize: 14, marginBottom: 16 },
  rosterBtn: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  rosterBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  tabs: { flexDirection: 'row', backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222' },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#c8102e' },
  tabText: { color: '#555', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  fighterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, marginBottom: 5,
    borderWidth: 1, borderColor: '#252525',
  },
  fighterRowPickable: { borderColor: '#c8102e44' },
  fighterRowDisabled: { opacity: 0.45 },
  fighterRowPending: { borderColor: '#4caf50', backgroundColor: '#1a2a1a', opacity: 1 },
  fighterLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  fighterPhoto: { width: 36, height: 46, borderRadius: 5, backgroundColor: '#2a2a2a', flexShrink: 0 },
  fighterPhotoPlaceholder: {
    width: 36, height: 46, borderRadius: 5, backgroundColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  fighterInitials: { color: '#555', fontSize: 10, fontWeight: '700' },
  champBadge: {
    backgroundColor: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: '800',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  fighterName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  fighterWC: { color: '#555', fontSize: 11 },
  fighterRight: { alignItems: 'flex-end' },
  ranking: { color: '#c8102e', fontWeight: '700', fontSize: 12 },
  avgPts: { color: '#666', fontSize: 12, marginTop: 2 },

  boardRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 4 },
  boardRowEven: { backgroundColor: '#080808' },
  boardRoundCell: { width: 32, justifyContent: 'center', alignItems: 'center' },
  boardRoundLabel: { color: '#444', fontSize: 10, fontWeight: '700' },
  boardTeamHeader: {
    width: 100, backgroundColor: '#1a1a1a', borderRadius: 6,
    padding: 6, marginHorizontal: 3, alignItems: 'center',
  },
  boardTeamActive: { backgroundColor: '#1a2a1a' },
  boardTeamText: { color: '#555', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  boardTeamTextActive: { color: '#4caf50' },
  boardPickCell: {
    width: 100, minHeight: 44, backgroundColor: '#1a1a1a',
    borderRadius: 6, padding: 7, marginHorizontal: 3, justifyContent: 'center',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  boardPickName: { color: '#ddd', fontSize: 11, fontWeight: '600' },
  boardPickEmpty: { color: '#333', fontSize: 12, textAlign: 'center' },
  autoTag: { color: '#555', fontSize: 8, fontWeight: '700', marginTop: 3, letterSpacing: 0.5 },
});
