import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { LoadingInline } from '../components/LoadingScreen';

export function TeamPage() {
  const { leagueId, memberId } = useParams<{ leagueId: string; memberId: string }>();

  const { data: fighters, isLoading } = useQuery<any[]>({
    queryKey: ['roster', leagueId, memberId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster/${memberId}`),
  });

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

      <div style={styles.body}>
        <h2 style={styles.sectionTitle}>
          Roster <span style={styles.count}>{fighters?.length ?? 0}</span>
        </h2>

        {isLoading && <LoadingInline />}

        {!isLoading && fighters?.length === 0 && (
          <div style={styles.empty}>No fighters on this roster yet.</div>
        )}

        {fighters?.map((f) => (
          <div key={f.id} style={styles.row}>
            <div style={styles.rowLeft}>
              <div style={styles.nameRow}>
                <span style={styles.name}>{f.firstName} {f.lastName}</span>
                {f.isChampion
                  ? <span style={styles.rankChamp}>C</span>
                  : f.ranking
                  ? <span style={styles.rank}>#{f.ranking}</span>
                  : <span style={styles.rankNR}>NR</span>}
              </div>
              <div style={styles.meta}>{f.weightClassName}</div>
            </div>
            <div style={styles.avgPts}>
              {f.averageFantasyPoints != null ? (+f.averageFantasyPoints).toFixed(1) : '--'} avg pts
            </div>
          </div>
        ))}
      </div>
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
  body: { padding: 24 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: '#333', color: '#aaa', borderRadius: 10, padding: '2px 8px', fontSize: 11 },
  loading: { color: '#555', fontSize: 14, padding: '40px 0', textAlign: 'center' },
  empty: { color: '#555', fontSize: 14, padding: '40px 0', textAlign: 'center' },
  row: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '14px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { display: 'flex', flexDirection: 'column', gap: 3 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  name: { color: '#fff', fontSize: 15, fontWeight: 600 },
  rank: { color: '#c8102e', fontSize: 12, fontWeight: 700 },
  rankChamp: { background: '#2a2400', color: '#ffd700', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 },
  rankNR: { color: '#444', fontSize: 11 },
  meta: { color: '#666', fontSize: 12 },
  avgPts: { color: '#888', fontSize: 13 },
};
