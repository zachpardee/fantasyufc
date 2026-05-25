import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { useIsMobile } from '../hooks/useIsMobile';

const METHOD_LABELS: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB',
  decision_unanimous: 'DEC (U)', decision_split: 'DEC (S)',
  decision_majority: 'DEC (M)', draw: 'DRAW',
  no_contest: 'NC', disqualification: 'DQ',
  decision: 'DEC',
};

export function MatchupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const isMobile = useIsMobile();
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);

  // All matchups in the league (for history list)
  const { data: allMatchups = [] } = useQuery<any[]>({
    queryKey: ['matchups-all', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups`),
  });

  // Current user's league member record
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });
  const myMember = members.find((m) => m.userId === session?.user.id);

  // Matchups the current user participated in, newest first
  const myMatchups = allMatchups.filter(
    (m) => m.homeTeamId === myMember?.id || m.awayTeamId === myMember?.id,
  );

  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId, selectedMatchupId],
    queryFn: async () => {
      if (selectedMatchupId) {
        return apiClient.get(`/leagues/${leagueId}/matchups/${selectedMatchupId}`);
      }
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

  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}/champion?memberId=${matchup!.homeTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.homeTeamId,
  });

  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}/champion?memberId=${matchup!.awayTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.awayTeamId,
  });

  // Live updates only for the current matchup
  useEffect(() => {
    if (!matchup?.id || selectedMatchupId) return;
    const channel = supabase.channel(`matchup:${matchup.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matchups', filter: `id=eq.${matchup.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchup?.id, selectedMatchupId, refetch]);

  const isLive = matchup?.eventStatus === 'live';
  const fights: any[] = homePicks?.fights ?? [];
  const awayPickMap: Record<string, any> = {};
  for (const f of (awayPicks?.fights ?? [])) awayPickMap[f.id] = f;

  const isViewingHistory = !!selectedMatchupId && selectedMatchupId !== myMatchups[0]?.id;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>Matchup</span>
        {isLive && !selectedMatchupId && <span style={styles.liveBadge}>LIVE</span>}
        {isViewingHistory && (
          <button style={styles.currentBtn} onClick={() => setSelectedMatchupId(null)}>
            ← Current
          </button>
        )}
      </nav>

      {/* History strip — shown when user has past matchups */}
      {myMatchups.length > 1 && (
        <div style={styles.historyStrip}>
          {myMatchups.map((m) => {
            const isMeHome = m.homeTeamId === myMember?.id;
            const myScore = +(isMeHome ? m.homeScore : m.awayScore);
            const oppScore = +(isMeHome ? m.awayScore : m.homeScore);
            const oppName = isMeHome ? m.awayTeamName : m.homeTeamName;
            const isWin = m.winnerId === myMember?.id;
            const isLoss = m.winnerId && m.winnerId !== myMember?.id;
            const isActive = selectedMatchupId
              ? m.id === selectedMatchupId
              : m.id === myMatchups[0]?.id;
            const eventShort = m.eventName?.replace(/^UFC\s*/i, '').split(':')[0].trim() ?? m.eventName;

            return (
              <button
                key={m.id}
                style={{ ...styles.historyChip, ...(isActive ? styles.historyChipActive : {}) }}
                onClick={() => setSelectedMatchupId(m.id === myMatchups[0]?.id ? null : m.id)}
              >
                <div style={styles.chipEvent}>{eventShort}</div>
                <div style={styles.chipOpp}>vs {oppName}</div>
                {m.eventStatus === 'completed' || m.winnerId || myScore > 0 ? (
                  <>
                    <div style={styles.chipScore}>{myScore.toFixed(0)}–{oppScore.toFixed(0)}</div>
                    <div style={{
                      ...styles.chipResult,
                      color: isWin ? '#4caf50' : isLoss ? '#ff5252' : '#ffd700',
                    }}>
                      {isWin ? 'W' : isLoss ? 'L' : 'T'}
                    </div>
                  </>
                ) : (
                  <div style={styles.chipPending}>—</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!matchup ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚔️</div>
          <div style={{ color: '#ccc', fontWeight: 700, marginBottom: 6 }}>No matchup yet</div>
          <div style={{ color: '#555', fontSize: 13 }}>Matchups are generated when the season schedule is set. Check back after the commissioner starts the season.</div>
        </div>
      ) : (
        <>
          <div style={styles.eventHeader}>
            <div style={styles.eventName}>{matchup.eventName}</div>
            {(matchup.venue || matchup.location) && (
              <div style={styles.eventLocation}>
                {[matchup.venue, matchup.location].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {/* Scoreboard */}
          <div style={{ ...styles.scoreboard, ...(isMobile ? styles.scoreboardMobile : {}) }}>
            <div style={styles.teamBlock}>
              <div style={styles.teamLabelRow}>
                <div style={styles.teamAvatar}>{matchup.homeTeamName?.charAt(0).toUpperCase()}</div>
                <div style={styles.teamLabel}>{matchup.homeTeamName}</div>
              </div>
              <div style={{
                ...styles.matchupScore,
                color: matchup.winnerId === matchup.homeTeamId ? '#fff' : matchup.winnerId ? '#444' : '#fff',
              }}>{(+matchup.homeScore).toFixed(0)}</div>
              <div style={styles.scoreUnit}>matchup pts</div>
            </div>

            <div style={styles.vsBlock}>
              {matchup.winnerId ? (
                <div style={styles.resultBadge}>
                  {matchup.winnerId === matchup.homeTeamId
                    ? `${matchup.homeTeamName} wins`
                    : `${matchup.awayTeamName} wins`}
                </div>
              ) : (
                <div style={styles.vsText}>VS</div>
              )}
            </div>

            <div style={{ ...styles.teamBlock, alignItems: 'flex-end' }}>
              <div style={{ ...styles.teamLabelRow, flexDirection: 'row-reverse' }}>
                <div style={styles.teamAvatar}>{matchup.awayTeamName?.charAt(0).toUpperCase()}</div>
                <div style={styles.teamLabel}>{matchup.awayTeamName}</div>
              </div>
              <div style={{
                ...styles.matchupScore,
                color: matchup.winnerId === matchup.awayTeamId ? '#fff' : matchup.winnerId ? '#444' : '#fff',
              }}>{(+matchup.awayScore).toFixed(0)}</div>
              <div style={styles.scoreUnit}>matchup pts</div>
            </div>
          </div>

          {/* Picks */}
          {fights.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>PICKS</span>
                {homePicks?.locked && <span style={styles.lockedTag}>LOCKED</span>}
              </div>
              <div style={styles.picksHeaderRow}>
                <div style={styles.pickTeamHeader}>{matchup.homeTeamName}</div>
                <div style={styles.fightInfoHeader}>FIGHT</div>
                <div style={{ ...styles.pickTeamHeader, textAlign: 'right' }}>{matchup.awayTeamName}</div>
              </div>
              {fights.map((fight) => (
                <PickRow key={fight.id} fight={fight} homePick={fight} awayPick={awayPickMap[fight.id]} />
              ))}
              {(homeChampion || awayChampion) && (
                <ChampionPickRow homeChampion={homeChampion} awayChampion={awayChampion} locked={homePicks?.locked} />
              )}
            </div>
          )}

          {/* Score breakdown */}
          <div style={styles.totalsBar}>
            <ScoreBreakdown
              label={matchup.homeTeamName}
              picks={homePicks?.fights ?? []}
              matchupPts={+matchup.homeScore}
              championPts={homeChampion?.pointsEarned ? +homeChampion.pointsEarned : 0}
            />
            <div style={styles.totalsDivider} />
            <ScoreBreakdown
              label={matchup.awayTeamName}
              picks={awayPicks?.fights ?? []}
              matchupPts={+matchup.awayScore}
              championPts={awayChampion?.pointsEarned ? +awayChampion.pointsEarned : 0}
            />
          </div>

          {/* Season breakdown table */}
          <SeasonTable
            allMatchups={allMatchups}
            homeTeamId={matchup.homeTeamId}
            homeTeamName={matchup.homeTeamName}
            awayTeamName={matchup.awayTeamName}
            currentEventId={matchup.eventId}
          />
        </>
      )}
    </div>
  );
}

function ChampionPickRow({ homeChampion, awayChampion, locked }: {
  homeChampion: any; awayChampion: any; locked?: boolean;
}) {
  const renderSide = (champ: any, align: 'left' | 'right') => {
    if (!champ) return <span style={styles.noPick}>—</span>;
    const scored = locked && champ.resultWinnerId !== null;
    const won = scored && champ.pointsEarned > 0;
    return (
      <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
        {champ.imageUrl && (
          <div style={{ width: 36, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#222', opacity: scored && !won ? 0.4 : 1 }}>
            <img src={champ.imageUrl} alt={`${champ.firstName} ${champ.lastName}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
          <div style={{ color: '#ddd', fontSize: 13, fontWeight: 600 }}>{champ.firstName} {champ.lastName}</div>
          {scored
            ? <div style={{ color: won ? '#4caf50' : '#444', fontSize: 11, fontWeight: 700 }}>{won ? '+30 pts' : '✗'}</div>
            : <div style={{ color: '#888', fontSize: 11 }}>Pending</div>
          }
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...styles.pickRow, background: '#0d0d00', borderTop: '2px solid #1e1e00' }}>
      <div style={styles.pickCell}>{renderSide(homeChampion, 'left')}</div>
      <div style={styles.fightInfo}>
        <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>★ EVENT CHAMPION</div>
        <div style={styles.fightWeight}>+30 pts if correct</div>
      </div>
      <div style={{ ...styles.pickCell, alignItems: 'flex-end' }}>{renderSide(awayChampion, 'right')}</div>
    </div>
  );
}

function PickRow({ fight, homePick, awayPick }: { fight: any; homePick: any; awayPick: any }) {
  const resultWinner = fight.resultWinnerId;
  const resultOutcome = fight.resultOutcome;

  return (
    <div style={styles.pickRow}>
      <div style={styles.pickCell}>
        {homePick?.pickedFighterId ? (
          <PickDisplay
            fighterId={homePick.pickedFighterId}
            redFighterId={fight.redFighterId}
            redName={`${fight.redFirstName} ${fight.redLastName}`}
            blueName={`${fight.blueFirstName} ${fight.blueLastName}`}
            redImageUrl={fight.redImageUrl}
            blueImageUrl={fight.blueImageUrl}
            method={homePick.pickedMethod}
            isCorrect={homePick.isCorrect}
            pointsEarned={homePick.pointsEarned}
            align="left"
          />
        ) : <span style={styles.noPick}>—</span>}
      </div>

      <div style={styles.fightInfo}>
        <div style={styles.fightName}>{fight.redLastName} vs {fight.blueLastName}</div>
        <div style={styles.fightWeight}>{fight.weightClassName}</div>
        {resultWinner && (
          <div style={styles.fightResult}>
            {fight.redFighterId === resultWinner
              ? `${fight.redFirstName} ${fight.redLastName}`
              : `${fight.blueFirstName} ${fight.blueLastName}`}
            {' '}· {METHOD_LABELS[resultOutcome] ?? resultOutcome}
          </div>
        )}
      </div>

      <div style={{ ...styles.pickCell, alignItems: 'flex-end' }}>
        {awayPick?.pickedFighterId ? (
          <PickDisplay
            fighterId={awayPick.pickedFighterId}
            redFighterId={fight.redFighterId}
            redName={`${fight.redFirstName} ${fight.redLastName}`}
            blueName={`${fight.blueFirstName} ${fight.blueLastName}`}
            redImageUrl={fight.redImageUrl}
            blueImageUrl={fight.blueImageUrl}
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

function PickDisplay({ fighterId, redFighterId, redName, blueName, redImageUrl, blueImageUrl, method, isCorrect, pointsEarned, align }: {
  fighterId: string; redFighterId: string;
  redName: string; blueName: string;
  redImageUrl?: string; blueImageUrl?: string;
  method?: string;
  isCorrect: boolean | null; pointsEarned: number | null;
  align: 'left' | 'right';
}) {
  const isRed = fighterId === redFighterId;
  const pickedName = isRed ? redName : blueName;
  const imageUrl = isRed ? redImageUrl : blueImageUrl;
  const scored = isCorrect !== null;
  const color = scored ? (isCorrect ? '#4caf50' : '#555') : '#ddd';

  return (
    <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
      {imageUrl && (
        <div style={{ width: 36, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#222', opacity: scored && !isCorrect ? 0.4 : 1 }}>
          <img src={imageUrl} alt={pickedName}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
        <div style={{ color, fontSize: 13, fontWeight: 600 }}>{pickedName}</div>
        {method && <div style={{ color: '#555', fontSize: 11 }}>{METHOD_LABELS[method] ?? method}</div>}
        {scored && (
          <div style={{ color: isCorrect ? '#4caf50' : '#444', fontSize: 11, fontWeight: 700 }}>
            {isCorrect ? `+${(+pointsEarned!).toFixed(0)} pts` : '✗'}
          </div>
        )}
      </div>
    </div>
  );
}

type SeasonRow = {
  eventId: string; eventName: string; scheduledAt: string;
  homeScore: number; awayScore: number;
  isCurrent: boolean;
};

function SeasonTable({ allMatchups, homeTeamId, homeTeamName, awayTeamName, currentEventId }: {
  allMatchups: any[]; homeTeamId: string;
  homeTeamName: string; awayTeamName: string; currentEventId: string;
}) {
  const rows: SeasonRow[] = allMatchups
    .map((m): SeasonRow | null => {
      const homeIsHome = m.homeTeamId === homeTeamId;
      const homeScore = +(homeIsHome ? m.homeScore : m.awayScore);
      const awayScore = +(homeIsHome ? m.awayScore : m.homeScore);
      if (homeScore === 0 && awayScore === 0) return null;
      return {
        eventId: m.eventId,
        eventName: m.eventName as string,
        scheduledAt: m.scheduledAt as string,
        homeScore, awayScore,
        isCurrent: m.eventId === currentEventId,
      };
    })
    .filter((r): r is SeasonRow => r !== null)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  if (rows.length === 0) return null;

  const totalHome = rows.reduce((s, r) => s + r.homeScore, 0);
  const totalAway = rows.reduce((s, r) => s + r.awayScore, 0);

  return (
    <div style={styles.seasonSection}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>SEASON BREAKDOWN</span>
      </div>
      <div style={styles.seasonTable}>
        {/* Header */}
        <div style={styles.seasonHeaderRow}>
          <div style={{ ...styles.seasonEventCell, color: '#444' }}>EVENT</div>
          <div style={styles.seasonScoreCell}>{homeTeamName}</div>
          <div style={styles.seasonScoreCell}>{awayTeamName}</div>
        </div>
        {/* Rows */}
        {rows.map((r) => {
          const short = r.eventName.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ').replace(/^UFC\s+/i, 'UFC ');
          return (
            <div key={r.eventId} style={{ ...styles.seasonRow, ...(r.isCurrent ? styles.seasonRowCurrent : {}) }}>
              <div style={styles.seasonEventCell}>{short}</div>
              <div style={styles.seasonScoreCell}>
                <span style={styles.seasonPts}>{r.homeScore.toFixed(0)}</span>
              </div>
              <div style={styles.seasonScoreCell}>
                <span style={styles.seasonPts}>{r.awayScore.toFixed(0)}</span>
              </div>
            </div>
          );
        })}
        {/* Totals */}
        <div style={styles.seasonTotalRow}>
          <div style={styles.seasonEventCell}>SEASON TOTAL</div>
          <div style={styles.seasonScoreCell}>
            <span style={styles.seasonTotalPts}>{totalHome.toFixed(0)}</span>
          </div>
          <div style={styles.seasonScoreCell}>
            <span style={styles.seasonTotalPts}>{totalAway.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const PICK_METHOD_LABEL: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'Sub', decision: 'Dec',
};

function ScoreBreakdown({ label, picks, matchupPts, championPts }: {
  label: string; picks: any[]; matchupPts: number; championPts: number;
}) {
  const scored = picks.filter((p) => p.isCorrect !== null);
  const correct = picks.filter((p) => p.isCorrect === true);
  const hasScores = scored.length > 0;

  const sweepBonus = correct.length === 6 ? 20 : correct.length === 5 ? 10 : correct.length === 4 ? 5 : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ ...styles.totalsTeam, marginBottom: 10 }}>{label}</div>
      {hasScores ? (
        <>
          {/* Per-pick grid */}
          {picks.map((p) => {
            const isRed = p.pickedFighterId === p.redFighterId;
            const lastName: string = isRed ? p.redLastName : p.blueLastName;
            const earned = +(p.pointsEarned ?? 0);
            const isDecision = ['decision_unanimous', 'decision_split', 'decision_majority'].includes(p.resultOutcome);
            const methodMatch =
              (p.pickedMethod === 'ko_tko'    && p.resultOutcome === 'ko_tko') ||
              (p.pickedMethod === 'submission' && p.resultOutcome === 'submission') ||
              (p.pickedMethod === 'decision'   && isDecision);

            let resultLabel = '';
            if (p.isCorrect === true) {
              resultLabel = methodMatch
                ? `Win + ${PICK_METHOD_LABEL[p.pickedMethod] ?? p.pickedMethod}`
                : 'Win';
            }

            return (
              <div key={p.id ?? lastName} style={styles.bdPickRow}>
                <span style={{ ...styles.bdFighter, color: p.isCorrect ? '#ccc' : p.isCorrect === false ? '#333' : '#666' }}>
                  {lastName}
                </span>
                <span style={{ ...styles.bdResult, color: p.isCorrect ? '#666' : '#2a2a2a' }}>
                  {p.isCorrect === true ? resultLabel : p.isCorrect === false ? '✗' : '—'}
                </span>
                <span style={{ ...styles.bdPts, color: p.isCorrect ? '#4caf50' : '#2a2a2a' }}>
                  {p.isCorrect === true ? `+${earned}` : ''}
                </span>
              </div>
            );
          })}

          {/* Bonus rows */}
          {(sweepBonus > 0 || championPts > 0) && (
            <div style={styles.breakdownDividerRow} />
          )}
          {sweepBonus > 0 && (
            <div style={styles.bdPickRow}>
              <span style={{ ...styles.bdFighter, color: '#888' }}>Sweep bonus</span>
              <span style={{ ...styles.bdResult, color: '#555' }}>{correct.length}/6</span>
              <span style={{ ...styles.bdPts, color: '#4caf50' }}>+{sweepBonus}</span>
            </div>
          )}
          {championPts > 0 && (
            <div style={styles.bdPickRow}>
              <span style={{ ...styles.bdFighter, color: '#ffd700' }}>★ Champion</span>
              <span style={{ ...styles.bdResult, color: '#666' }}>Win</span>
              <span style={{ ...styles.bdPts, color: '#4caf50' }}>+{championPts}</span>
            </div>
          )}

          {/* Total */}
          <div style={{ ...styles.breakdownDividerRow, marginTop: 'auto', paddingTop: 6 }} />
          <div style={{ ...styles.bdPickRow, paddingTop: 6 }}>
            <span style={{ ...styles.bdFighter, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
              Total
            </span>
            <span style={styles.bdResult} />
            <span style={styles.totalsMatchup}>{matchupPts.toFixed(0)}</span>
          </div>
        </>
      ) : (
        <div style={styles.breakdownPending}>Scores update as fights complete</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  navTitle: { color: '#fff', fontWeight: 700, flex: 1 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  currentBtn: { background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#888', fontSize: 12, padding: '4px 10px', cursor: 'pointer' },
  empty: { color: '#888', padding: 40, textAlign: 'center', marginTop: 80 },

  // History strip
  historyStrip: {
    display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 24px',
    background: '#0d0d0d', borderBottom: '1px solid #1a1a1a',
    scrollbarWidth: 'none',
  },
  historyChip: {
    flexShrink: 0, background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 90,
  },
  historyChipActive: { border: '1px solid #c8102e', background: '#1a0808' },
  chipEvent: { color: '#888', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  chipOpp: { color: '#555', fontSize: 10, textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chipScore: { color: '#fff', fontSize: 13, fontWeight: 800 },
  chipResult: { fontSize: 11, fontWeight: 800 },
  chipPending: { color: '#444', fontSize: 13 },

  eventHeader: { background: '#111', borderBottom: '1px solid #1e1e1e', padding: '16px 24px', textAlign: 'center' },
  eventName: { color: '#fff', fontSize: 20, fontWeight: 800, marginBottom: 4 },
  eventLocation: { color: '#555', fontSize: 13 },

  scoreboard: { background: '#111', borderBottom: '1px solid #222', padding: '24px 32px', display: 'flex', alignItems: 'center' },
  scoreboardMobile: { padding: '16px', flexDirection: 'column', gap: 12 },
  teamBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  teamLabelRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  teamAvatar: { width: 32, height: 32, borderRadius: '50%', background: '#1a1a3a', border: '2px solid #5555ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 },
  teamLabel: { color: '#666', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  matchupScore: { fontSize: 52, fontWeight: 800, lineHeight: 1 },
  scoreUnit: { color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  vsBlock: { flex: 1, textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  vsText: { color: '#333', fontWeight: 700, fontSize: 18 },
  resultBadge: { color: '#ffd700', fontSize: 11, fontWeight: 700, textAlign: 'center' },

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

  seasonSection: { padding: '0 24px 16px' },
  seasonTable: { border: '1px solid #1e1e1e', borderRadius: 8, overflow: 'hidden' },
  seasonHeaderRow: { display: 'flex', padding: '8px 12px', background: '#0d0d0d', borderBottom: '1px solid #1e1e1e' },
  seasonRow: { display: 'flex', padding: '9px 12px', borderBottom: '1px solid #111' },
  seasonRowCurrent: { background: '#111' },
  seasonTotalRow: { display: 'flex', padding: '10px 12px', background: '#0d0d0d', borderTop: '1px solid #222' },
  seasonEventCell: { flex: 1, color: '#666', fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  seasonScoreCell: { width: 100, display: 'flex', alignItems: 'center', gap: 6 },
  seasonPts: { color: '#ccc', fontSize: 13, fontWeight: 700 },
  seasonBonus: { color: '#4caf50', fontSize: 11, fontWeight: 700 },
  seasonTotalPts: { color: '#ff8c42', fontSize: 15, fontWeight: 800 },
  totalsBar: { background: '#111', borderTop: '1px solid #1e1e1e', padding: '20px 32px', display: 'flex', marginTop: 16 },
  totalsDivider: { width: 1, background: '#222', margin: '0 24px' },
  totalsTeam: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalsLabel: { color: '#444', fontSize: 12 },
  totalsMatchup: { color: '#c8102e', fontSize: 20, fontWeight: 800 },
  totalsSeason: { color: '#ff8c42', fontSize: 20, fontWeight: 800 },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24 },
  breakdownDividerRow: { borderTop: '1px solid #1e1e1e', margin: '4px 0' },
  breakdownPending: { color: '#333', fontSize: 12, fontStyle: 'italic' },
  bdPickRow: { display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'baseline', gap: '0 10px', padding: '3px 0' },
  bdFighter: { fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  bdResult: { fontSize: 11, color: '#555', whiteSpace: 'nowrap' as const },
  bdPts: { fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'right' as const },
};
