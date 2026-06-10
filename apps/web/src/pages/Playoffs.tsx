import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { LoadingScreen } from '../components/LoadingScreen';
import { useIsMobile } from '../hooks/useIsMobile';
import type { League } from '@fantasy-ufc/shared';

type Seed = { id: string; teamName: string; wins: number; losses: number; totalPoints: number; stakingBalance?: number };
type PlayoffMatchup = {
  id: string;
  homeTeamId: string; homeTeamName: string; homeSeed: number; homeScore: number;
  homeWins: number; homeLosses: number;
  awayTeamId: string; awayTeamName: string; awaySeed: number; awayScore: number;
  awayWins: number; awayLosses: number;
  winnerId: string | null; eventName: string; eventStatus: string;
};
type Bracket = {
  phase: 'none' | 'semis' | 'finals' | 'complete';
  seeds: Seed[];
  semisMatchups: PlayoffMatchup[];
  finalsMatchup: PlayoffMatchup | null;
  isStaking: boolean;
  weeklyBudget: number;
};

function fmtPts(n: number) { return n.toFixed(0); }

function fmtBalance(n: number, weeklyBudget: number): { display: string; pnl: string; pnlPositive: boolean } {
  const profit = n - weeklyBudget;
  const abs = Math.abs(n);
  const display = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
  const absProfit = Math.abs(profit);
  const pnlStr = '$' + (absProfit % 1 < 0.005 ? absProfit.toFixed(0) : absProfit.toFixed(2));
  return { display, pnl: (profit >= 0 ? '+' : '−') + pnlStr, pnlPositive: profit >= 0 };
}

function MatchupCard({ matchup, isStaking, weeklyBudget }: { matchup: PlayoffMatchup; isStaking: boolean; weeklyBudget: number }) {
  const homeWon = !!matchup.winnerId ? matchup.winnerId === matchup.homeTeamId : +matchup.homeScore > +matchup.awayScore;
  const awayWon = !!matchup.winnerId ? matchup.winnerId === matchup.awayTeamId : +matchup.awayScore > +matchup.homeScore;
  const scored = isStaking
    ? matchup.eventStatus === 'live' || matchup.eventStatus === 'completed'
    : +matchup.homeScore > 0 || +matchup.awayScore > 0;

  const homeStaking = isStaking && scored ? fmtBalance(+matchup.homeScore, weeklyBudget) : null;
  const awayStaking = isStaking && scored ? fmtBalance(+matchup.awayScore, weeklyBudget) : null;

  return (
    <div style={styles.matchupCard}>
      <div style={styles.matchupEventRow}>
        <span style={styles.matchupEvent}>{matchup.eventName}</span>
        {matchup.eventStatus === 'live' && <span style={styles.liveChip}>LIVE</span>}
        {isStaking && <span style={styles.stakingHint}>Higher balance wins</span>}
      </div>
      <div style={styles.matchupRow}>
        {/* Home team */}
        <div style={{ ...styles.teamSide, ...(homeWon && scored ? styles.winnerSide : {}) }}>
          <div style={styles.teamTopRow}>
            <span style={styles.seedBadge}>#{matchup.homeSeed}</span>
            {homeWon && scored && <span style={styles.winnerCrown}>👑</span>}
          </div>
          <span style={{ ...styles.teamName, ...(homeWon && scored ? styles.winnerName : {}) }}>
            {matchup.homeTeamName}
          </span>
          <span style={styles.teamRecord}>{matchup.homeWins}–{matchup.homeLosses}</span>
          {scored ? (
            isStaking ? (
              <div style={styles.stakingScoreCol}>
                <span style={{ ...styles.score, ...(homeWon ? styles.winnerScore : {}) }}>{homeStaking!.display}</span>
                <span style={{ ...styles.pnlBadge, color: homeStaking!.pnlPositive ? '#4caf50' : '#ff5252' }}>{homeStaking!.pnl}</span>
              </div>
            ) : (
              <span style={{ ...styles.score, ...(homeWon ? styles.winnerScore : {}) }}>{fmtPts(+matchup.homeScore)} pts</span>
            )
          ) : (
            <span style={styles.scoreDash}>—</span>
          )}
        </div>

        <span style={styles.vs}>VS</span>

        {/* Away team */}
        <div style={{ ...styles.teamSide, alignItems: 'flex-end', ...(awayWon && scored ? styles.winnerSide : {}) }}>
          <div style={{ ...styles.teamTopRow, justifyContent: 'flex-end' }}>
            {awayWon && scored && <span style={styles.winnerCrown}>👑</span>}
            <span style={styles.seedBadge}>#{matchup.awaySeed}</span>
          </div>
          <span style={{ ...styles.teamName, textAlign: 'right', ...(awayWon && scored ? styles.winnerName : {}) }}>
            {matchup.awayTeamName}
          </span>
          <span style={{ ...styles.teamRecord, textAlign: 'right' as const }}>{matchup.awayWins}–{matchup.awayLosses}</span>
          {scored ? (
            isStaking ? (
              <div style={{ ...styles.stakingScoreCol, alignItems: 'flex-end' }}>
                <span style={{ ...styles.score, ...(awayWon ? styles.winnerScore : {}) }}>{awayStaking!.display}</span>
                <span style={{ ...styles.pnlBadge, color: awayStaking!.pnlPositive ? '#4caf50' : '#ff5252' }}>{awayStaking!.pnl}</span>
              </div>
            ) : (
              <span style={{ ...styles.score, ...(awayWon ? styles.winnerScore : {}) }}>{fmtPts(+matchup.awayScore)} pts</span>
            )
          ) : (
            <span style={styles.scoreDash}>—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TBDCard({ subtitle }: { subtitle?: string }) {
  return (
    <div style={{ ...styles.matchupCard, ...styles.tbdCard }}>
      <div style={styles.tbdText}>{subtitle ?? 'TBD'}</div>
    </div>
  );
}

function PreviewCard({ top, bottom }: { top: { seed: number; name: string }; bottom: { seed: number; name: string } }) {
  return (
    <div style={{ ...styles.matchupCard, borderStyle: 'dashed' }}>
      <div style={styles.matchupRow}>
        <div style={styles.teamSide}>
          <span style={styles.seedBadge}>#{top.seed}</span>
          <span style={styles.teamName}>{top.name}</span>
        </div>
        <span style={styles.vs}>vs</span>
        <div style={{ ...styles.teamSide, alignItems: 'flex-end' }}>
          <span style={styles.seedBadge}>#{bottom.seed}</span>
          <span style={styles.teamName}>{bottom.name}</span>
        </div>
      </div>
    </div>
  );
}

export function PlayoffsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const { data: league } = useQuery<League & { seasonEndsAt?: string; playoffSemisEventId?: string; playoffFinalsEventId?: string }>({
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

  const advanceMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/playoffs/advance`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playoffs-bracket', leagueId] }),
  });

  if (isLoading || !bracket) return <LoadingScreen />;

  const { phase, seeds, semisMatchups, finalsMatchup, isStaking, weeklyBudget } = bracket;

  function fmtDate(iso: string | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Playoffs</span>
        {phase !== 'none' && (
          <span style={styles.phaseBadge}>
            {phase === 'complete' ? 'COMPLETE' : phase === 'finals' ? 'FINALS' : 'SEMIFINALS'}
          </span>
        )}
      </nav>

      {/* Schedule info */}
      {league?.seasonEndsAt && (
        <div style={styles.scheduleCard}>
          <div style={styles.scheduleRow}>
            <span style={styles.scheduleLabel}>Regular season ends</span>
            <span style={styles.scheduleVal}>{fmtDate(league.seasonEndsAt)}</span>
          </div>
          <div style={styles.scheduleRow}>
            <span style={styles.scheduleLabel}>Semifinals</span>
            <span style={styles.scheduleVal}>
              {semisEvent ? `${semisEvent.name} · ${fmtDate(semisEvent.scheduledAt)}` : '—'}
            </span>
          </div>
          <div style={{ ...styles.scheduleRow, borderBottom: 'none' }}>
            <span style={styles.scheduleLabel}>Finals</span>
            <span style={styles.scheduleVal}>
              {finalsEvent ? `${finalsEvent.name} · ${fmtDate(finalsEvent.scheduledAt)}` : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Advance to finals */}
      {phase === 'semis' && semisMatchups.length >= 2 && (
        <div style={styles.advanceCard}>
          <p style={styles.advanceText}>Semis are set — advance winners to the Finals.</p>
          {advanceMutation.isError && <p style={styles.errMsg}>{(advanceMutation.error as any)?.error ?? 'Failed'}</p>}
          <button
            style={{ ...styles.advanceBtn, ...(advanceMutation.isPending ? styles.btnDisabled : {}) }}
            disabled={advanceMutation.isPending}
            onClick={() => advanceMutation.mutate()}
          >
            {advanceMutation.isPending ? 'Advancing...' : 'Advance to Finals'}
          </button>
        </div>
      )}

      {/* Playoff seeds */}
      {seeds.length > 0 && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Playoff Seeds</p>
          <div style={styles.seedsList}>
            {seeds.map((s, i) => (
              <div key={s.id} style={styles.seedRow}>
                <span style={styles.seedNum}>#{i + 1}</span>
                <span style={styles.seedTeam}>{s.teamName}</span>
                <span style={styles.seedRecord}>{s.wins}–{s.losses}</span>
                <span style={styles.seedPts}>
                  {isStaking
                    ? fmtBalance(+(s.stakingBalance ?? 0), weeklyBudget).pnl
                    : `${(+s.totalPoints).toFixed(0)} pts`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket preview (pre-playoffs) */}
      {phase === 'none' && seeds.length > 0 && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Bracket Preview — If Playoffs Started Today</p>
          <p style={styles.previewNote}>Seeding is based on current standings. Dashed borders indicate projected matchups.</p>
          {seeds.length >= 4 ? (
            <div style={{ ...styles.bracket, ...(isMobile ? styles.bracketMobile : {}) }}>
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Semifinals</p>
                <PreviewCard top={{ seed: 1, name: seeds[0].teamName }} bottom={{ seed: 4, name: seeds[3].teamName }} />
                <PreviewCard top={{ seed: 2, name: seeds[1].teamName }} bottom={{ seed: 3, name: seeds[2].teamName }} />
              </div>
              <div style={isMobile ? styles.connectorMobile : styles.connector}>
                {isMobile
                  ? <span style={styles.connectorArrow}>↓</span>
                  : <><div style={styles.connectorLine} /><span style={styles.connectorArrow}>→</span><div style={styles.connectorLine} /></>}
              </div>
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Finals</p>
                <TBDCard subtitle="Awaiting semifinal results" />
              </div>
            </div>
          ) : seeds.length >= 2 ? (
            <div style={styles.bracketSingle}>
              <p style={styles.roundLabel}>Finals</p>
              <PreviewCard top={{ seed: 1, name: seeds[0].teamName }} bottom={{ seed: 2, name: seeds[1].teamName }} />
            </div>
          ) : null}
        </div>
      )}

      {phase === 'none' && seeds.length === 0 && (
        <div style={styles.empty}>Playoffs start automatically after the regular season ends.</div>
      )}

      {phase !== 'none' && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Bracket</p>
          {semisMatchups.length > 0 ? (
            <div style={{ ...styles.bracket, ...(isMobile ? styles.bracketMobile : {}) }}>
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Semifinals</p>
                {semisMatchups.map((m) => <MatchupCard key={m.id} matchup={m} isStaking={isStaking} weeklyBudget={weeklyBudget} />)}
              </div>
              <div style={isMobile ? styles.connectorMobile : styles.connector}>
                {isMobile
                  ? <span style={styles.connectorArrow}>↓</span>
                  : <><div style={styles.connectorLine} /><span style={styles.connectorArrow}>→</span><div style={styles.connectorLine} /></>}
              </div>
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Finals</p>
                {finalsMatchup ? <MatchupCard matchup={finalsMatchup} isStaking={isStaking} weeklyBudget={weeklyBudget} /> :<TBDCard subtitle="Awaiting semifinal results" />}
              </div>
            </div>
          ) : (
            <div style={styles.bracketSingle}>
              <p style={styles.roundLabel}>Finals</p>
              {finalsMatchup ? <MatchupCard matchup={finalsMatchup} isStaking={isStaking} weeklyBudget={weeklyBudget} /> :<TBDCard />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  phaseBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, letterSpacing: 0.5 },
  scheduleCard: { margin: 24, background: '#141414', border: '1px solid #242424', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  scheduleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #1a1a1a' },
  scheduleLabel: { color: '#666', fontSize: 14 },
  scheduleVal: { color: '#ccc', fontSize: 14, fontWeight: 600, textAlign: 'right' as const, maxWidth: '60%' },
  advanceCard: { margin: '0 24px 8px', background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const },
  advanceText: { color: '#888', fontSize: 14, margin: 0, flex: 1 },
  advanceBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  errMsg: { color: '#ff5252', fontSize: 14, width: '100%' },
  section: { padding: '0 24px 32px' },
  sectionLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, margin: '20px 0 10px' },
  seedsList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  seedRow: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  seedNum: { color: '#c8102e', fontWeight: 700, fontSize: 14, width: 24 },
  seedTeam: { color: '#fff', fontWeight: 600, fontSize: 14, flex: 1 },
  seedRecord: { color: '#666', fontSize: 14 },
  seedPts: { color: '#888', fontSize: 14 },
  bracket: { display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 0, alignItems: 'center' },
  bracketMobile: { display: 'flex', flexDirection: 'column' as const, gap: 0 },
  bracketSingle: { maxWidth: 600, margin: '0 auto' },
  bracketCol: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  roundLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, margin: '0 0 8px' },
  connector: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 4 },
  connectorMobile: { display: 'flex', justifyContent: 'center', padding: '8px 0' },
  connectorLine: { flex: 1, width: 1, background: '#333', minHeight: 20 },
  connectorArrow: { color: '#444', fontSize: 18 },
  matchupCard: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  matchupEventRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  matchupEvent: { color: '#555', fontSize: 12, flex: 1 },
  liveChip: { background: '#c8102e', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 },
  stakingHint: { color: '#444', fontSize: 10, fontStyle: 'italic' as const },
  matchupRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  teamSide: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 4 },
  winnerSide: {},
  teamTopRow: { display: 'flex', alignItems: 'center', gap: 4 },
  seedBadge: { color: '#c8102e', fontSize: 10, fontWeight: 700 },
  winnerCrown: { fontSize: 10 },
  teamName: { color: '#888', fontSize: 13, fontWeight: 600 },
  winnerName: { color: '#fff' },
  teamRecord: { color: '#444', fontSize: 11 },
  score: { color: '#555', fontSize: 24, fontWeight: 700, lineHeight: 1 },
  winnerScore: { color: '#fff' },
  scoreDash: { color: '#333', fontSize: 24, fontWeight: 700 },
  stakingScoreCol: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  pnlBadge: { fontSize: 11, fontWeight: 700 },
  vs: { color: '#2a2a2a', fontSize: 11, fontWeight: 700, flexShrink: 0, paddingTop: 28 },
  tbdCard: { opacity: 0.5 },
  tbdText: { color: '#555', fontSize: 14, fontStyle: 'italic' },
  empty: { color: '#555', textAlign: 'center' as const, padding: '60px 24px', fontSize: 14, fontStyle: 'italic' },
  previewNote: { color: '#444', fontSize: 12, margin: '0 0 16px', fontStyle: 'italic' },
};
