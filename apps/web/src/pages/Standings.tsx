import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

export function StandingsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();

  const { data: standings } = useQuery<any[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/standings`),
  });

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Standings</span>
      </nav>

      <div style={styles.content}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['#', 'Team', 'W', 'L', 'T', 'Pts', 'Season PF', 'Streak'].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings?.map((member, i) => {
              const isMe = member.userId === session?.user.id;
              return (
                <tr key={member.id} style={{ ...(i % 2 === 0 ? styles.rowEven : styles.rowOdd), ...(isMe ? styles.rowMe : {}) }}>
                  <td style={styles.td}>
                    <span style={i < 3 ? styles.medal : undefined}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                  </td>
                  <td style={styles.tdTeam}>
                    <div style={styles.teamName}>
                      {member.teamName ?? member.team_name}
                      {isMe && <span style={styles.youBadge}>YOU</span>}
                    </div>
                    <div style={styles.username}>@{member.username}</div>
                  </td>
                  <td style={{ ...styles.td, ...styles.win }}>{member.wins}</td>
                  <td style={{ ...styles.td, ...styles.loss }}>{member.losses}</td>
                  <td style={styles.td}>{member.ties}</td>
                  <td style={{ ...styles.td, ...styles.ptsCol }}>
                    {member.wins * 2 + member.ties}
                  </td>
                  <td style={{ ...styles.td, ...styles.pfCol }}>
                    {(+(member.totalPoints ?? member.total_points ?? 0)).toFixed(1)}
                  </td>
                  <td style={styles.td}>
                    {member.streak > 0
                      ? <span style={styles.winStreak}>W{member.streak}</span>
                      : member.streak < 0
                      ? <span style={styles.lossStreak}>L{Math.abs(member.streak)}</span>
                      : <span style={styles.noStreak}>--</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!standings || standings.length === 0) && (
          <p style={styles.empty}>No standings yet — check back after the season begins.</p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18 },
  content: { padding: 24, maxWidth: 900, margin: '0 auto' },
  empty: { color: '#555', fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: 40 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #222' },
  td: { color: '#ccc', padding: '14px', fontSize: 14, textAlign: 'left' },
  tdTeam: { padding: '10px 14px' },
  rowEven: { background: '#0f0f0f' },
  rowOdd: { background: '#0a0a0a' },
  rowMe: { background: '#1a1200' },
  teamName: { color: '#fff', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 },
  username: { color: '#666', fontSize: 12 },
  youBadge: { background: '#c8102e', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 3 },
  medal: {},
  win: { color: '#4caf50', fontWeight: 700 },
  loss: { color: '#ff5252', fontWeight: 700 },
  ptsCol: { color: '#c8102e', fontWeight: 700 },
  pfCol: { color: '#ff8c42', fontWeight: 700 },
  winStreak: { color: '#4caf50', fontWeight: 700 },
  lossStreak: { color: '#ff5252', fontWeight: 700 },
  noStreak: { color: '#444' },
};
