import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export function TeamPage() {
  const { leagueId, memberId } = useParams<{ leagueId: string; memberId: string }>();

  const { data: standings } = useQuery<any[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/standings`),
  });

  const member = standings?.find((m) => m.id === memberId);

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}/standings`} style={styles.back}>← Standings</Link>
        <span style={styles.title}>{member?.teamName ?? 'Team'}</span>
      </nav>

      {member && (
        <div style={styles.statBar}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Season Points</span>
            <span style={styles.statValue}>{(+(member.totalPoints ?? 0)).toFixed(1)}</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <span style={styles.statLabel}>Record</span>
            <span style={styles.statValue}>{member.wins}-{member.losses}{member.ties > 0 ? `-${member.ties}` : ''}</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <span style={styles.statLabel}>Manager</span>
            <span style={styles.statValue}>@{member.username}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: 700 },
  statBar: { background: '#111', borderBottom: '1px solid #1e1e1e', padding: '20px 24px', display: 'flex', gap: 0, alignItems: 'center' },
  stat: { display: 'flex', flexDirection: 'column', gap: 4, padding: '0 28px 0 0' },
  statLabel: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: 800 },
  statDivider: { width: 1, height: 36, background: '#2a2a2a', marginRight: 28 },
};
