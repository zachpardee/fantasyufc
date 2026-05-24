import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import type { League } from '@fantasy-ufc/shared';

type Seed = { id: string; teamName: string; wins: number; losses: number; totalPoints: number };
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
};
type AvailableEvent = { id: string; name: string; scheduledAt: string; status: string };

function MatchupCard({ matchup, label }: { matchup: PlayoffMatchup; label?: string }) {
  const homeWon = !!matchup.winnerId ? matchup.winnerId === matchup.homeTeamId : +matchup.homeScore > +matchup.awayScore;
  const awayWon = !!matchup.winnerId ? matchup.winnerId === matchup.awayTeamId : +matchup.awayScore > +matchup.homeScore;
  const scored = +matchup.homeScore > 0 || +matchup.awayScore > 0;

  return (
    <div style={styles.matchupCard}>
      {label && <div style={styles.matchupLabel}>{label}</div>}
      <div style={styles.matchupEvent}>{matchup.eventName}</div>
      <div style={styles.matchupRow}>
        <div style={{ ...styles.teamSide, ...(homeWon && scored ? styles.winnerSide : {}) }}>
          <span style={styles.seedBadge}>#{matchup.homeSeed}</span>
          <span style={styles.teamName}>{matchup.homeTeamName}</span>
          <span style={{ ...styles.score, ...(homeWon && scored ? styles.winnerScore : {}) }}>
            {scored ? (+matchup.homeScore).toFixed(0) : '–'}
          </span>
        </div>
        <span style={styles.vs}>vs</span>
        <div style={{ ...styles.teamSide, alignItems: 'flex-end', ...(awayWon && scored ? styles.winnerSide : {}) }}>
          <span style={styles.seedBadge}>#{matchup.awaySeed}</span>
          <span style={styles.teamName}>{matchup.awayTeamName}</span>
          <span style={{ ...styles.score, ...(awayWon && scored ? styles.winnerScore : {}) }}>
            {scored ? (+matchup.awayScore).toFixed(0) : '–'}
          </span>
        </div>
      </div>
    </div>
  );
}

function TBDCard({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div style={{ ...styles.matchupCard, ...styles.tbdCard }}>
      <div style={styles.matchupLabel}>{label}</div>
      <div style={styles.tbdText}>{subtitle ?? 'TBD'}</div>
    </div>
  );
}

export function PlayoffsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const [selectedSemisEvent, setSelectedSemisEvent] = useState('');
  const [selectedFinalsEvent, setSelectedFinalsEvent] = useState('');

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: bracket, isLoading } = useQuery<Bracket>({
    queryKey: ['playoffs-bracket', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/playoffs/bracket`),
  });

  const { data: availableEvents = [] } = useQuery<AvailableEvent[]>({
    queryKey: ['schedule-available', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule/available`),
  });

  const isCommissioner = session?.user.id === league?.commissionerId;

  const startMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/playoffs/start`, { semisEventId: selectedSemisEvent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playoffs-bracket', leagueId] });
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      setSelectedSemisEvent('');
    },
  });

  const advanceMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/playoffs/advance`, { finalsEventId: selectedFinalsEvent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playoffs-bracket', leagueId] });
      setSelectedFinalsEvent('');
    },
  });

  if (isLoading || !bracket) return <div style={styles.loading}>Loading bracket...</div>;

  const { phase, seeds, semisMatchups, finalsMatchup } = bracket;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Playoffs</span>
        {phase !== 'none' && <span style={styles.phaseBadge}>{phase === 'complete' ? 'COMPLETE' : phase === 'finals' ? 'FINALS' : 'SEMIFINALS'}</span>}
      </nav>

      {/* Commissioner controls */}
      {isCommissioner && phase === 'none' && (
        <div style={styles.commCard}>
          <p style={styles.commTitle}>Start the Playoffs</p>
          <p style={styles.commSub}>Select the event for the Semifinals. Top 4 teams will be seeded by W-L record.</p>
          <div style={styles.commRow}>
            <select style={styles.eventSelect} value={selectedSemisEvent} onChange={(e) => setSelectedSemisEvent(e.target.value)}>
              <option value="">Select semifinal event...</option>
              {availableEvents.map((e) => (
                <option key={e.id} value={e.id}>{e.name} — {new Date(e.scheduledAt).toLocaleDateString()}</option>
              ))}
            </select>
            <button
              style={{ ...styles.commBtn, ...(!selectedSemisEvent || startMutation.isPending ? styles.commBtnDisabled : {}) }}
              disabled={!selectedSemisEvent || startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {startMutation.isPending ? 'Starting...' : 'Start Playoffs'}
            </button>
          </div>
          {startMutation.isError && <p style={styles.errMsg}>{(startMutation.error as any)?.error ?? 'Failed to start'}</p>}
        </div>
      )}

      {isCommissioner && phase === 'semis' && semisMatchups.length >= 2 && (
        <div style={styles.commCard}>
          <p style={styles.commTitle}>Set Finals Event</p>
          <p style={styles.commSub}>Semis winners will advance to the Finals on the event you pick.</p>
          <div style={styles.commRow}>
            <select style={styles.eventSelect} value={selectedFinalsEvent} onChange={(e) => setSelectedFinalsEvent(e.target.value)}>
              <option value="">Select finals event...</option>
              {availableEvents.map((e) => (
                <option key={e.id} value={e.id}>{e.name} — {new Date(e.scheduledAt).toLocaleDateString()}</option>
              ))}
            </select>
            <button
              style={{ ...styles.commBtn, ...(!selectedFinalsEvent || advanceMutation.isPending ? styles.commBtnDisabled : {}) }}
              disabled={!selectedFinalsEvent || advanceMutation.isPending}
              onClick={() => advanceMutation.mutate()}
            >
              {advanceMutation.isPending ? 'Setting...' : 'Set Finals'}
            </button>
          </div>
          {advanceMutation.isError && <p style={styles.errMsg}>{(advanceMutation.error as any)?.error ?? 'Failed to advance'}</p>}
        </div>
      )}

      {/* Seedings */}
      {seeds.length > 0 && (
        <div style={styles.seedsSection}>
          <p style={styles.sectionLabel}>Playoff Seeds</p>
          <div style={styles.seedsList}>
            {seeds.map((s, i) => (
              <div key={s.id} style={styles.seedRow}>
                <span style={styles.seedNum}>#{i + 1}</span>
                <span style={styles.seedTeam}>{s.teamName}</span>
                <span style={styles.seedRecord}>{s.wins}-{s.losses}</span>
                <span style={styles.seedPts}>{(+s.totalPoints).toFixed(0)} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket */}
      {phase === 'none' && !isCommissioner && (
        <div style={styles.empty}>Playoffs haven't started yet.</div>
      )}

      {phase !== 'none' && (
        <div style={styles.bracketWrap}>
          <p style={styles.sectionLabel}>Bracket</p>
          {semisMatchups.length > 0 ? (
            <div style={styles.bracket}>
              {/* Semis column */}
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Semifinals</p>
                {semisMatchups.map((m) => <MatchupCard key={m.id} matchup={m} />)}
              </div>

              {/* Connector */}
              <div style={styles.connector}>
                <div style={styles.connectorLine} />
                <span style={styles.connectorArrow}>→</span>
                <div style={styles.connectorLine} />
              </div>

              {/* Finals column */}
              <div style={styles.bracketCol}>
                <p style={styles.roundLabel}>Finals</p>
                {finalsMatchup
                  ? <MatchupCard matchup={finalsMatchup} />
                  : <TBDCard label="Finals" subtitle="Awaiting semifinal results" />}
              </div>
            </div>
          ) : (
            <div style={styles.bracketSingle}>
              <p style={styles.roundLabel}>Finals</p>
              {finalsMatchup
                ? <MatchupCard matchup={finalsMatchup} />
                : <TBDCard label="Finals" subtitle="TBD" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  loading: { color: '#888', padding: 40, textAlign: 'center' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  phaseBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, letterSpacing: 0.5 },
  commCard: { margin: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20 },
  commTitle: { color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 4px' },
  commSub: { color: '#666', fontSize: 13, margin: '0 0 14px' },
  commRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const },
  eventSelect: { background: '#111', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 13, padding: '8px 12px', flex: 1, minWidth: 220, outline: 'none' },
  commBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  commBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  errMsg: { color: '#ff5252', fontSize: 13, marginTop: 8 },
  seedsSection: { padding: '0 24px 16px' },
  sectionLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, margin: '20px 0 10px' },
  seedsList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  seedRow: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  seedNum: { color: '#c8102e', fontWeight: 800, fontSize: 13, width: 24 },
  seedTeam: { color: '#fff', fontWeight: 600, fontSize: 14, flex: 1 },
  seedRecord: { color: '#666', fontSize: 13 },
  seedPts: { color: '#888', fontSize: 13 },
  bracketWrap: { padding: '0 24px 32px' },
  bracket: { display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 0, alignItems: 'center' },
  bracketSingle: { maxWidth: 600, margin: '0 auto' },
  bracketCol: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  roundLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, margin: '0 0 8px' },
  connector: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 4, color: '#333' },
  connectorLine: { flex: 1, width: 1, background: '#333', minHeight: 20 },
  connectorArrow: { color: '#444', fontSize: 18 },
  matchupCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 18px' },
  matchupLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 6 },
  matchupEvent: { color: '#666', fontSize: 12, marginBottom: 12 },
  matchupRow: { display: 'flex', alignItems: 'center', gap: 8 },
  teamSide: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3 },
  winnerSide: {},
  seedBadge: { color: '#c8102e', fontSize: 10, fontWeight: 700 },
  teamName: { color: '#ccc', fontSize: 14, fontWeight: 600 },
  score: { color: '#555', fontSize: 28, fontWeight: 800 },
  winnerScore: { color: '#fff' },
  vs: { color: '#333', fontSize: 11, flexShrink: 0 },
  tbdCard: { opacity: 0.5 },
  tbdText: { color: '#555', fontSize: 14, fontStyle: 'italic', paddingTop: 8 },
  empty: { color: '#555', textAlign: 'center', padding: '60px 24px', fontSize: 14, fontStyle: 'italic' },
};
