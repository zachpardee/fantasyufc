import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';

type Seed = {
  id: string;
  teamName: string;
  wins: number;
  losses: number;
  totalPoints: number;
  stakingBalance?: number;
};
type PlayoffMatchup = {
  id: string;
  homeTeamId: string;
  homeTeamName: string;
  homeSeed: number;
  homeScore: number;
  homeWins: number;
  homeLosses: number;
  awayTeamId: string;
  awayTeamName: string;
  awaySeed: number;
  awayScore: number;
  awayWins: number;
  awayLosses: number;
  winnerId: string | null;
  eventName: string;
  eventStatus: string;
};
type Bracket = {
  phase: 'none' | 'semis' | 'finals' | 'complete';
  seeds: Seed[];
  semisMatchups: PlayoffMatchup[];
  finalsMatchup: PlayoffMatchup | null;
  isStaking: boolean;
  weeklyBudget: number;
};

function fmtBalance(n: number, budget: number) {
  const profit = n - budget;
  const abs = Math.abs(n);
  const display = '$' + abs.toFixed(0);
  const absP = Math.abs(profit);
  const pnl = (profit >= 0 ? '+' : '−') + '$' + absP.toFixed(0);
  return { display, pnl, positive: profit >= 0 };
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MatchupCard({
  matchup,
  isStaking,
  budget,
}: {
  matchup: PlayoffMatchup;
  isStaking: boolean;
  budget: number;
}) {
  const scored = isStaking
    ? matchup.eventStatus === 'live' || matchup.eventStatus === 'completed'
    : +matchup.homeScore > 0 || +matchup.awayScore > 0;
  const homeWon = matchup.winnerId
    ? matchup.winnerId === matchup.homeTeamId
    : +matchup.homeScore > +matchup.awayScore;
  const awayWon = matchup.winnerId
    ? matchup.winnerId === matchup.awayTeamId
    : +matchup.awayScore > +matchup.homeScore;
  const homeB = isStaking && scored ? fmtBalance(+matchup.homeScore, budget) : null;
  const awayB = isStaking && scored ? fmtBalance(+matchup.awayScore, budget) : null;
  const isLive = matchup.eventStatus === 'live';

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.eventName}>{matchup.eventName}</Text>
        {isLive && (
          <View style={s.livePip}>
            <Text style={s.livePipText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={s.cardBody}>
        <View style={s.teamCol}>
          <Text style={s.seedLabel}>#{matchup.homeSeed}</Text>
          <Text style={[s.teamName, homeWon && scored && s.teamNameWinner]} numberOfLines={1}>
            {matchup.homeTeamName}
          </Text>
          <Text style={s.teamRecord}>
            {matchup.homeWins}–{matchup.homeLosses}
          </Text>
          {scored ? (
            isStaking ? (
              <>
                <Text style={[s.score, homeWon && scored && s.scoreWinner]}>{homeB!.display}</Text>
                <Text style={[s.pnl, { color: homeB!.positive ? '#4caf50' : '#ff5252' }]}>
                  {homeB!.pnl}
                </Text>
              </>
            ) : (
              <Text style={[s.score, homeWon && scored && s.scoreWinner]}>
                {(+matchup.homeScore).toFixed(0)} pts
              </Text>
            )
          ) : (
            <Text style={s.scoreDash}>—</Text>
          )}
        </View>

        <Text style={s.vs}>VS</Text>

        <View style={[s.teamCol, s.teamColRight]}>
          <Text style={[s.seedLabel, { textAlign: 'right' }]}>#{matchup.awaySeed}</Text>
          <Text
            style={[s.teamName, s.teamNameRight, awayWon && scored && s.teamNameWinner]}
            numberOfLines={1}
          >
            {matchup.awayTeamName}
          </Text>
          <Text style={[s.teamRecord, { textAlign: 'right' }]}>
            {matchup.awayWins}–{matchup.awayLosses}
          </Text>
          {scored ? (
            isStaking ? (
              <>
                <Text style={[s.score, s.scoreRight, awayWon && scored && s.scoreWinner]}>
                  {awayB!.display}
                </Text>
                <Text
                  style={[s.pnl, s.scoreRight, { color: awayB!.positive ? '#4caf50' : '#ff5252' }]}
                >
                  {awayB!.pnl}
                </Text>
              </>
            ) : (
              <Text style={[s.score, s.scoreRight, awayWon && scored && s.scoreWinner]}>
                {(+matchup.awayScore).toFixed(0)} pts
              </Text>
            )
          ) : (
            <Text style={[s.scoreDash, s.scoreRight]}>—</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function TBDCard({ label }: { label?: string }) {
  return (
    <View style={[s.card, s.tbdCard]}>
      <Text style={s.tbdText}>{label ?? 'TBD — Awaiting results'}</Text>
    </View>
  );
}

export default function PlayoffsScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const { session } = useAuthStore();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: bracket, isLoading } = useQuery<Bracket>({
    queryKey: ['playoffs-bracket', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/playoffs/bracket`),
  });

  const { data: semisEvent } = useQuery<any>({
    queryKey: ['event', league?.playoffSemisEventId],
    queryFn: () => apiClient.get(`/events/${league!.playoffSemisEventId}`),
    enabled: !!league?.playoffSemisEventId,
  });

  const { data: finalsEvent } = useQuery<any>({
    queryKey: ['event', league?.playoffFinalsEventId],
    queryFn: () => apiClient.get(`/events/${league!.playoffFinalsEventId}`),
    enabled: !!league?.playoffFinalsEventId,
  });

  const advance = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/playoffs/advance`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playoffs-bracket', leagueId] }),
  });

  if (isLoading || !bracket) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );
  }

  const { phase, seeds, semisMatchups, finalsMatchup, isStaking, weeklyBudget } = bracket;
  const isCommissioner = league?.commissionerUserId === session?.user?.id;
  // Match the API guard: manual advance only unlocks once the semis event has completed
  const semisComplete =
    semisMatchups.length > 0 && semisMatchups.every((m) => m.eventStatus === 'completed');

  const phaseLabel =
    phase === 'complete'
      ? 'COMPLETE'
      : phase === 'finals'
        ? 'FINALS'
        : phase === 'semis'
          ? 'SEMIFINALS'
          : null;

  return (
    <ScrollView style={s.container}>
      {phaseLabel && (
        <View style={s.phaseBanner}>
          <Text style={s.phaseBannerText}>{phaseLabel}</Text>
        </View>
      )}

      {/* Schedule info */}
      {league?.seasonEndsAt && (
        <View style={s.scheduleCard}>
          <View style={s.scheduleRow}>
            <Text style={s.scheduleLabel}>Regular season ends</Text>
            <Text style={s.scheduleVal}>{fmtDate(league.seasonEndsAt)}</Text>
          </View>
          <View style={s.scheduleRow}>
            <Text style={s.scheduleLabel}>Semifinals</Text>
            <Text style={s.scheduleVal} numberOfLines={1}>
              {semisEvent ? `${semisEvent.name} · ${fmtDate(semisEvent.scheduledAt)}` : '—'}
            </Text>
          </View>
          <View style={[s.scheduleRow, { borderBottomWidth: 0 }]}>
            <Text style={s.scheduleLabel}>Finals</Text>
            <Text style={s.scheduleVal} numberOfLines={1}>
              {finalsEvent ? `${finalsEvent.name} · ${fmtDate(finalsEvent.scheduledAt)}` : '—'}
            </Text>
          </View>
        </View>
      )}

      {/* Commissioner advance button */}
      {phase === 'semis' &&
        semisMatchups.length >= 2 &&
        (!semisComplete ? (
          <View style={s.advanceCard}>
            <Text style={s.advanceText}>
              Finals will be set automatically after the semifinal event completes.
            </Text>
          </View>
        ) : isCommissioner ? (
          <View style={s.advanceCard}>
            <Text style={s.advanceText}>Semis are final — advance winners to Finals.</Text>
            {advance.isError && (
              <Text style={s.errText}>{(advance.error as any)?.error ?? 'Failed'}</Text>
            )}
            <TouchableOpacity
              style={[s.advanceBtn, advance.isPending && s.btnDisabled]}
              onPress={() => advance.mutate()}
              disabled={advance.isPending}
            >
              <Text style={s.advanceBtnText}>
                {advance.isPending ? 'Advancing...' : 'Advance to Finals'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null)}

      {/* Playoff seeds */}
      {seeds.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>PLAYOFF SEEDS</Text>
          {seeds.map((seed, i) => (
            <View key={seed.id} style={s.seedRow}>
              <Text style={s.seedNum}>#{i + 1}</Text>
              <Text style={s.seedTeam} numberOfLines={1}>
                {seed.teamName}
              </Text>
              <Text style={s.seedRecord}>
                {seed.wins}–{seed.losses}
              </Text>
              <Text style={s.seedPts}>
                {isStaking
                  ? fmtBalance(+(seed.stakingBalance ?? 0), weeklyBudget).pnl
                  : `${(+seed.totalPoints).toFixed(0)} pts`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Preview (no playoffs yet) */}
      {phase === 'none' && seeds.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            Playoffs start automatically after the regular season ends.
          </Text>
        </View>
      )}

      {/* Bracket */}
      {phase !== 'none' && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>BRACKET</Text>
          {semisMatchups.length > 0 && (
            <>
              <Text style={s.roundLabel}>SEMIFINALS</Text>
              {semisMatchups.map((m) => (
                <MatchupCard key={m.id} matchup={m} isStaking={isStaking} budget={weeklyBudget} />
              ))}
              <View style={s.connector}>
                <Text style={s.connectorArrow}>↓</Text>
              </View>
            </>
          )}
          <Text style={s.roundLabel}>FINALS</Text>
          {finalsMatchup ? (
            <MatchupCard matchup={finalsMatchup} isStaking={isStaking} budget={weeklyBudget} />
          ) : (
            <TBDCard label={semisMatchups.length > 0 ? 'Awaiting semifinal results' : undefined} />
          )}
        </View>
      )}

      {/* Preview bracket */}
      {phase === 'none' && seeds.length >= 2 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>PROJECTED BRACKET</Text>
          <Text style={s.previewNote}>
            Based on current standings — updates as regular season progresses
          </Text>
          {seeds.length >= 4 && (
            <>
              <Text style={s.roundLabel}>SEMIFINALS</Text>
              <View style={[s.card, { borderStyle: 'dashed' }]}>
                <View style={s.cardBody}>
                  <View style={s.teamCol}>
                    <Text style={s.seedLabel}>#1</Text>
                    <Text style={s.teamName} numberOfLines={1}>
                      {seeds[0].teamName}
                    </Text>
                  </View>
                  <Text style={s.vs}>vs</Text>
                  <View style={[s.teamCol, s.teamColRight]}>
                    <Text style={[s.seedLabel, { textAlign: 'right' }]}>#4</Text>
                    <Text style={[s.teamName, s.teamNameRight]} numberOfLines={1}>
                      {seeds[3].teamName}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[s.card, { borderStyle: 'dashed', marginTop: 8 }]}>
                <View style={s.cardBody}>
                  <View style={s.teamCol}>
                    <Text style={s.seedLabel}>#2</Text>
                    <Text style={s.teamName} numberOfLines={1}>
                      {seeds[1].teamName}
                    </Text>
                  </View>
                  <Text style={s.vs}>vs</Text>
                  <View style={[s.teamCol, s.teamColRight]}>
                    <Text style={[s.seedLabel, { textAlign: 'right' }]}>#3</Text>
                    <Text style={[s.teamName, s.teamNameRight]} numberOfLines={1}>
                      {seeds[2].teamName}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={s.connector}>
                <Text style={s.connectorArrow}>↓</Text>
              </View>
            </>
          )}
          <Text style={s.roundLabel}>FINALS</Text>
          <TBDCard label="Awaiting semifinal results" />
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },

  phaseBanner: { backgroundColor: '#c8102e', padding: 10, alignItems: 'center' },
  phaseBannerText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  scheduleCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  scheduleLabel: { color: '#666', fontSize: 14 },
  scheduleVal: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },

  advanceCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 16,
    gap: 12,
  },
  advanceText: { color: '#888', fontSize: 14 },
  advanceBtn: { backgroundColor: '#c8102e', borderRadius: 8, padding: 12, alignItems: 'center' },
  advanceBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  errText: { color: '#ff5252', fontSize: 13 },

  section: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  roundLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },

  seedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  seedNum: { color: '#c8102e', fontWeight: '700', fontSize: 14, width: 28 },
  seedTeam: { color: '#fff', fontWeight: '600', fontSize: 14, flex: 1 },
  seedRecord: { color: '#666', fontSize: 13 },
  seedPts: { color: '#888', fontSize: 13 },

  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 16,
    marginBottom: 10,
  },
  tbdCard: { opacity: 0.5 },
  tbdText: { color: '#555', fontSize: 14, fontStyle: 'italic' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  eventName: { color: '#555', fontSize: 12, flex: 1 },
  livePip: {
    backgroundColor: '#c8102e',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  livePipText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  teamCol: { flex: 1, gap: 2 },
  teamColRight: { alignItems: 'flex-end' },
  seedLabel: { color: '#c8102e', fontSize: 10, fontWeight: '700' },
  teamName: { color: '#888', fontSize: 13, fontWeight: '600' },
  teamNameRight: { textAlign: 'right' },
  teamNameWinner: { color: '#fff' },
  teamRecord: { color: '#444', fontSize: 11 },
  score: { color: '#555', fontSize: 22, fontWeight: '700' },
  scoreRight: { textAlign: 'right' },
  scoreWinner: { color: '#fff' },
  scoreDash: { color: '#333', fontSize: 22, fontWeight: '700' },
  pnl: { fontSize: 11, fontWeight: '700' },
  vs: { color: '#2a2a2a', fontSize: 11, fontWeight: '700', paddingTop: 24 },

  connector: { alignItems: 'center', paddingVertical: 8 },
  connectorArrow: { color: '#444', fontSize: 20 },

  empty: { padding: 48, alignItems: 'center' },
  emptyText: { color: '#555', fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  previewNote: { color: '#444', fontSize: 12, fontStyle: 'italic', marginBottom: 12 },
});
