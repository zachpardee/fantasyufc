import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';

export function MatchupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId],
    queryFn: async () => {
      const current = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!current) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${current.id}`);
    },
  });

  useEffect(() => {
    if (!matchup?.id) return;
    const channel = supabase.channel(`matchup:${matchup.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matchup_scores', filter: `matchup_id=eq.${matchup.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchup?.id, refetch]);

  if (!matchup) {
    return (
      <div style={styles.page}>
        <nav style={styles.nav}>
          <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        </nav>
        <div style={styles.center}>No matchup scheduled for the current event.</div>
      </div>
    );
  }

  const homeScores = matchup.scores?.filter((s: any) => s.teamId === matchup.homeTeamId) ?? [];
  const awayScores = matchup.scores?.filter((s: any) => s.teamId === matchup.awayTeamId) ?? [];

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>{matchup.eventName ?? matchup.event_name}</span>
        {(matchup.eventStatus === 'live' || matchup.event_status === 'live') && (
          <span style={styles.liveBadge}>LIVE</span>
        )}
      </nav>

      <div style={styles.scoreboard}>
        <div style={styles.teamBlock}>
          <div style={styles.teamName}>{matchup.homeTeamName ?? matchup.home_team_name}</div>
          <div style={styles.totalScore}>{(+matchup.homeScore).toFixed(1)}</div>
        </div>
        <div style={styles.vsBlock}>
          <div style={styles.vs}>VS</div>
        </div>
        <div style={{ ...styles.teamBlock, alignItems: 'flex-end' }}>
          <div style={styles.teamName}>{matchup.awayTeamName ?? matchup.away_team_name}</div>
          <div style={styles.totalScore}>{(+matchup.awayScore).toFixed(1)}</div>
        </div>
      </div>

      <div style={styles.rosters}>
        <div style={styles.rosterCol}>
          <p style={styles.rosterHeader}>{matchup.homeTeamName ?? matchup.home_team_name}</p>
          {homeScores.length === 0 && <p style={styles.empty}>No fighters yet</p>}
          {homeScores.map((s: any) => (
            <div key={s.fighterId ?? s.fighter_id} style={styles.scoreRow}>
              <span style={styles.fighterName}>{s.firstName ?? s.first_name} {s.lastName ?? s.last_name}</span>
              <span style={styles.pts}>{s.totalPoints != null ? (+s.totalPoints).toFixed(1) : s.total_points != null ? (+s.total_points).toFixed(1) : '--'}</span>
            </div>
          ))}
        </div>

        <div style={styles.divider} />

        <div style={{ ...styles.rosterCol, alignItems: 'flex-end' }}>
          <p style={styles.rosterHeader}>{matchup.awayTeamName ?? matchup.away_team_name}</p>
          {awayScores.length === 0 && <p style={styles.empty}>No fighters yet</p>}
          {awayScores.map((s: any) => (
            <div key={s.fighterId ?? s.fighter_id} style={{ ...styles.scoreRow, flexDirection: 'row-reverse' }}>
              <span style={styles.fighterName}>{s.firstName ?? s.first_name} {s.lastName ?? s.last_name}</span>
              <span style={styles.pts}>{s.totalPoints != null ? (+s.totalPoints).toFixed(1) : s.total_points != null ? (+s.total_points).toFixed(1) : '--'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  navTitle: { color: '#fff', fontWeight: 700, flex: 1 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  center: { color: '#888', padding: 40, textAlign: 'center', marginTop: 80 },
  scoreboard: {
    background: '#111', borderBottom: '1px solid #333',
    padding: '32px 40px', display: 'flex', alignItems: 'center',
  },
  teamBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 },
  teamName: { color: '#888', fontSize: 14 },
  totalScore: { color: '#fff', fontSize: 64, fontWeight: 800, lineHeight: 1 },
  vsBlock: { padding: '0 32px', textAlign: 'center' },
  vs: { color: '#444', fontWeight: 700, fontSize: 20 },
  rosters: { display: 'flex', padding: 24, gap: 16 },
  rosterCol: { flex: 1, display: 'flex', flexDirection: 'column' },
  rosterHeader: { color: '#888', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' },
  divider: { width: 1, background: '#1a1a1a' },
  empty: { color: '#444', fontSize: 13, fontStyle: 'italic' },
  scoreRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #111' },
  fighterName: { color: '#ddd', fontSize: 14 },
  pts: { color: '#c8102e', fontWeight: 700, fontSize: 16 },
};
