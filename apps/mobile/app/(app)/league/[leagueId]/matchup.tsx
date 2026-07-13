import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { Swords } from 'lucide-react-native';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';
import { useRealtimeScoring } from '../../../../src/hooks/useRealtimeScoring';
import { PicksColumns, StakingColumns } from '../../../../src/components/MatchupPickColumns';
import { LeagueNavBar } from '../../../../src/components/LeagueNavBar';
import { useRefresh } from '../../../../src/hooks/useRefresh';

// Scoreboard score size scales down on narrow phones (capped at 34 so it never grows).
const SCREEN_W = Dimensions.get('window').width;
const SCORE_SIZE = SCREEN_W < 350 ? 27 : SCREEN_W < 380 ? 30 : 34;

function fmtScore(n: number, isStaking: boolean): string {
  if (isStaking) {
    const abs = Math.abs(n);
    const str = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
    return n < 0 ? `(${str})` : str;
  }
  return n.toFixed(1);
}

function fmtChip(n: number, isStaking: boolean): string {
  if (isStaking) {
    const str = '$' + Math.abs(n).toFixed(0);
    return n < 0 ? `(${str})` : str;
  }
  return n.toFixed(0);
}

export default function MatchupScreen({ leagueIdProp }: { leagueIdProp?: string }) {
  // ?m=<matchupId> deep-links straight into any matchup (e.g. from league home)
  const params = useLocalSearchParams<{ leagueId: string; m?: string }>();
  const leagueId = leagueIdProp ?? params.leagueId;
  const { session } = useAuthStore();
  const { refreshing, onRefresh } = useRefresh();
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(params.m ?? null);
  useEffect(() => {
    if (params.m) setSelectedMatchupId(params.m);
  }, [params.m]);

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  const { data: allMatchups = [] } = useQuery<any[]>({
    queryKey: ['matchups-all', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups`),
  });

  const { data: seasonEvents = [] } = useQuery<any[]>({
    queryKey: ['season-events', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/season-events`),
  });

  const myMember = members.find((m) => m.userId === session?.user?.id);

  const myMatchupByEvent = new Map<string, any>();
  for (const m of allMatchups) {
    if (m.homeTeamId === myMember?.id || m.awayTeamId === myMember?.id) {
      myMatchupByEvent.set(m.eventId, m);
    }
  }

  // seasonEvents is newest-first from the API.
  // The most recent event the user has a matchup in — the default anchor when nothing is selected.
  const mostRecentMyMatchup = seasonEvents.find((ev) => myMatchupByEvent.has(ev.eventId));
  const mostRecentMyMatchupId = mostRecentMyMatchup
    ? (myMatchupByEvent.get(mostRecentMyMatchup.eventId)?.id ?? null)
    : null;
  // The single current/next event — earliest live or scheduled event (gets the NEXT badge).
  const currentUpcomingEventId =
    [...seasonEvents]
      .reverse()
      .find((ev) => ev.eventStatus === 'live' || ev.eventStatus === 'scheduled')?.eventId ?? null;

  // Default anchor: the live/next event the user is actually picking (so their picks show),
  // falling back to their most recent matchup when the season is over.
  const currentMyMatchupId = currentUpcomingEventId
    ? (myMatchupByEvent.get(currentUpcomingEventId)?.id ?? null)
    : null;
  const defaultMatchupId = currentMyMatchupId ?? mostRecentMyMatchupId;

  // Anchor the displayed matchup on the chosen chip, defaulting to the current/next one.
  const effectiveMatchupId = selectedMatchupId ?? defaultMatchupId;

  const { data: matchup, isLoading } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId, effectiveMatchupId],
    queryFn: async () => {
      if (effectiveMatchupId)
        return apiClient.get(`/leagues/${leagueId}/matchups/${effectiveMatchupId}`);
      const m = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!m) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${m.id}`);
    },
  });

  const eventId = matchup?.eventId;
  const homeTeamId = matchup?.homeTeamId;
  const awayTeamId = matchup?.awayTeamId;
  const isStaking = league?.leagueFormat === 'staking';
  const isLive = matchup?.eventStatus === 'live';

  const liveInterval = isLive ? 30_000 : false;

  const { data: homePicks } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, eventId, homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}?memberId=${homeTeamId}`),
    enabled: !isStaking && !!eventId && !!homeTeamId,
    refetchInterval: liveInterval,
  });

  const { data: awayPicks } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, eventId, awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}?memberId=${awayTeamId}`),
    enabled: !isStaking && !!eventId && !!awayTeamId,
    refetchInterval: liveInterval,
  });

  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, eventId, homeTeamId],
    queryFn: () =>
      apiClient.get(`/leagues/${leagueId}/picks/${eventId}/champion?memberId=${homeTeamId}`),
    enabled: !isStaking && !!eventId && !!homeTeamId,
    refetchInterval: liveInterval,
  });

  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, eventId, awayTeamId],
    queryFn: () =>
      apiClient.get(`/leagues/${leagueId}/picks/${eventId}/champion?memberId=${awayTeamId}`),
    enabled: !isStaking && !!eventId && !!awayTeamId,
    refetchInterval: liveInterval,
  });

  const { data: homeStaking } = useQuery<any>({
    queryKey: ['matchup-staking-home', leagueId, eventId, homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${eventId}?memberId=${homeTeamId}`),
    enabled: isStaking && !!eventId && !!homeTeamId,
    refetchInterval: liveInterval,
  });

  const { data: awayStaking } = useQuery<any>({
    queryKey: ['matchup-staking-away', leagueId, eventId, awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${eventId}?memberId=${awayTeamId}`),
    enabled: isStaking && !!eventId && !!awayTeamId,
    refetchInterval: liveInterval,
  });

  // Staking leagues still need the fight list (without picks) so users can see the card
  const { data: stakingFightCard } = useQuery<any>({
    queryKey: ['staking-fightcard', leagueId, eventId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}`),
    enabled: isStaking && !!eventId,
  });

  useRealtimeScoring(matchup?.id);

  // Always show the logged-in user on the left
  const flip = !!myMember && myMember.id === matchup?.awayTeamId;
  const leftTeamName: string = flip ? matchup?.awayTeamName : matchup?.homeTeamName;
  const rightTeamName: string = flip ? matchup?.homeTeamName : matchup?.awayTeamName;
  const leftScore: number = +((flip ? matchup?.awayScore : matchup?.homeScore) ?? 0);
  const rightScore: number = +((flip ? matchup?.homeScore : matchup?.awayScore) ?? 0);
  const leftSeasonPoints: number = +(
    (flip ? matchup?.awaySeasonPoints : matchup?.homeSeasonPoints) ?? 0
  );
  const rightSeasonPoints: number = +(
    (flip ? matchup?.homeSeasonPoints : matchup?.awaySeasonPoints) ?? 0
  );
  const leftRecord = flip ? matchup?.awayRecord : matchup?.homeRecord;
  const rightRecord = flip ? matchup?.homeRecord : matchup?.awayRecord;
  const leftPicks = flip ? awayPicks : homePicks;
  const rightPicks = flip ? homePicks : awayPicks;
  const leftChampion = flip ? awayChampion : homeChampion;
  const rightChampion = flip ? homeChampion : awayChampion;
  const leftStaking = flip ? awayStaking : homeStaking;
  const rightStaking = flip ? homeStaking : awayStaking;

  // Oldest-first for left→right display (API gives newest-first).
  const stripData = [...seasonEvents].reverse();
  const currentChipIndex = stripData.findIndex((ev) => ev.eventId === currentUpcomingEventId);

  const stripRef = useRef<FlatList<any>>(null);
  useEffect(() => {
    if (currentChipIndex < 0 || !stripRef.current) return;
    const t = setTimeout(() => {
      stripRef.current?.scrollToIndex({
        index: currentChipIndex,
        viewPosition: 0.5,
        animated: false,
      });
    }, 100);
    return () => clearTimeout(t);
  }, [currentChipIndex, seasonEvents.length]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c8102e" />
      }
    >
      {/* Shown in the Matchup tab (no Stack header); the pushed route uses the Stack header instead. */}
      {leagueIdProp && <LeagueNavBar leagueId={leagueId} />}

      {/* Season event strip */}
      {seasonEvents.length > 0 && (
        <View>
          <FlatList
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            data={stripData}
            keyExtractor={(ev) => ev.eventId}
            contentContainerStyle={styles.stripContent}
            style={styles.strip}
            onScrollToIndexFailed={({ averageItemLength, index }) => {
              stripRef.current?.scrollToOffset({
                offset: averageItemLength * index,
                animated: false,
              });
            }}
            renderItem={({ item: ev }) => {
              const myM = myMatchupByEvent.get(ev.eventId);
              const isMeHome = myM?.homeTeamId === myMember?.id;
              const isCompleted = ev.eventStatus === 'completed';
              const isLiveEv = ev.eventStatus === 'live';
              const myScore = myM ? +(isMeHome ? myM.homeScore : myM.awayScore) : null;
              const oppScore = myM ? +(isMeHome ? myM.awayScore : myM.homeScore) : null;
              const oppName = myM ? (isMeHome ? myM.awayTeamName : myM.homeTeamName) : null;
              const isWin = isCompleted && myM?.winnerId && myM.winnerId === myMember?.id;
              const isLoss = isCompleted && myM?.winnerId && myM.winnerId !== myMember?.id;
              // Highlight the selected chip, or the default anchor when nothing is selected.
              const isActive = selectedMatchupId
                ? myM?.id === selectedMatchupId
                : myM?.id === defaultMatchupId;
              // Only the single current/next event gets the NEXT badge + outline.
              const isCurrentEvent = ev.eventId === currentUpcomingEventId;
              const isSemis = ev.eventId === league?.playoffSemisEventId;
              const isFinals = ev.eventId === league?.playoffFinalsEventId;
              const shortName =
                ev.eventName
                  ?.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ')
                  .replace(/^UFC\s+/i, 'UFC ') ?? ev.eventName;
              const dateStr = ev.scheduledAt
                ? new Date(ev.scheduledAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : null;

              return (
                <TouchableOpacity
                  style={[
                    styles.chip,
                    isActive && styles.chipActive,
                    isCurrentEvent && !isActive && styles.chipCurrent,
                    !myM && styles.chipNoMatchup,
                  ]}
                  onPress={() => {
                    if (!myM) return;
                    setSelectedMatchupId(myM.id === defaultMatchupId ? null : myM.id);
                  }}
                >
                  {isLiveEv && <Text style={styles.chipLive}>LIVE</Text>}
                  {isCurrentEvent && !isLiveEv && <Text style={styles.chipNext}>NEXT</Text>}
                  {isFinals && <Text style={styles.chipFinals}>FINALS</Text>}
                  {isSemis && <Text style={styles.chipSemis}>SEMIS</Text>}
                  <Text style={styles.chipEvent} numberOfLines={1}>
                    {shortName}
                  </Text>
                  {dateStr && <Text style={styles.chipDate}>{dateStr}</Text>}
                  {myM ? (
                    isCompleted && myScore !== null ? (
                      <>
                        <Text style={styles.chipOpp} numberOfLines={1}>
                          vs {oppName}
                        </Text>
                        <Text style={styles.chipScore}>
                          {fmtChip(myScore, isStaking)}–{fmtChip(oppScore!, isStaking)}
                        </Text>
                        {(isWin || isLoss) && (
                          <Text
                            style={[styles.chipResult, { color: isWin ? '#4caf50' : '#ff5252' }]}
                          >
                            {isWin ? 'W' : 'L'}
                          </Text>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={styles.chipOpp} numberOfLines={1}>
                          vs {oppName}
                        </Text>
                        <Text style={styles.chipPending}>Upcoming</Text>
                      </>
                    )
                  ) : (
                    <Text style={styles.chipPending}>TBD</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#c8102e" />
        </View>
      ) : !matchup ? (
        <View style={styles.center}>
          <Swords size={32} color="#555" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>No matchup yet</Text>
          <Text style={styles.emptyText}>
            Matchups are generated when the commissioner starts the season.
          </Text>
        </View>
      ) : (
        <>
          {/* Scoreboard */}
          <View style={styles.scoreboard}>
            <View style={styles.team}>
              <Text style={styles.teamName} numberOfLines={1}>
                {leftTeamName}
              </Text>
              <Text style={[styles.totalScore, leftScore > rightScore && styles.winScore]}>
                {fmtScore(leftScore, isStaking)}
              </Text>
              {isStaking && <Text style={styles.scoreUnit}>bankroll</Text>}
              <Text style={styles.seasonPts}>Season: {fmtScore(leftSeasonPoints, isStaking)}</Text>
            </View>
            <View style={styles.vsBlock}>
              <Text style={styles.vs}>VS</Text>
              {isLive && <View style={styles.liveDot} />}
            </View>
            <View style={[styles.team, styles.awayTeam]}>
              <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={1}>
                {rightTeamName}
              </Text>
              <Text
                style={[
                  styles.totalScore,
                  { textAlign: 'right' },
                  rightScore > leftScore && styles.winScore,
                ]}
              >
                {fmtScore(rightScore, isStaking)}
              </Text>
              {isStaking && (
                <Text style={[styles.scoreUnit, { textAlign: 'right' }]}>bankroll</Text>
              )}
              <Text style={[styles.seasonPts, { textAlign: 'right' }]}>
                Season: {fmtScore(rightSeasonPoints, isStaking)}
              </Text>
            </View>
          </View>

          {/* Event badge */}
          <View style={styles.eventBadge}>
            <Text style={styles.eventName}>{matchup.eventName}</Text>
            {isLive && <Text style={styles.liveBadge}>LIVE</Text>}
          </View>

          {/* Record strip */}
          {matchup.homeRecord != null && (
            <View style={styles.recordStrip}>
              <Text style={styles.recordText}>{leftRecord ?? '—'}</Text>
              <Text style={styles.recordLabel}>Season Record</Text>
              <Text style={styles.recordText}>{rightRecord ?? '—'}</Text>
            </View>
          )}

          {/* Picks / Bets — logged-in user on the left */}
          {isStaking ? (
            <>
              <PicksColumns
                homePicks={stakingFightCard?.fights ?? []}
                awayPicks={stakingFightCard?.fights ?? []}
                homeChampion={null}
                awayChampion={null}
                locked={false}
                staking
                highlightMine
                homeSingles={leftStaking?.singles ?? []}
                awaySingles={rightStaking?.singles ?? []}
              />
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>PARLAYS</Text>
              </View>
              <StakingColumns homeStaking={leftStaking} awayStaking={rightStaking} />
            </>
          ) : (
            <PicksColumns
              homePicks={leftPicks?.fights ?? []}
              awayPicks={rightPicks?.fights ?? []}
              homeChampion={leftChampion}
              awayChampion={rightChampion}
              locked={leftPicks?.locked ?? false}
              highlightMine
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { padding: 48, alignItems: 'center' },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { color: '#ccc', fontWeight: '700', fontSize: 16, marginBottom: 6 },
  emptyText: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  strip: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  stripContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    minWidth: 90,
    maxWidth: 130,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  chipActive: { borderColor: '#c8102e', backgroundColor: '#1a0808' },
  chipCurrent: { borderColor: '#444' },
  chipNoMatchup: { opacity: 0.5 },
  chipLive: {
    color: '#c8102e',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chipNext: {
    color: '#ffd700',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chipFinals: {
    color: '#ffd700',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chipSemis: {
    color: '#ff8c42',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chipEvent: { color: '#ddd', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  chipDate: { color: '#444', fontSize: 9, marginTop: 2 },
  chipOpp: { color: '#666', fontSize: 9, marginTop: 3, textAlign: 'center' },
  chipScore: { color: '#aaa', fontSize: 11, fontWeight: '700', marginTop: 1 },
  chipResult: { fontSize: 11, fontWeight: '800', marginTop: 1 },
  chipPending: { color: '#444', fontSize: 9, marginTop: 3 },

  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  team: { flex: 1 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { color: '#888', fontSize: 12, marginBottom: 4 },
  totalScore: { fontSize: SCORE_SIZE, fontWeight: '800', color: '#555' },
  winScore: { color: '#fff' },
  scoreUnit: {
    color: '#555',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  seasonPts: { color: '#333', fontSize: 11, marginTop: 4 },
  vsBlock: { alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  vs: { color: '#333', fontWeight: '700', fontSize: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#c8102e' },

  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  eventName: { color: '#555', fontSize: 12, flex: 1 },
  liveBadge: {
    color: '#c8102e',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: '#c8102e44',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  recordStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    backgroundColor: '#0d0d0d',
  },
  recordText: { color: '#aaa', fontSize: 13, fontWeight: '700' },
  recordLabel: { color: '#333', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  sectionHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  sectionLabel: {
    color: '#c8102e',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
