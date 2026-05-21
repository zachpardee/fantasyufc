import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export function StandingsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: standings } = useQuery<any[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/standings`),
  });

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Standings</h1>
      <table style={styles.table}>
        <thead>
          <tr>
            {['#', 'Team', 'W', 'L', 'T', 'Pts', 'Streak'].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings?.map((member, i) => (
            <tr key={member.id} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
              <td style={styles.td}>{i + 1}</td>
              <td style={styles.tdTeam}>
                <div style={styles.teamName}>{member.team_name}</div>
                <div style={styles.username}>{member.username}</div>
              </td>
              <td style={[styles.td, styles.win] as any}>{member.wins}</td>
              <td style={[styles.td, styles.loss] as any}>{member.losses}</td>
              <td style={styles.td}>{member.ties}</td>
              <td style={[styles.td, styles.pts] as any}>{(+member.total_points).toFixed(1)}</td>
              <td style={styles.td}>
                <span style={member.streak > 0 ? styles.winStreak : styles.lossStreak}>
                  {member.streak > 0 ? `W${member.streak}` : member.streak < 0 ? `L${Math.abs(member.streak)}` : '--'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', padding: 24 },
  title: { color: '#fff', fontSize: 24, marginBottom: 24 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #222' },
  td: { color: '#ccc', padding: '14px', fontSize: 14, textAlign: 'left' },
  tdTeam: { padding: '10px 14px' },
  rowEven: { background: '#0f0f0f' },
  rowOdd: { background: '#0a0a0a' },
  teamName: { color: '#fff', fontWeight: 600, fontSize: 14 },
  username: { color: '#666', fontSize: 12 },
  win: { color: '#4caf50', fontWeight: 700 },
  loss: { color: '#ff5252', fontWeight: 700 },
  pts: { color: '#c8102e', fontWeight: 700 },
  winStreak: { color: '#4caf50', fontWeight: 700 },
  lossStreak: { color: '#ff5252', fontWeight: 700 },
};
