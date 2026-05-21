import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';

export function MatchupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId],
    queryFn: async () => {
      const m = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!m) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${m.id}`);
    },
  });

  useEffect(() => {
    if (!matchup?.id) return;
    const channel = supabase.channel(`matchup:${matchup.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matchup_scores', filter: `matchup_id=eq.${matchup.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchup?.id, refetch]);

  if (!matchup) return <div style={styles.center}>No matchup found for the current event.</div>;

  const homeScores = matchup.scores?.filter((s: any) => s.team_id === matchup.homeTeamId) ?? [];
  const awayScores = matchup.scores?.filter((s: any) => s.team_id === matchup.awayTeamId) ?? [];

  return (
    <div style={styles.page}>
      <div style={styles.scoreboard}>
        <div style={styles.team}>
          <div style={styles.teamName}>{matchup.home_team_name}</div>
          <div style={styles.totalScore}>{matchup.homeScore.toFixed(1)}</div>
        </div>
        <div style={styles.middle}>
          <div style={styles.eventName}>{matchup.event_name}</div>
          {matchup.event_status === 'live' && <div style={styles.liveBadge}>LIVE</div>}
          <div style={styles.vs}>VS</div>
        </div>
        <div style={[styles.team, styles.awayTeam] as any}>
          <div style={styles.teamName}>{matchup.away_team_name}</div>
          <div style={styles.totalScore}>{matchup.awayScore.toFixed(1)}</div>
        </div>
      </div>

      <div style={styles.rosters}>
        <div style={styles.rosterCol}>
          {homeScores.map((s: any) => (
            <div key={s.fighter_id} style={styles.scoreRow}>
              <span style={styles.fighterName}>{s.first_name} {s.last_name}</span>
              <span style={styles.pts}>{s.total_points?.toFixed(1) ?? '--'}</span>
            </div>
          ))}
        </div>
        <div style={[styles.rosterCol, styles.awayCol] as any}>
          {awayScores.map((s: any) => (
            <div key={s.fighter_id} style={[styles.scoreRow, styles.awayRow] as any}>
              <span style={styles.pts}>{s.total_points?.toFixed(1) ?? '--'}</span>
              <span style={styles.fighterName}>{s.first_name} {s.last_name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  center: { color: '#888', padding: 40, textAlign: 'center', marginTop: 80 },
  scoreboard: {
    background: '#111', borderBottom: '1px solid #333',
    padding: '32px 40px', display: 'flex', alignItems: 'center',
  },
  team: { flex: 1 },
  awayTeam: { textAlign: 'right' },
  teamName: { color: '#888', fontSize: 14, marginBottom: 6 },
  totalScore: { color: '#fff', fontSize: 64, fontWeight: 800, lineHeight: 1 },
  middle: { textAlign: 'center', padding: '0 32px' },
  eventName: { color: '#666', fontSize: 12, marginBottom: 6 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, marginBottom: 8, display: 'inline-block' },
  vs: { color: '#444', fontWeight: 700, fontSize: 20 },
  rosters: { display: 'flex', padding: 24, gap: 16 },
  rosterCol: { flex: 1 },
  awayCol: {},
  scoreRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1a1a1a' },
  awayRow: { flexDirection: 'row-reverse' },
  fighterName: { color: '#ddd', fontSize: 14 },
  pts: { color: '#c8102e', fontWeight: 700, fontSize: 16 },
};
