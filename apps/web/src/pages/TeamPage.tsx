import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

function fmtBankroll(n: number): string {
  const abs = Math.abs(n);
  const s = abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2);
  return (n < 0 ? '-$' : '+$') + s;
}

export function TeamPage() {
  const { leagueId, memberId } = useParams<{ leagueId: string; memberId: string }>();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const {
    data: standings,
    isLoading,
    isError,
    refetch,
  } = useQuery<any[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/standings`),
  });

  const member = standings?.find((m) => m.id === memberId);
  const isStaking = league?.leagueFormat === 'staking';
  const notFound = !isLoading && !isError && !!standings && !member;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}/standings`} style={styles.back}>
          ← Standings
        </Link>
        <span style={styles.title}>{member?.teamName ?? 'Team'}</span>
      </nav>

      {(isError || notFound) && (
        <div style={styles.errorBox}>
          <p style={styles.errorTitle}>
            {isError ? "Couldn't load this team." : 'Team not found.'}
          </p>
          <p style={styles.errorSub}>
            {isError
              ? 'Something went wrong fetching this team.'
              : 'This team may have left the league or the link is invalid.'}
          </p>
          <div style={styles.errorActions}>
            {isError && (
              <button style={styles.retryBtn} onClick={() => refetch()}>
                Retry
              </button>
            )}
            <Link to={`/league/${leagueId}/standings`} style={styles.backBtn}>
              Back to Standings
            </Link>
          </div>
        </div>
      )}

      {member && (
        <div style={styles.statBar}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>{isStaking ? 'Season Bankroll' : 'Season Points'}</span>
            <span
              style={{
                ...styles.statValue,
                color: isStaking
                  ? (member.stakingBalance ?? 0) >= 0
                    ? '#4caf50'
                    : '#ff5252'
                  : '#fff',
              }}
            >
              {isStaking
                ? fmtBankroll(+(member.stakingBalance ?? 0))
                : (+(member.totalPoints ?? 0)).toFixed(1)}
            </span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            <span style={styles.statLabel}>Record</span>
            <span style={styles.statValue}>
              {member.wins}-{member.losses}
              {member.ties > 0 ? `-${member.ties}` : ''}
            </span>
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
  nav: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    background: 'rgba(17,17,17,0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid #222',
    padding: '8px 20px',
    minHeight: 52,
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: 700 },
  statBar: {
    background: '#111',
    borderBottom: '1px solid #1e1e1e',
    padding: '20px 24px',
    display: 'flex',
    gap: 0,
    alignItems: 'center',
  },
  stat: { display: 'flex', flexDirection: 'column', gap: 4, padding: '0 28px 0 0' },
  statLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: { color: '#fff', fontSize: 20, fontWeight: 700 },
  statDivider: { width: 1, height: 36, background: '#2a2a2a', marginRight: 28 },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '80px 24px',
    textAlign: 'center',
  },
  errorTitle: { color: '#fff', fontSize: 18, fontWeight: 700 },
  errorSub: { color: '#777', fontSize: 14, maxWidth: 360 },
  errorActions: { display: 'flex', gap: 12, marginTop: 4 },
  retryBtn: {
    background: '#c8102e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  backBtn: {
    background: '#1a1a1a',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
};
