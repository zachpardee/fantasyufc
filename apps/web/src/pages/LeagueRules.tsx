import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { League, ScoringSettings } from '@fantasy-ufc/shared';

type LeagueWithSeason = League & {
  seasonEndsAt?: string;
  seasonLengthMonths?: number;
  playoffSemisEventId?: string;
  playoffFinalsEventId?: string;
};

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

function pts(n: number | undefined) {
  if (n == null) return '—';
  return n > 0 ? `+${n} pts` : n < 0 ? `${n} pts` : '—';
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function LeagueRulesPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: league } = useQuery<LeagueWithSeason>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: ss } = useQuery<ScoringSettings>({
    queryKey: ['scoring-settings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/scoring-settings`),
    enabled: !!leagueId,
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

  const seasonActive = league?.status === 'active' || league?.status === 'playoffs' || league?.status === 'completed';

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Rules & Scoring</span>
      </nav>

      {league && (
        <Section title="Season">
          <Row label="Season length" value={league.seasonLengthMonths ? `${league.seasonLengthMonths} months` : '—'} />
          <Row label="Status" value={league.status.charAt(0).toUpperCase() + league.status.slice(1)} />
          {seasonActive && (
            <Row label="Regular season ends" value={fmtDate(league.seasonEndsAt)} />
          )}
          {semisEvent && (
            <Row label="Semifinals" value={`${semisEvent.name} · ${fmtDate(semisEvent.scheduledAt)}`} />
          )}
          {finalsEvent && (
            <Row label="Finals" value={`${finalsEvent.name} · ${fmtDate(finalsEvent.scheduledAt)}`} />
          )}
          <Row label="Max teams" value={String(league.maxTeams)} />
        </Section>
      )}

      <Section title="How It Works">
        <Row label="Format" value="Pick 'em — no rosters or drafts" />
        <Row label="Picks per event" value="Top 6 fights (main card + top prelims)" />
        <Row label="Pick deadline" value="Event start time" />
        <Row label="Scoring" value="Points for correct winner + method" />
        <Row label="Prelims scoring" value={ss ? (ss.scorePrelims ? 'Enabled' : 'Disabled') : '—'} />
        <Row label="Early prelims" value={ss ? (ss.scoreEarlyPrelims ? 'Enabled' : 'Disabled') : '—'} />
      </Section>

      <Section title="Pick Scoring">
        <Row label="Correct winner (any method)" value={ss ? pts(ss.ptsWin) : '—'} />
        <Row label="+ KO/TKO method bonus" value={ss ? pts(ss.ptsKoTko) : '—'} />
        <Row label="+ Submission method bonus" value={ss ? pts(ss.ptsSubmission) : '—'} />
        <Row label="+ Decision method bonus" value={ss ? pts(ss.ptsDecision) : '—'} />
        <Row label="Underdog bonus (winner ≥ +350 odds)" value="+10 pts" />
        <Row label="Wrong pick" value="—" />
      </Section>

      <Section title="Sweep Bonus">
        <Row label="4 correct picks" value="+5 pts" />
        <Row label="5 correct picks" value="+10 pts" />
        <Row label="6 correct picks (sweep)" value="+20 pts" />
      </Section>

      <Section title="Matchups">
        <Row label="Format" value="Head-to-head per event" />
        <Row label="Matchup win bonus" value="+25 pts" />
        <Row label="Tie bonus" value="+10 pts" />
        <Row label="Loss" value="Event pick points only" />
        <Row label="Standings" value="Total season points" />
      </Section>

      <div style={styles.spacer} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18 },
  section: { margin: '0 24px 8px' },
  sectionTitle: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '20px 0 8px', borderBottom: '1px solid #1a1a1a', marginBottom: 2 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #111' },
  rowLabel: { color: '#888', fontSize: 13 },
  rowValue: { color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: '60%' },
  spacer: { height: 40 },
};
