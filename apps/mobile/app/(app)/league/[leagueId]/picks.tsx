import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../../../src/api/client';

const METHODS = [
  { value: 'ko_tko', label: 'KO/TKO' },
  { value: 'submission', label: 'SUB' },
  { value: 'decision', label: 'DEC' },
  { value: 'disqualification', label: 'DQ' },
] as const;

const METHOD_LABEL: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB', decision: 'DEC', disqualification: 'DQ',
};

export default function PicksScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();

  const [localPicks, setLocalPicks] = useState<Record<string, string>>({});
  const [localMethods, setLocalMethods] = useState<Record<string, string>>({});
  const [localChampion, setLocalChampion] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const picksInitialized = useRef(false);
  const championInitialized = useRef(false);

  const { data: currentEvent, isLoading: eventLoading } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
  });

  const { data: picksData } = useQuery<any>({
    queryKey: ['picks', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}`),
    enabled: !!currentEvent?.id,
    refetchInterval: (q) => q.state.data?.eventStatus === 'live' ? 30_000 : false,
  });

  const { data: championData } = useQuery<any>({
    queryKey: ['picks-champion', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}/champion`),
    enabled: !!currentEvent?.id,
  });

  useEffect(() => {
    if (!picksData?.fights) return;
    if (!picksInitialized.current) {
      picksInitialized.current = true;
      const picks: Record<string, string> = {};
      const methods: Record<string, string> = {};
      for (const f of picksData.fights) {
        if (f.pickedFighterId) picks[f.id] = f.pickedFighterId;
        if (f.pickedMethod) methods[f.id] = f.pickedMethod;
      }
      setLocalPicks(picks);
      setLocalMethods(methods);
      if (picksData.fights.some((f: any) => f.pickedFighterId)) setShowSummary(true);
    }
  }, [picksData]);

  useEffect(() => {
    setLocalChampion(null);
    championInitialized.current = false;
  }, [currentEvent?.id]);

  useEffect(() => {
    if (championInitialized.current || championData === undefined) return;
    championInitialized.current = true;
    if (championData?.fighterId) setLocalChampion(championData.fighterId);
  }, [championData]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const picks = Object.entries(localPicks)
        .filter(([fightId]) => localMethods[fightId])
        .map(([fightId, pickedFighterId]) => ({
          fightId,
          pickedFighterId,
          pickedMethod: localMethods[fightId],
        }));
      return apiClient.post(`/leagues/${leagueId}/picks/${currentEvent!.id}`, { picks });
    },
    onSuccess: () => {
      setShowSummary(true);
      qc.invalidateQueries({ queryKey: ['picks', leagueId, currentEvent?.id] });
    },
  });

  const championMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.put(`/leagues/${leagueId}/picks/${currentEvent!.id}/champion`, { fighterId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picks-champion', leagueId, currentEvent?.id] }),
  });

  if (eventLoading) return <View style={s.center}><ActivityIndicator color="#c8102e" /></View>;

  if (!currentEvent) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>No Upcoming Event</Text>
        <Text style={s.emptySub}>No scoring event is currently scheduled.</Text>
      </View>
    );
  }

  const fights: any[] = picksData?.fights ?? [];
  const locked: boolean = picksData?.locked ?? false;
  const totalFights = fights.length;
  const totalComplete = fights.filter((f) => localPicks[f.id] && localMethods[f.id]).length;

  const allFighters = fights.flatMap((fight: any) => [
    { id: fight.redFighterId, firstName: fight.redFirstName, lastName: fight.redLastName, fightId: fight.id, corner: 'red' as const },
    { id: fight.blueFighterId, firstName: fight.blueFirstName, lastName: fight.blueLastName, fightId: fight.id, corner: 'blue' as const },
  ]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.eventName}>{currentEvent.name}</Text>
          <Text style={s.eventDate}>
            {new Date(currentEvent.scheduledAt ?? currentEvent.scheduled_at).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </Text>
        </View>
        <View style={s.pickCount}>
          <Text style={[s.pickNum, { color: totalComplete === totalFights && totalFights > 0 ? '#4caf50' : '#c8102e' }]}>
            {totalComplete}
          </Text>
          <Text style={s.pickDen}>/{totalFights}</Text>
        </View>
      </View>

      {locked && (
        <View style={s.lockedBanner}>
          <Text style={s.lockedText}>Locked — event is {picksData?.eventStatus}</Text>
        </View>
      )}

      {showSummary || locked ? (
        <>
          {/* Summary view */}
          {fights.map((fight) => {
            const pickedId = localPicks[fight.id];
            const pickedRed = pickedId === fight.redFighterId;
            const pickedName = pickedId
              ? (pickedRed ? `${fight.redFirstName} ${fight.redLastName}` : `${fight.blueFirstName} ${fight.blueLastName}`)
              : null;
            const method = localMethods[fight.id];
            const isCorrect = fight.isCorrect;

            return (
              <View key={fight.id} style={s.summaryRow}>
                <View style={s.summaryFight}>
                  <Text style={s.summaryFightText}>
                    <Text style={s.redText}>{fight.redLastName}</Text>
                    <Text style={s.vsText}> v </Text>
                    <Text style={s.blueText}>{fight.blueLastName}</Text>
                  </Text>
                  <Text style={s.summaryMeta}>{fight.weightClassName}</Text>
                </View>
                <View style={s.summaryPick}>
                  {pickedName ? (
                    <>
                      <Text style={[s.summaryPickName, { color: pickedRed ? '#e05555' : '#5599dd' }]}>
                        {pickedName}
                      </Text>
                      {method && <Text style={s.summaryMethod}>{METHOD_LABEL[method] ?? method}</Text>}
                    </>
                  ) : (
                    <Text style={s.noPickText}>—</Text>
                  )}
                </View>
                {locked && (
                  <View style={s.summaryResult}>
                    {isCorrect === true && (
                      <Text style={s.correctText}>✓ +{(+fight.pointsEarned).toFixed(0)}</Text>
                    )}
                    {isCorrect === false && <Text style={s.wrongText}>✗</Text>}
                    {isCorrect === null && pickedId && <Text style={s.pendingText}>–</Text>}
                  </View>
                )}
              </View>
            );
          })}

          {/* Champion pick summary */}
          {(championData || localChampion) && (
            <View style={s.champSummaryCard}>
              <Text style={s.champSummaryLabel}>★ Event Champion</Text>
              {championData ? (
                <View style={s.champSummaryRow}>
                  <Text style={s.champSummaryName}>
                    {championData.firstName} {championData.lastName}
                  </Text>
                  {locked && (
                    championData.pointsEarned > 0
                      ? <Text style={s.champCorrectText}>+30 pts</Text>
                      : championData.resultWinnerId === null
                        ? <Text style={s.champPendingText}>Pending</Text>
                        : <Text style={s.champWrongText}>✗ 0 pts</Text>
                  )}
                </View>
              ) : (
                <Text style={s.noPickText}>No pick yet</Text>
              )}
            </View>
          )}

          {!locked && (
            <TouchableOpacity style={s.editBtn} onPress={() => setShowSummary(false)}>
              <Text style={s.editBtnText}>Edit Picks</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          {/* Edit view — fight cards */}
          {fights.map((fight) => (
            <FightCard
              key={fight.id}
              fight={fight}
              picked={localPicks[fight.id]}
              pickedMethod={localMethods[fight.id]}
              locked={locked}
              onPick={(fighterId) => setLocalPicks((p) => ({ ...p, [fight.id]: fighterId }))}
              onMethod={(method) => setLocalMethods((p) => ({ ...p, [fight.id]: method }))}
            />
          ))}

          {/* Event champion picker */}
          {allFighters.length > 0 && (
            <View style={s.champSection}>
              <Text style={s.champTitle}>★ Event Champion</Text>
              <Text style={s.champSub}>Pick one fighter — +30 pts if they win</Text>
              <View style={[s.champGrid, { width: width - 32 }]}>
                {allFighters.map((fighter) => {
                  const isSelected = localChampion === fighter.id;
                  return (
                    <TouchableOpacity
                      key={fighter.id}
                      style={[s.champFighterBtn, isSelected && s.champFighterBtnSelected]}
                      onPress={() => {
                        if (locked) return;
                        const newId = isSelected ? null : fighter.id;
                        setLocalChampion(newId);
                        if (newId) championMutation.mutate(newId);
                      }}
                      disabled={locked}
                    >
                      <Text
                        style={[
                          s.champFighterName,
                          { color: fighter.corner === 'red' ? '#e05555' : '#5599dd' },
                          isSelected && s.champFighterNameSelected,
                        ]}
                        numberOfLines={2}
                      >
                        {fighter.firstName} {fighter.lastName}
                      </Text>
                      {isSelected && <Text style={s.champSelectedTag}>★</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, saveMutation.isPending && s.saveBtnDisabled]}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Text style={s.saveBtnText}>
              {saveMutation.isPending ? 'Saving...' : `Save Picks (${totalComplete}/${totalFights})`}
            </Text>
          </TouchableOpacity>
          {saveMutation.isError && (
            <Text style={s.errorText}>Failed to save — please try again</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function FightCard({ fight, picked, pickedMethod, locked, onPick, onMethod }: {
  fight: any; picked?: string; pickedMethod?: string;
  locked: boolean; onPick: (id: string) => void; onMethod: (m: string) => void;
}) {
  const winnerId = fight.resultWinnerId;
  const isCompleted = fight.status === 'completed' || winnerId != null;

  return (
    <View style={s.fightCard}>
      {fight.isTitleFight && <Text style={s.titleTag}>TITLE FIGHT</Text>}
      <Text style={s.fightMeta}>{fight.weightClassName} · {fight.scheduledRounds}R</Text>

      <View style={s.matchup}>
        <FighterBtn
          name={`${fight.redFirstName} ${fight.redLastName}`}
          corner="red"
          isPicked={picked === fight.redFighterId}
          isWinner={isCompleted && winnerId === fight.redFighterId}
          isLoser={isCompleted && winnerId != null && winnerId !== fight.redFighterId}
          isCorrect={picked === fight.redFighterId ? fight.isCorrect : null}
          locked={locked}
          onPress={() => onPick(fight.redFighterId)}
        />
        <Text style={s.vsText}>VS</Text>
        <FighterBtn
          name={`${fight.blueFirstName} ${fight.blueLastName}`}
          corner="blue"
          isPicked={picked === fight.blueFighterId}
          isWinner={isCompleted && winnerId === fight.blueFighterId}
          isLoser={isCompleted && winnerId != null && winnerId !== fight.blueFighterId}
          isCorrect={picked === fight.blueFighterId ? fight.isCorrect : null}
          locked={locked}
          onPress={() => onPick(fight.blueFighterId)}
        />
      </View>

      {picked && (
        <View style={s.methodRow}>
          {METHODS.map((m) => {
            const isSelected = pickedMethod === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                style={[s.methodBtn, isSelected && s.methodBtnSelected]}
                onPress={() => !locked && onMethod(isSelected ? '' : m.value)}
                disabled={locked}
              >
                <Text style={[s.methodBtnText, isSelected && s.methodBtnTextSelected]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {fight.resultOutcome && (
        <Text style={s.resultOutcome}>{formatOutcome(fight.resultOutcome)} · R{fight.resultEndingRound ?? '?'}</Text>
      )}
    </View>
  );
}

function FighterBtn({ name, corner, isPicked, isWinner, isLoser, isCorrect, locked, onPress }: {
  name: string; corner: 'red' | 'blue';
  isPicked: boolean; isWinner: boolean; isLoser: boolean;
  isCorrect: boolean | null; locked: boolean; onPress: () => void;
}) {
  const borderColor = isPicked
    ? isCorrect === true ? '#4caf50' : isCorrect === false ? '#ff5252' : (corner === 'red' ? '#c8102e' : '#1565c0')
    : isWinner ? '#4caf50'
    : '#2a2a2a';

  return (
    <TouchableOpacity
      style={[
        s.fighterBtn,
        { borderColor, opacity: isLoser ? 0.35 : 1, backgroundColor: isPicked ? '#1a1a2e' : '#141414' },
      ]}
      onPress={onPress}
      disabled={locked}
    >
      <Text
        style={[s.fighterBtnName, { color: corner === 'red' ? '#e05555' : '#5599dd' }]}
        numberOfLines={2}
      >
        {name}
      </Text>
      {isPicked && isCorrect === true && <Text style={s.pickResult}>✓ +{}</Text>}
      {isPicked && isCorrect === false && <Text style={[s.pickResult, { color: '#ff5252' }]}>✗</Text>}
      {isPicked && isCorrect === null && !locked && <Text style={s.pickedTag}>YOUR PICK</Text>}
    </TouchableOpacity>
  );
}

function formatOutcome(outcome: string) {
  const map: Record<string, string> = {
    ko_tko: 'KO/TKO', submission: 'SUB',
    decision_unanimous: 'DEC (U)', decision_split: 'DEC (S)',
    decision_majority: 'DEC (M)', draw: 'DRAW', no_contest: 'NC', disqualification: 'DQ',
  };
  return map[outcome] ?? outcome;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 32 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  headerLeft: { flex: 1 },
  eventName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  eventDate: { color: '#666', fontSize: 12, marginTop: 2 },
  pickCount: { flexDirection: 'row', alignItems: 'baseline' },
  pickNum: { fontSize: 26, fontWeight: '800' },
  pickDen: { color: '#444', fontSize: 16, fontWeight: '700' },
  lockedBanner: { backgroundColor: '#1a1400', padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  lockedText: { color: '#888', fontSize: 13, textAlign: 'center' },
  fightCard: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 10, padding: 14, margin: 12, marginBottom: 0,
  },
  titleTag: { color: '#ffd700', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  fightMeta: { color: '#555', fontSize: 11, marginBottom: 10 },
  matchup: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  vsText: { color: '#333', fontWeight: '700', fontSize: 12, alignSelf: 'center' },
  fighterBtn: {
    flex: 1, borderWidth: 2, borderRadius: 8, padding: 12,
    alignItems: 'center', justifyContent: 'center', minHeight: 60,
  },
  fighterBtnName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pickedTag: { color: '#c8102e', fontSize: 9, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
  pickResult: { color: '#4caf50', fontSize: 11, fontWeight: '700', marginTop: 4 },
  methodRow: { flexDirection: 'row', gap: 6, marginTop: 12, justifyContent: 'center' },
  methodBtn: {
    flex: 1, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 5,
    backgroundColor: '#1a1a1a', alignItems: 'center',
  },
  methodBtnSelected: { borderColor: '#c8102e', backgroundColor: '#1a0a0a' },
  methodBtnText: { color: '#666', fontSize: 11, fontWeight: '700' },
  methodBtnTextSelected: { color: '#c8102e' },
  resultOutcome: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 10 },
  champSection: { margin: 12, marginTop: 16, backgroundColor: '#111', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2000' },
  champTitle: { color: '#ffd700', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  champSub: { color: '#555', fontSize: 11, marginBottom: 12 },
  champGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  champFighterBtn: {
    width: '31%', padding: 8, borderRadius: 8,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  champFighterBtnSelected: { borderColor: '#ffd700', backgroundColor: '#1a1600' },
  champFighterName: { fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  champFighterNameSelected: { color: '#ffd700' },
  champSelectedTag: { color: '#ffd700', fontSize: 10, fontWeight: '800', marginTop: 2 },
  champSummaryCard: {
    margin: 12, marginTop: 8, backgroundColor: '#111',
    borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2000',
  },
  champSummaryLabel: { color: '#ffd700', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  champSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  champSummaryName: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  champCorrectText: { color: '#4caf50', fontWeight: '700', fontSize: 13 },
  champWrongText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
  champPendingText: { color: '#888', fontSize: 12 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  summaryFight: { flex: 2 },
  summaryFightText: { fontSize: 13, fontWeight: '700' },
  redText: { color: '#c8102e' },
  blueText: { color: '#4488cc' },
  summaryMeta: { color: '#444', fontSize: 11, marginTop: 2 },
  summaryPick: { flex: 2, paddingHorizontal: 8 },
  summaryPickName: { fontSize: 13, fontWeight: '700' },
  summaryMethod: { color: '#666', fontSize: 11, marginTop: 2 },
  summaryResult: { flex: 1, alignItems: 'flex-end' },
  correctText: { color: '#4caf50', fontWeight: '700', fontSize: 13 },
  wrongText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
  pendingText: { color: '#555', fontSize: 13 },
  noPickText: { color: '#333', fontSize: 13 },
  editBtn: {
    margin: 16, padding: 14, borderRadius: 8,
    borderWidth: 1, borderColor: '#333', alignItems: 'center',
  },
  editBtnText: { color: '#888', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    margin: 16, backgroundColor: '#c8102e', borderRadius: 8,
    padding: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 16 },
});
