import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useRealtimeScoring } from '../../../../src/hooks/useRealtimeScoring';

function fmtScore(n: number, isStaking: boolean): string {
  if (isStaking) {
    const abs = Math.abs(n);
    const str = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
    return n < 0 ? `(${str})` : str;
  }
  return n.toFixed(1);
}

export default function MatchupScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: matchup, isLoading } = useQuery<any>({
    queryKey: ['matchup', 'current', leagueId, 'detail'],
    queryFn: async () => {
      const m = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!m) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${m.id}`);
    },
  });

  const eventId = matchup?.eventId;
  const homeTeamId = matchup?.homeTeamId;
  const awayTeamId = matchup?.awayTeamId;
  const isStaking = league?.leagueFormat === 'staking';

  const { data: homePicks } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, eventId, homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}?memberId=${homeTeamId}`),
    enabled: !isStaking && !!eventId && !!homeTeamId,
  });

  const { data: awayPicks } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, eventId, awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}?memberId=${awayTeamId}`),
    enabled: !isStaking && !!eventId && !!awayTeamId,
  });

  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, eventId, homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}/champion?memberId=${homeTeamId}`),
    enabled: !isStaking && !!eventId && !!homeTeamId,
  });

  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, eventId, awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${eventId}/champion?memberId=${awayTeamId}`),
    enabled: !isStaking && !!eventId && !!awayTeamId,
  });

  const { data: homeStaking } = useQuery<any>({
    queryKey: ['matchup-staking-home', leagueId, eventId, homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${eventId}?memberId=${homeTeamId}`),
    enabled: isStaking && !!eventId && !!homeTeamId,
  });

  const { data: awayStaking } = useQuery<any>({
    queryKey: ['matchup-staking-away', leagueId, eventId, awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${eventId}?memberId=${awayTeamId}`),
    enabled: isStaking && !!eventId && !!awayTeamId,
  });

  useRealtimeScoring(matchup?.id);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  if (!matchup) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No upcoming matchup found</Text>
      </View>
    );
  }

  const homeScore: number = +(matchup.homeScore ?? 0);
  const awayScore: number = +(matchup.awayScore ?? 0);
  const homeSeasonPoints: number = +(matchup.homeSeasonPoints ?? 0);
  const awaySeasonPoints: number = +(matchup.awaySeasonPoints ?? 0);
  const isLive = matchup.eventStatus === 'live';

  return (
    <ScrollView style={styles.container}>
      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <View style={styles.team}>
          <Text style={styles.teamName} numberOfLines={1}>{matchup.homeTeamName}</Text>
          <Text style={[styles.totalScore, homeScore > awayScore && styles.winScore]}>
            {fmtScore(homeScore, isStaking)}
          </Text>
          <Text style={styles.seasonPts}>Season: {fmtScore(homeSeasonPoints, isStaking)}</Text>
        </View>
        <View style={styles.vsBlock}>
          <Text style={styles.vs}>VS</Text>
          {isLive && <View style={styles.liveDot} />}
        </View>
        <View style={[styles.team, styles.awayTeam]}>
          <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={1}>{matchup.awayTeamName}</Text>
          <Text style={[styles.totalScore, { textAlign: 'right' }, awayScore > homeScore && styles.winScore]}>
            {fmtScore(awayScore, isStaking)}
          </Text>
          <Text style={[styles.seasonPts, { textAlign: 'right' }]}>Season: {fmtScore(awaySeasonPoints, isStaking)}</Text>
        </View>
      </View>

      {/* Event badge */}
      <View style={styles.eventBadge}>
        <Text style={styles.eventName}>{matchup.eventName}</Text>
        {isLive && <Text style={styles.liveBadge}>LIVE</Text>}
      </View>

      {/* Picks / Bets */}
      {isStaking ? (
        <StakingColumns homeStaking={homeStaking} awayStaking={awayStaking} />
      ) : (
        <PicksColumns
          homePicks={homePicks?.fights ?? []}
          awayPicks={awayPicks?.fights ?? []}
          homeChampion={homeChampion}
          awayChampion={awayChampion}
          locked={homePicks?.locked ?? false}
        />
      )}
    </ScrollView>
  );
}

// ── Pickem columns ────────────────────────────────────────────────────────────

function PicksColumns({ homePicks, awayPicks, homeChampion, awayChampion, locked }: {
  homePicks: any[]; awayPicks: any[];
  homeChampion: any; awayChampion: any;
  locked: boolean;
}) {
  const fights = homePicks.length > 0 ? homePicks : awayPicks;
  if (fights.length === 0) {
    return (
      <View style={styles.emptyPicks}>
        <Text style={styles.emptyPicksText}>
          {locked ? 'No picks for this event' : 'Picks hidden until event starts'}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.columnsHeader}>
        <Text style={styles.columnHeaderText}>{/* home label */}</Text>
        <Text style={styles.columnHeaderText}>{/* away label */}</Text>
      </View>

      {fights.map((fight: any, i: number) => {
        const homePick = homePicks[i];
        const awayPick = awayPicks[i];
        return (
          <FightPickRow key={fight.id} fight={fight} homePick={homePick} awayPick={awayPick} locked={locked} />
        );
      })}

      {(homeChampion || awayChampion) && (
        <View style={styles.champCard}>
          <Text style={styles.champCardLabel}>★ Event Champion</Text>
          <View style={styles.champCardRow}>
            <View style={styles.champSide}>
              <ChampionDisplay champion={homeChampion} />
            </View>
            <Text style={styles.champVs}>vs</Text>
            <View style={[styles.champSide, styles.champSideRight]}>
              <ChampionDisplay champion={awayChampion} align="right" />
            </View>
          </View>
        </View>
      )}
    </>
  );
}

function FightPickRow({ fight, homePick, awayPick, locked }: {
  fight: any; homePick: any; awayPick: any; locked: boolean;
}) {
  return (
    <View style={styles.fightRow}>
      <PickCell pick={homePick} align="left" locked={locked} />
      <View style={styles.fightCenter}>
        <Text style={styles.fightCenterWeight} numberOfLines={1}>{fight.weightClassName}</Text>
        <Text style={styles.fightCenterVs}>vs</Text>
      </View>
      <PickCell pick={awayPick} align="right" locked={locked} />
    </View>
  );
}

function PickCell({ pick, align, locked }: { pick: any; align: 'left' | 'right'; locked: boolean }) {
  if (!pick) return <View style={styles.pickCell} />;

  const pickedId = pick.pickedFighterId;
  if (!pickedId) {
    return (
      <View style={[styles.pickCell, align === 'right' && styles.pickCellRight]}>
        <Text style={styles.noPick}>—</Text>
      </View>
    );
  }

  const isRed = pickedId === pick.redFighterId;
  const name = isRed ? `${pick.redFirstName} ${pick.redLastName}` : `${pick.blueFirstName} ${pick.blueLastName}`;
  const isCorrect = pick.isCorrect;
  const pts = +(pick.pointsEarned ?? 0);

  return (
    <View style={[styles.pickCell, align === 'right' && styles.pickCellRight]}>
      <Text
        style={[styles.pickName, { textAlign: align }, isCorrect === false && styles.pickNameWrong]}
        numberOfLines={2}
      >
        {name}
      </Text>
      {locked && isCorrect === true && <Text style={[styles.pickPts, { textAlign: align }]}>+{pts.toFixed(0)}</Text>}
      {locked && isCorrect === false && <Text style={[styles.pickWrong, { textAlign: align }]}>✗</Text>}
      {locked && isCorrect === null && <Text style={[styles.pickPending, { textAlign: align }]}>–</Text>}
    </View>
  );
}

function ChampionDisplay({ champion, align = 'left' }: { champion: any; align?: 'left' | 'right' }) {
  if (!champion) return <Text style={styles.champNoPick}>—</Text>;
  return (
    <>
      <Text style={[styles.champName, { textAlign: align }]}>
        {champion.firstName} {champion.lastName}
      </Text>
      {champion.pointsEarned > 0
        ? <Text style={[styles.champWon, { textAlign: align }]}>+30 pts</Text>
        : champion.resultWinnerId === null
          ? <Text style={[styles.champPending, { textAlign: align }]}>Pending</Text>
          : <Text style={[styles.champLost, { textAlign: align }]}>✗</Text>}
    </>
  );
}

// ── Staking columns ───────────────────────────────────────────────────────────

function StakingColumns({ homeStaking, awayStaking }: { homeStaking: any; awayStaking: any }) {
  if (!homeStaking && !awayStaking) {
    return (
      <View style={styles.emptyPicks}>
        <Text style={styles.emptyPicksText}>No bet data available</Text>
      </View>
    );
  }

  return (
    <View style={styles.stakingContainer}>
      <StakingSide staking={homeStaking} align="left" />
      <View style={styles.stakingDivider} />
      <StakingSide staking={awayStaking} align="right" />
    </View>
  );
}

function StakingSide({ staking, align }: { staking: any; align: 'left' | 'right' }) {
  const singles: any[] = staking?.singles ?? [];
  const parlays: any[] = staking?.parlays ?? [];

  if (singles.length === 0 && parlays.length === 0) {
    return (
      <View style={styles.stakingSide}>
        <Text style={[styles.noBets, { textAlign: align }]}>No bets</Text>
      </View>
    );
  }

  return (
    <View style={styles.stakingSide}>
      {singles.map((bet: any) => {
        const pl = +(bet.profitLoss ?? 0);
        const isPending = bet.status === 'pending';
        return (
          <View key={bet.id} style={[styles.betRow, align === 'right' && styles.betRowRight]}>
            <Text style={[styles.betFighter, { textAlign: align }]} numberOfLines={1}>
              {bet.fighterFirstName} {bet.fighterLastName}
            </Text>
            <Text style={[styles.betStake, { textAlign: align }]}>${(+(bet.stake ?? 0)).toFixed(0)}</Text>
            {isPending
              ? <Text style={[styles.betPending, { textAlign: align }]}>Pending</Text>
              : <Text style={[styles.betPnl, { color: pl >= 0 ? '#4caf50' : '#ff5252', textAlign: align }]}>
                  {pl >= 0 ? '+' : ''}{pl >= 0 ? '$' : '-$'}{Math.abs(pl).toFixed(0)}
                </Text>
            }
          </View>
        );
      })}
      {parlays.map((parlay: any) => {
        const legs: any[] = parlay.legs ?? [];
        const pl = +(parlay.profitLoss ?? 0);
        const isPending = parlay.status === 'pending';
        return (
          <View key={parlay.id} style={[styles.betRow, align === 'right' && styles.betRowRight]}>
            <Text style={[styles.betFighter, { textAlign: align }]}>{legs.length}-leg parlay</Text>
            <Text style={[styles.betStake, { textAlign: align }]}>${(+(parlay.stake ?? 0)).toFixed(0)}</Text>
            {isPending
              ? <Text style={[styles.betPending, { textAlign: align }]}>Pending</Text>
              : <Text style={[styles.betPnl, { color: pl >= 0 ? '#4caf50' : '#ff5252', textAlign: align }]}>
                  {pl >= 0 ? '+' : ''}{pl >= 0 ? '$' : '-$'}{Math.abs(pl).toFixed(0)}
                </Text>
            }
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#666', fontSize: 16 },

  scoreboard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  team: { flex: 1 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { color: '#888', fontSize: 12, marginBottom: 4 },
  totalScore: { fontSize: 34, fontWeight: '800', color: '#555' },
  winScore: { color: '#fff' },
  seasonPts: { color: '#333', fontSize: 11, marginTop: 4 },
  vsBlock: { alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  vs: { color: '#333', fontWeight: '700', fontSize: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#c8102e' },

  eventBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  eventName: { color: '#555', fontSize: 12, flex: 1 },
  liveBadge: {
    color: '#c8102e', fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
    borderWidth: 1, borderColor: '#c8102e44', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },

  emptyPicks: { padding: 32, alignItems: 'center' },
  emptyPicksText: { color: '#444', fontSize: 13, textAlign: 'center' },

  columnsHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12 },
  columnHeaderText: { flex: 1, color: '#444', fontSize: 10, fontWeight: '700' },

  fightRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  fightCenter: { width: 60, alignItems: 'center', justifyContent: 'center' },
  fightCenterWeight: { color: '#333', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  fightCenterVs: { color: '#222', fontSize: 9, fontWeight: '700' },

  pickCell: { flex: 1, paddingHorizontal: 4 },
  pickCellRight: { alignItems: 'flex-end' },
  noPick: { color: '#2a2a2a', fontSize: 12 },
  pickName: { color: '#bbb', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  pickNameWrong: { color: '#333' },
  pickPts: { color: '#4caf50', fontSize: 11, fontWeight: '700', marginTop: 2 },
  pickWrong: { color: '#ff5252', fontSize: 11, fontWeight: '700', marginTop: 2 },
  pickPending: { color: '#444', fontSize: 11, marginTop: 2 },

  champCard: {
    margin: 12, backgroundColor: '#0d0d00', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: '#2a2200',
  },
  champCardLabel: { color: '#ffd700', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10 },
  champCardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  champSide: { flex: 1 },
  champSideRight: { alignItems: 'flex-end' },
  champVs: { color: '#333', fontSize: 11, fontWeight: '700', paddingHorizontal: 10, marginTop: 2 },
  champName: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  champWon: { color: '#4caf50', fontSize: 12, fontWeight: '700', marginTop: 2 },
  champLost: { color: '#ff5252', fontSize: 12, fontWeight: '700', marginTop: 2 },
  champPending: { color: '#888', fontSize: 11, marginTop: 2 },
  champNoPick: { color: '#333', fontSize: 13 },

  stakingContainer: { flexDirection: 'row', padding: 12, gap: 0 },
  stakingDivider: { width: 1, backgroundColor: '#1a1a1a', marginHorizontal: 8 },
  stakingSide: { flex: 1 },
  noBets: { color: '#333', fontSize: 12, padding: 8 },
  betRow: { marginBottom: 10 },
  betRowRight: { alignItems: 'flex-end' },
  betFighter: { color: '#bbb', fontSize: 12, fontWeight: '600' },
  betStake: { color: '#555', fontSize: 11, marginTop: 1 },
  betPending: { color: '#444', fontSize: 11, marginTop: 1 },
  betPnl: { fontSize: 12, fontWeight: '700', marginTop: 1 },
});
