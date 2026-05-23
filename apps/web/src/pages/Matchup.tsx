import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';

const METHOD_LABELS: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB',
  decision_unanimous: 'DEC (U)', decision_split: 'DEC (S)',
  decision_majority: 'DEC (M)', draw: 'DRAW',
  no_contest: 'NC', disqualification: 'DQ',
  decision: 'DEC',
};

export function MatchupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId],
    queryFn: async () => {
      const current = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!current) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${current.id}`);
    },
  });

  const { data: homePicks } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}?memberId=${matchup!.homeTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.homeTeamId,
  });

  const { data: awayPicks } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}?memberId=${matchup!.awayTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.awayTeamId,
  });

  const { data: homeRoster = [] } = useQuery<any[]>({
    queryKey: ['roster-member', leagueId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster/${matchup!.homeTeamId}`),
    enabled: !!matchup?.homeTeamId,
  });

  const { data: awayRoster = [] } = useQuery<any[]>({
    queryKey: ['roster-member', leagueId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster/${matchup!.awayTeamId}`),
    enabled: !!matchup?.awayTeamId,
  });

  useEffect(() => {
    if (!matchup?.id) return;
    const channel = supabase.channel(`matchup:${matchup.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matchup_scores', filter: `matchup_id=eq.${matchup.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchup?.id, refetch]);

  if (!matchup) {
    return (
      <div style={styles.page}>
        <nav style={styles.nav}>
          <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        </nav>
        <div style={styles.empty}>No matchup scheduled for the current event.</div>
      </div>
    );
  }

  const isLive = matchup.eventStatus === 'live';
  const fights: any[] = homePicks?.fights ?? [];

  // Build lookup: fightId → { home pick, away pick }
  const awayPickMap: Record<string, any> = {};
  for (const f of (awayPicks?.fights ?? [])) awayPickMap[f.id] = f;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>Matchup</span>
        {isLive && <span style={styles.liveBadge}>LIVE</span>}
      </nav>

      <div style={styles.eventHeader}>
        <div style={styles.eventName}>{matchup.eventName}</div>
        {(matchup.venue || matchup.location) && (
          <div style={styles.eventLocation}>
            {[matchup.venue, matchup.location].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <div style={styles.scoreboard}>
        <div style={styles.teamBlock}>
          <div style={styles.teamLabelRow}>
            <div style={styles.teamAvatar}>{matchup.homeTeamName?.charAt(0).toUpperCase()}</div>
            <div style={styles.teamLabel}>{matchup.homeTeamName}</div>
          </div>
          <div style={styles.matchupScore}>{(+matchup.homeScore).toFixed(0)}</div>
          <div style={styles.scoreUnit}>matchup pts</div>
        </div>
        <div style={styles.vsBlock}>VS</div>
        <div style={{ ...styles.teamBlock, alignItems: 'flex-end' }}>
          <div style={{ ...styles.teamLabelRow, flexDirection: 'row-reverse' }}>
            <div style={styles.teamAvatar}>{matchup.awayTeamName?.charAt(0).toUpperCase()}</div>
            <div style={styles.teamLabel}>{matchup.awayTeamName}</div>
          </div>
          <div style={styles.matchupScore}>{(+matchup.awayScore).toFixed(0)}</div>
          <div style={styles.scoreUnit}>matchup pts</div>
        </div>
      </div>

      {/* Picks section */}
      {fights.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>PICKS</span>
            {homePicks?.locked && <span style={styles.lockedTag}>LOCKED</span>}
          </div>

          {/* Column headers */}
          <div style={styles.picksHeaderRow}>
            <div style={styles.pickTeamHeader}>{matchup.homeTeamName}</div>
            <div style={styles.fightInfoHeader}>FIGHT</div>
            <div style={{ ...styles.pickTeamHeader, textAlign: 'right' }}>{matchup.awayTeamName}</div>
          </div>

          {fights.map((fight) => {
            const awayFight = awayPickMap[fight.id];
            return (
              <PickRow
                key={fight.id}
                fight={fight}
                homePick={fight}
                awayPick={awayFight}
              />
            );
          })}
        </div>
      )}

      {/* Rosters */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>ROSTERS</span>
        </div>
        <div style={styles.rosterGrid}>
          <RosterColumn label={matchup.homeTeamName} fighters={homeRoster} align="left" />
          <div style={styles.rosterDivider} />
          <RosterColumn label={matchup.awayTeamName} fighters={awayRoster} align="right" />
        </div>
      </div>

      {/* Score breakdown + totals */}
      <div style={styles.totalsBar}>
        <ScoreBreakdown
          label={matchup.homeTeamName}
          picks={homePicks?.fights ?? []}
          matchupPts={+matchup.homeScore}
          seasonPts={+(matchup.homeSeasonPoints ?? 0)}
          isFinalized={!!matchup.winnerId || matchup.eventStatus === 'completed'}
          align="left"
        />
        <div style={styles.totalsDivider} />
        <ScoreBreakdown
          label={matchup.awayTeamName}
          picks={awayPicks?.fights ?? []}
          matchupPts={+matchup.awayScore}
          seasonPts={+(matchup.awaySeasonPoints ?? 0)}
          isFinalized={!!matchup.winnerId || matchup.eventStatus === 'completed'}
          align="right"
        />
      </div>
    </div>
  );
}

function PickRow({ fight, homePick, awayPick }: { fight: any; homePick: any; awayPick: any }) {
  const resultWinner = fight.resultWinnerId;
  const resultOutcome = fight.resultOutcome;

  return (
    <div style={styles.pickRow}>
      {/* Home pick */}
      <div style={styles.pickCell}>
        {homePick?.pickedFighterId ? (
          <PickDisplay
            fighterId={homePick.pickedFighterId}
            redFighterId={fight.redFighterId}
            blueFighterId={fight.blueFighterId}
            redName={`${fight.redFirstName} ${fight.redLastName}`}
            blueName={`${fight.blueFirstName} ${fight.blueLastName}`}
            method={homePick.pickedMethod}
            isCorrect={homePick.isCorrect}
            pointsEarned={homePick.pointsEarned}
            align="left"
          />
        ) : <span style={styles.noPick}>—</span>}
      </div>

      {/* Fight info */}
      <div style={styles.fightInfo}>
        <div style={styles.fightName}>
          {fight.redLastName} vs {fight.blueLastName}
        </div>
        <div style={styles.fightWeight}>{fight.weightClassName}</div>
        {resultWinner && (
          <div style={styles.fightResult}>
            {fight.redFighterId === resultWinner ? `${fight.redFirstName} ${fight.redLastName}` : `${fight.blueFirstName} ${fight.blueLastName}`}
            {' '}· {METHOD_LABELS[resultOutcome] ?? resultOutcome}
          </div>
        )}
      </div>

      {/* Away pick */}
      <div style={{ ...styles.pickCell, alignItems: 'flex-end' }}>
        {awayPick?.pickedFighterId ? (
          <PickDisplay
            fighterId={awayPick.pickedFighterId}
            redFighterId={fight.redFighterId}
            blueFighterId={fight.blueFighterId}
            redName={`${fight.redFirstName} ${fight.redLastName}`}
            blueName={`${fight.blueFirstName} ${fight.blueLastName}`}
            method={awayPick.pickedMethod}
            isCorrect={awayPick.isCorrect}
            pointsEarned={awayPick.pointsEarned}
            align="right"
          />
        ) : <span style={styles.noPick}>—</span>}
      </div>
    </div>
  );
}

function PickDisplay({ fighterId, redFighterId, redName, blueName, method, isCorrect, pointsEarned, align }: {
  fighterId: string; redFighterId: string; blueFighterId: string;
  redName: string; blueName: string; method?: string;
  isCorrect: boolean | null; pointsEarned: number | null;
  align: 'left' | 'right';
}) {
  const pickedName = fighterId === redFighterId ? redName : blueName;
  const scored = isCorrect !== null;
  const color = scored ? (isCorrect ? '#4caf50' : '#555') : '#ddd';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
      <div style={{ color, fontSize: 13, fontWeight: 600 }}>{pickedName}</div>
      {method && <div style={{ color: '#555', fontSize: 11 }}>{METHOD_LABELS[method] ?? method}</div>}
      {scored && (
        <div style={{ color: isCorrect ? '#4caf50' : '#444', fontSize: 11, fontWeight: 700 }}>
          {isCorrect ? `+${(+pointsEarned!).toFixed(0)} pts` : '✗'}
        </div>
      )}
    </div>
  );
}

function RosterColumn({ label, fighters, align }: { label: string; fighters: any[]; align: 'left' | 'right' }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...styles.rosterTeamLabel, textAlign: align }}>{label}</div>
      {fighters.map((f) => <FighterRow key={f.id} fighter={f} align={align} />)}
    </div>
  );
}

function FighterRow({ fighter, align }: { fighter: any; align: 'left' | 'right' }) {
  return (
    <div style={{ ...styles.rosterRow, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
          <span style={styles.fighterName}>{fighter.firstName} {fighter.lastName}</span>
          {fighter.isChampion
            ? <span style={styles.champBadge}>C</span>
            : fighter.ranking ? <span style={styles.rankBadge}>#{fighter.ranking}</span>
            : null}
        </div>
        <span style={styles.fighterMeta}>{fighter.weightClassName}</span>
      </div>
    </div>
  );
}

function calcMilestoneBonus(correctCount: number): number {
  return correctCount >= 6 ? 300 : correctCount >= 5 ? 200 : correctCount >= 4 ? 100 : 0;
}

function ScoreBreakdown({ label, picks, matchupPts, seasonPts, isFinalized }: {
  label: string; picks: any[]; matchupPts: number; seasonPts: number;
  isFinalized?: boolean; align?: 'left' | 'right';
}) {
  const scored = picks.filter((p) => p.isCorrect !== null);
  const correct = picks.filter((p) => p.isCorrect === true);
  const correctCount = correct.length;
  const milestone = calcMilestoneBonus(correctCount);
  const totalPickPts = correct.reduce((sum, p) => sum + (+p.pointsEarned), 0);
  const basePts = correctCount * 200;
  const bonusPts = totalPickPts - basePts; // method + underdog bonuses combined
  // Milestone is only added to matchupPts after finalization; subtract only then
  const rosterBonus = Math.round(matchupPts - totalPickPts - (isFinalized ? milestone : 0));
  const hasScores = scored.length > 0;

  const rows = [
    { label: 'Correct picks', pts: basePts },
    ...(bonusPts > 0 ? [{ label: 'Pick bonuses', pts: bonusPts }] : []),
    ...(milestone > 0 ? [{ label: `${correctCount}/6 correct bonus`, pts: milestone }] : []),
    ...(rosterBonus > 0 ? [{ label: 'Drafted fighter wins', pts: rosterBonus }] : []),
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={styles.totalsTeam}>{label}</div>

      {hasScores && (
        <div style={styles.breakdownGrid}>
          {rows.map((r) => (
            <div key={r.label} style={styles.breakdownRow}>
              <span style={styles.breakdownLabel}>{r.label}</span>
              <span style={styles.breakdownVal}>+{r.pts}</span>
            </div>
          ))}
          <div style={styles.breakdownDividerRow} />
          <div style={{ ...styles.breakdownRow, ...styles.breakdownTotalRow }}>
            <span style={styles.breakdownLabel}>Matchup total</span>
            <span style={styles.totalsMatchup}>{matchupPts.toFixed(0)}</span>
          </div>
        </div>
      )}

      {!hasScores && (
        <div style={styles.breakdownPending}>Scores update as fights complete</div>
      )}

      <div style={{ ...styles.breakdownRow, marginTop: 4 }}>
        <span style={styles.totalsLabel}>Season total</span>
        <span style={styles.totalsSeason}>{seasonPts.toFixed(1)}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  navTitle: { color: '#fff', fontWeight: 700, flex: 1 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  empty: { color: '#888', padding: 40, textAlign: 'center', marginTop: 80 },

  eventHeader: { background: '#111', borderBottom: '1px solid #1e1e1e', padding: '16px 24px', textAlign: 'center' },
  eventName: { color: '#fff', fontSize: 20, fontWeight: 800, marginBottom: 4 },
  eventLocation: { color: '#555', fontSize: 13 },

  scoreboard: { background: '#111', borderBottom: '1px solid #222', padding: '24px 32px', display: 'flex', alignItems: 'center' },
  teamBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  teamLabelRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  teamAvatar: { width: 32, height: 32, borderRadius: '50%', background: '#1a1a3a', border: '2px solid #5555ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 },
  teamLabel: { color: '#666', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  matchupScore: { color: '#fff', fontSize: 52, fontWeight: 800, lineHeight: 1 },
  scoreUnit: { color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  vsBlock: { color: '#333', fontWeight: 700, fontSize: 18, padding: '0 24px' },

  section: { padding: '0 24px 8px' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 10px' },
  sectionTitle: { color: '#444', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  lockedTag: { background: '#222', color: '#555', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3 },

  picksHeaderRow: { display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a1a', paddingBottom: 6, marginBottom: 4 },
  pickTeamHeader: { flex: 1, color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' },
  fightInfoHeader: { width: 160, textAlign: 'center', color: '#333', fontSize: 10, fontWeight: 700, letterSpacing: 1 },

  pickRow: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #111' },
  pickCell: { flex: 1, display: 'flex', flexDirection: 'column' },
  noPick: { color: '#333', fontSize: 13 },
  fightInfo: { width: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  fightName: { color: '#555', fontSize: 11, textAlign: 'center' },
  fightWeight: { color: '#333', fontSize: 10, textAlign: 'center' },
  fightResult: { color: '#888', fontSize: 10, textAlign: 'center', marginTop: 2 },

  rosterGrid: { display: 'flex', gap: 0 },
  rosterDivider: { width: 1, background: '#1a1a1a', margin: '0 16px' },
  rosterTeamLabel: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, width: '100%' },
  slotLabel: { color: '#333', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: '6px 0 4px', width: '100%' },
  rosterRow: { display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #0f0f0f' },
  fighterName: { color: '#ccc', fontSize: 13, fontWeight: 600 },
  rankBadge: { color: '#c8102e', fontSize: 10, fontWeight: 700 },
  champBadge: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 800, padding: '1px 4px', borderRadius: 3 },
  fighterMeta: { color: '#444', fontSize: 11 },

  totalsBar: { background: '#111', borderTop: '1px solid #1e1e1e', padding: '20px 32px', display: 'flex', marginTop: 16 },
  totalsDivider: { width: 1, background: '#222', margin: '0 24px' },
  totalsTeam: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalsRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  totalsLabel: { color: '#444', fontSize: 12 },
  totalsMatchup: { color: '#c8102e', fontSize: 20, fontWeight: 800 },
  totalsSeason: { color: '#ff8c42', fontSize: 20, fontWeight: 800 },
  breakdownGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24 },
  breakdownTotalRow: { paddingTop: 6 },
  breakdownLabel: { color: '#555', fontSize: 12 },
  breakdownVal: { color: '#888', fontSize: 13, fontWeight: 600 },
  breakdownDividerRow: { borderTop: '1px solid #1e1e1e', margin: '4px 0' },
  breakdownPending: { color: '#333', fontSize: 12, fontStyle: 'italic' },
};
