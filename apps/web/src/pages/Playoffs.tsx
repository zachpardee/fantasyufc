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
  awayTeamId: string; awayTeamName: string; awaySeed: number; awayScore: number;
  winnerId: string | null; eventName: string; eventStatus: string;
};
type Bracket = {
  phase: 'none' | 'semis' | 'finals' | 'complete';
  seeds: Seed[];
  semisMatchups: PlayoffMatchup[];
  finalsMatchup: PlayoffMatchup | null;
  isStaking: boolean;
};

function fmtScore(n: number, isStaking: boolean): string {
  if (!isStaking) return n.toFixed(0);
  const abs = Math.abs(n);
  const s = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
  return n < 0 ? `(${s})` : s;
}

function MatchupCard({ matchup, isStaking }: { matchup: PlayoffMatchup; isStaking: boolean }) {
  const homeWon = !!matchup.winnerId ? matchup.winnerId === matchup.homeTeamId : +matchup.homeScore > +matchup.awayScore;
  const awayWon = !!matchup.winnerId ? matchup.winnerId === matchup.awayTeamId : +matchup.awayScore > +matchup.homeScore;
  const scored = +matchup.homeScore > 0 || +matchup.awayScore > 0;

  return (
    <div style={styles.matchupCard}>
      <div style={styles.matchupEvent}>{matchup.eventName}</div>
      <div style={styles.matchupRow}>
        <div style={{ ...styles.teamSide, ...(homeWon && scored ? styles.winnerSide : {}) }}>
          <span style={styles.seedBadge}>#{matchup.homeSeed}</span>
          <span style={styles.teamName}>{matchup.homeTeamName}</span>
          <span style={{ ...styles.score, ...(homeWon && scored ? styles.winnerScore : {}) }}>
            {scored ? fmtScore(+matchup.homeScore, isStaking) : '–'}
          </span>
        </div>
        <span style={styles.vs}>vs</span>
        <div style={{ ...styles.teamSide, alignItems: 'flex-end', ...(awayWon && scored ? styles.winnerSide : {}) }}>
          <span style={styles.seedBadge}>#{matchup.awaySeed}</span>
          <span style={styles.teamName}>{matchup.awayTeamName}</span>
          <span style={{ ...styles.score, ...(awayWon && scored ? styles.winnerScore : {}) }}>
            {scored ? fmtScore(+matchup.awayScore, isStaking) : '–'}
          </span>
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

  const { phase, seeds, semisMatchups, finalsMatchup, isStaking } = bracket;

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
                    ? fmtScore(+(s.stakingBalance ?? 0), true)
                    : `${(+s.totalPoints).toFixed(0)} pts`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket */}
      {phase === 'none' && (
        <div style={styles.empty}>Playoffs start automatically after the regular season ends.</div>
      )}

      {phase !== 'none' && (
        <div style={styles.section}>
          <p style={styles.sectionLabel}>Bracket</p>
          {semisMatchups.length > 0 ? (
            <div style={{ ...styles.bracket, ...(isMobile ? styles.bracketMobile : {}) }}>
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Semifinals</p>
                {semisMatchups.map((m) => <MatchupCard key={m.id} matchup={m} isStaking={isStaking} />)}
              </div>
              <div style={isMobile ? styles.connectorMobile : styles.connector}>
                {isMobile
                  ? <span style={styles.connectorArrow}>↓</span>
                  : <><div style={styles.connectorLine} /><span style={styles.connectorArrow}>→</span><div style={styles.connectorLine} /></>}
              </div>
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Finals</p>
                {finalsMatchup ? <MatchupCard matchup={finalsMatchup} isStaking={isStaking} /> : <TBDCard subtitle="Awaiting semifinal results" />}
              </div>
            </div>
          ) : (
            <div style={styles.bracketSingle}>
              <p style={styles.roundLabel}>Finals</p>
              {finalsMatchup ? <MatchupCard matchup={finalsMatchup} isStaking={isStaking} /> : <TBDCard />}
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
  matchupEvent: { color: '#555', fontSize: 12, marginBottom: 12 },
  matchupRow: { display: 'flex', alignItems: 'center', gap: 8 },
  teamSide: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3 },
  winnerSide: {},
  seedBadge: { color: '#c8102e', fontSize: 10, fontWeight: 700 },
  teamName: { color: '#ccc', fontSize: 14, fontWeight: 600 },
  score: { color: '#555', fontSize: 28, fontWeight: 700 },
  winnerScore: { color: '#fff' },
  vs: { color: '#333', fontSize: 12, flexShrink: 0 },
  tbdCard: { opacity: 0.5 },
  tbdText: { color: '#555', fontSize: 14, fontStyle: 'italic' },
  empty: { color: '#555', textAlign: 'center' as const, padding: '60px 24px', fontSize: 14, fontStyle: 'italic' },
};
