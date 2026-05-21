import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { League, Matchup } from '@fantasy-ufc/shared';

export function LeagueHomePage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: matchup } = useQuery<(Matchup & { home_team_name: string; away_team_name: string }) | null>({
    queryKey: ['matchup-current', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/current`),
  });

  if (!league) return <div style={styles.loading}>Loading...</div>;

  const navLinks = [
    { label: 'My Roster', path: 'roster', icon: '👊' },
    { label: 'Matchup', path: 'matchup', icon: '⚔️' },
    { label: 'Standings', path: 'standings', icon: '📊' },
    { label: 'Trades', path: 'trades', icon: '🤝' },
    { label: 'Draft', path: 'draft', icon: '📋' },
    { label: 'Fighters', path: '/fighters', icon: '🥊', external: true },
  ];

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.back}>← Home</Link>
        <span style={styles.leagueName}>{league.name}</span>
        <span style={styles.inviteCode}>Code: {league.inviteCode}</span>
      </nav>

      {matchup && (
        <div style={styles.matchupBanner}>
          <div style={styles.teamScore}>
            <span style={styles.teamName}>{matchup.home_team_name}</span>
            <span style={styles.score}>{matchup.homeScore.toFixed(1)}</span>
          </div>
          <span style={styles.vs}>VS</span>
          <div style={[styles.teamScore, styles.awayScore] as any}>
            <span style={styles.teamName}>{matchup.away_team_name}</span>
            <span style={styles.score}>{matchup.awayScore.toFixed(1)}</span>
          </div>
          <Link to={`/league/${leagueId}/matchup`} style={styles.matchupLink}>View Matchup →</Link>
        </div>
      )}

      <div style={styles.navGrid}>
        {navLinks.map((item) => (
          <Link
            key={item.label}
            to={item.external ? item.path : `/league/${leagueId}/${item.path}`}
            style={styles.navCard}
          >
            <span style={styles.navIcon}>{item.icon}</span>
            <span style={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
      </div>

      <div style={styles.meta}>
        <span>{league.memberCount} / {league.maxTeams} teams</span>
        <span>Roster: {league.rosterSize} ({league.starterSlots} starters)</span>
        <span>Season {league.seasonYear}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  loading: { color: '#888', padding: 40 },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 20 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  leagueName: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  inviteCode: { color: '#666', fontSize: 13 },
  matchupBanner: {
    background: '#1a1a1a', borderBottom: '1px solid #c8102e33',
    padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24,
  },
  teamScore: { display: 'flex', flexDirection: 'column' as any, gap: 4 },
  awayScore: { alignItems: 'flex-end' },
  teamName: { color: '#888', fontSize: 12 },
  score: { color: '#fff', fontSize: 36, fontWeight: 800 },
  vs: { color: '#555', fontWeight: 700, flex: 1, textAlign: 'center' as any },
  matchupLink: { color: '#c8102e', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginLeft: 'auto' },
  navGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, padding: 24 },
  navCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: 24, textDecoration: 'none', display: 'flex', flexDirection: 'column' as any,
    alignItems: 'center', gap: 12, transition: 'border-color 0.2s',
  },
  navIcon: { fontSize: 32 },
  navLabel: { color: '#fff', fontWeight: 600, fontSize: 14 },
  meta: { padding: '0 24px 24px', display: 'flex', gap: 24, color: '#555', fontSize: 13 },
};
