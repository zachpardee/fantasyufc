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

  const { data: homeRoster = [] } = useQuery<any[]>({
    queryKey: ['roster-member', leagueId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster/${matchup!.homeTeamId}`),
    enabled: !!matchup?.homeTeamId,
  });

  const { data: awayRoster = [] } = useQuery<any[]>({
    queryKey: ['roster-member', leagueId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster/${matchup!.awayTeamId}`),
    enabled: !!matchup?.awayTeamId,
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

  // Build a score lookup keyed by fighterId for overlay when event has scored
  const scoreByFighterId: Record<string, any> = {};
  for (const s of (matchup.scores ?? [])) {
    scoreByFighterId[s.fighterId] = s;
  }

  const isLive = matchup.eventStatus === 'live';
  const isCompleted = matchup.eventStatus === 'completed';

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>{matchup.eventName}</span>
        {isLive && <span style={styles.liveBadge}>LIVE</span>}
      </nav>

      <div style={styles.scoreboard}>
        <div style={styles.teamBlock}>
          <div style={styles.teamName}>{matchup.homeTeamName}</div>
          <div style={styles.totalScore}>{(+matchup.homeScore).toFixed(1)}</div>
        </div>
        <div style={styles.vsBlock}>
          <div style={styles.vs}>VS</div>
          {isCompleted && <div style={styles.finalTag}>FINAL</div>}
        </div>
        <div style={{ ...styles.teamBlock, alignItems: 'flex-end' }}>
          <div style={styles.teamName}>{matchup.awayTeamName}</div>
          <div style={styles.totalScore}>{(+matchup.awayScore).toFixed(1)}</div>
        </div>
      </div>

      <div style={styles.rosters}>
        <RosterColumn
          label={matchup.homeTeamName}
          fighters={homeRoster}
          scoreByFighterId={scoreByFighterId}
          align="left"
        />
        <div style={styles.divider} />
        <RosterColumn
          label={matchup.awayTeamName}
          fighters={awayRoster}
          scoreByFighterId={scoreByFighterId}
          align="right"
        />
      </div>
    </div>
  );
}

function RosterColumn({ label, fighters, scoreByFighterId, align }: {
  label: string;
  fighters: any[];
  scoreByFighterId: Record<string, any>;
  align: 'left' | 'right';
}) {
  const starters = fighters.filter((f) => f.slotType === 'starter');
  const bench = fighters.filter((f) => f.slotType === 'bench');

  return (
    <div style={{ ...styles.rosterCol, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <p style={{ ...styles.rosterHeader, textAlign: align }}>{label}</p>

      {starters.length === 0 && bench.length === 0 && (
        <p style={styles.empty}>No fighters</p>
      )}

      {starters.length > 0 && (
        <>
          <p style={{ ...styles.slotLabel, textAlign: align }}>Starters</p>
          {starters.map((f) => (
            <FighterScoreRow
              key={f.id}
              fighter={f}
              score={scoreByFighterId[f.fighterId]}
              align={align}
            />
          ))}
        </>
      )}

      {bench.length > 0 && (
        <>
          <p style={{ ...styles.slotLabel, textAlign: align, marginTop: 16 }}>Bench</p>
          {bench.map((f) => (
            <FighterScoreRow
              key={f.id}
              fighter={f}
              score={scoreByFighterId[f.fighterId]}
              align={align}
              isBench
            />
          ))}
        </>
      )}
    </div>
  );
}

function FighterScoreRow({ fighter, score, align, isBench }: {
  fighter: any;
  score?: any;
  align: 'left' | 'right';
  isBench?: boolean;
}) {
  const pts = score?.totalPoints != null ? (+score.totalPoints).toFixed(1) : null;

  return (
    <div style={{
      ...styles.scoreRow,
      flexDirection: align === 'right' ? 'row-reverse' : 'row',
      opacity: isBench ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
          <span style={styles.fighterName}>{fighter.firstName} {fighter.lastName}</span>
          {fighter.isChampion
            ? <span style={styles.rankChamp}>C</span>
            : fighter.ranking
            ? <span style={styles.rankBadge}>#{fighter.ranking}</span>
            : null}
        </div>
        <span style={styles.meta}>{fighter.weightClassName}</span>
      </div>
      <span style={pts != null ? styles.pts : styles.ptsEmpty}>{pts ?? '--'}</span>
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
  vsBlock: { padding: '0 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  vs: { color: '#444', fontWeight: 700, fontSize: 20 },
  finalTag: { color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  rosters: { display: 'flex', padding: 24, gap: 0 },
  rosterCol: { flex: 1, display: 'flex', flexDirection: 'column', padding: '0 16px' },
  rosterHeader: { color: '#888', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', width: '100%' },
  slotLabel: { color: '#444', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px', width: '100%' },
  divider: { width: 1, background: '#1a1a1a', alignSelf: 'stretch', margin: '0 4px' },
  empty: { color: '#444', fontSize: 13, fontStyle: 'italic' },
  scoreRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #111', width: '100%',
  },
  fighterName: { color: '#ddd', fontSize: 14, fontWeight: 600 },
  rankBadge: { color: '#c8102e', fontSize: 11, fontWeight: 700 },
  rankChamp: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3 },
  meta: { color: '#555', fontSize: 11, marginTop: 2 },
  pts: { color: '#c8102e', fontWeight: 700, fontSize: 16, minWidth: 40, textAlign: 'center' },
  ptsEmpty: { color: '#333', fontWeight: 700, fontSize: 14, minWidth: 40, textAlign: 'center' },
};
