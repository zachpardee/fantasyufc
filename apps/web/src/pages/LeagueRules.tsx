import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { League } from '@fantasy-ufc/shared';

type ScoringSettings = {
  ptsWin: number; ptsKoTko: number; ptsSubmission: number;
  ptsDecision: number; ptsDraw: number; ptsNoContest: number;
  ptsFinishRd1: number; ptsFinishRd2: number; ptsFinishRd3: number;
  ptsFinishRd4: number; ptsFinishRd5: number;
  ptsKnockdown: number;
  ptsSigStrikeLanded: number; ptsSigStrikeAttempted: number;
  ptsTotalStrikeLanded: number;
  ptsTakedownLanded: number; ptsTakedownAttempted: number;
  ptsSubmissionAttempt: number;
  ptsPerformanceOfNight: number; ptsFightOfNight: number;
  ptsLoss: number; ptsKoLossPenalty: number;
  titleFightMultiplier: number;
  scorePrelims: boolean; scoreEarlyPrelims: boolean;
};

function fmt(n: number) {
  if (n === 0) return '—';
  return n > 0 ? `+${(+n).toFixed(2).replace(/\.00$/, '')}` : `${(+n).toFixed(2).replace(/\.00$/, '')}`;
}

function Row({ label, value }: { label: string; value: string }) {
  const isNeutral = value === '—';
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, color: isNeutral ? '#444' : value.startsWith('-') ? '#c8102e' : '#fff' }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

export function LeagueRulesPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: scoring, isLoading } = useQuery<ScoringSettings>({
    queryKey: ['scoring-settings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/scoring-settings`),
  });

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Rules & Scoring</span>
      </nav>

      {/* League format */}
      {league && (
        <Section title="League Format">
          <Row label="Roster size" value={String(league.rosterSize)} />
          <Row label="Max teams" value={String(league.maxTeams)} />
          <Row label="Draft format" value={league.draftType === 'snake' ? 'Snake draft' : league.draftType ?? '—'} />
          <Row label="Season" value={String(league.seasonYear)} />
        </Section>
      )}

      {/* Picks scoring — fixed rules, not per-league settings */}
      <Section title="Event Picks (top 6 fights)">
        <Row label="Correct winner" value="+200 pts" />
        <Row label="Correct winner + method" value="+300 pts" />
        <Row label="Underdog bonus (≥ +350 odds)" value="+100 pts" />
        <Row label="Wrong pick" value="—" />
      </Section>

      {/* Roster win bonus */}
      <Section title="Roster Bonus">
        <Row label="Drafted fighter wins this event" value="+50 pts" />
      </Section>

      {/* Fighter scoring */}
      {isLoading && <div style={styles.loading}>Loading scoring settings...</div>}
      {scoring && (
        <>
          <Section title="Fight Outcome">
            <Row label="Win" value={fmt(scoring.ptsWin)} />
            <Row label="KO / TKO win" value={fmt(scoring.ptsKoTko)} />
            <Row label="Submission win" value={fmt(scoring.ptsSubmission)} />
            <Row label="Decision win" value={fmt(scoring.ptsDecision)} />
            <Row label="Draw" value={fmt(scoring.ptsDraw)} />
            <Row label="No contest" value={fmt(scoring.ptsNoContest)} />
            <Row label="Loss" value={fmt(scoring.ptsLoss)} />
            <Row label="KO/TKO loss penalty" value={fmt(scoring.ptsKoLossPenalty)} />
          </Section>

          <Section title="Finish Round Bonus">
            <Row label="Finish in round 1" value={fmt(scoring.ptsFinishRd1)} />
            <Row label="Finish in round 2" value={fmt(scoring.ptsFinishRd2)} />
            <Row label="Finish in round 3" value={fmt(scoring.ptsFinishRd3)} />
            <Row label="Finish in round 4" value={fmt(scoring.ptsFinishRd4)} />
            <Row label="Finish in round 5" value={fmt(scoring.ptsFinishRd5)} />
          </Section>

          <Section title="Strike Stats (per occurrence)">
            <Row label="Sig. strike landed" value={fmt(scoring.ptsSigStrikeLanded)} />
            <Row label="Sig. strike attempted" value={fmt(scoring.ptsSigStrikeAttempted)} />
            <Row label="Total strike landed" value={fmt(scoring.ptsTotalStrikeLanded)} />
            <Row label="Knockdown" value={fmt(scoring.ptsKnockdown)} />
          </Section>

          <Section title="Grappling Stats (per occurrence)">
            <Row label="Takedown landed" value={fmt(scoring.ptsTakedownLanded)} />
            <Row label="Takedown attempted" value={fmt(scoring.ptsTakedownAttempted)} />
            <Row label="Submission attempt" value={fmt(scoring.ptsSubmissionAttempt)} />
          </Section>

          <Section title="Bonuses">
            <Row label="Performance of the Night" value={fmt(scoring.ptsPerformanceOfNight)} />
            <Row label="Fight of the Night" value={fmt(scoring.ptsFightOfNight)} />
          </Section>

          <Section title="Multipliers">
            <Row label="Title fight multiplier" value={`${scoring.titleFightMultiplier}×`} />
            <Row label="Score prelim fights" value={scoring.scorePrelims ? 'Yes' : 'No'} />
            <Row label="Score early prelims" value={scoring.scoreEarlyPrelims ? 'Yes' : 'No'} />
          </Section>

          {/* Trades */}
          <Section title="Trades">
            <Row label="Roster changes" value="Trade only" />
            <Row label="Waiver pickups" value="Not available" />
            <Row label="Roster lock" value="Locked during live events" />
          </Section>
        </>
      )}

      <div style={styles.spacer} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18 },
  loading: { color: '#555', fontSize: 13, padding: '24px 24px' },
  section: { margin: '0 24px 8px' },
  sectionTitle: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '20px 0 8px', borderBottom: '1px solid #1a1a1a', marginBottom: 2 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #111' },
  rowLabel: { color: '#888', fontSize: 13 },
  rowValue: { color: '#fff', fontSize: 13, fontWeight: 600 },
  spacer: { height: 40 },
};
