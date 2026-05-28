import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { LoadingScreen } from '../components/LoadingScreen';

const METHOD_SHORT: Record<string, string> = {
  ko_tko: 'KO', submission: 'SUB', decision: 'DEC',
  decision_unanimous: 'DEC', decision_split: 'DEC', decision_majority: 'DEC',
  disqualification: 'DQ',
};

export function PicksComparisonPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ['picks-all', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}/all`),
    enabled: !!currentEvent?.id,
    refetchInterval: (query) => query.state.data?.event?.status === 'live' ? 30_000 : false,
  });

  if (!currentEvent) {
    return (
      <div style={styles.page}>
        <nav style={styles.nav}>
          <Link to={`/league/${leagueId}/picks`} style={styles.back}>← Picks</Link>
          <span style={styles.title}>Pick Comparison</span>
        </nav>
        <div style={styles.empty}>No upcoming event scheduled.</div>
      </div>
    );
  }

  if (isLoading || !data) return <LoadingScreen />;

  const { event, members, fights, championPicks } = data;
  const isLive = event.status === 'live';
  const isCompleted = event.status === 'completed';
  const isCommissioner = session?.user.id === league?.commissionerId;

  if (!isCommissioner && !isLive && !isCompleted) {
    return (
      <div style={styles.page}>
        <nav style={styles.nav}>
          <Link to={`/league/${leagueId}/picks`} style={styles.back}>← Picks</Link>
          <span style={styles.title}>Pick Comparison</span>
        </nav>
        <div style={styles.empty}>Pick comparison is only available once the event starts.</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}/picks`} style={styles.back}>← Picks</Link>
        <span style={styles.title}>Pick Comparison</span>
        {isLive && <span style={styles.liveBadge}>LIVE</span>}
      </nav>

      <div style={styles.header}>
        <div style={styles.eventName}>{event.name}</div>
        <div style={styles.eventDate}>
          {new Date(event.scheduledAt).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          })}
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, ...styles.fightCol }}>Fight</th>
              {members.map((m: any) => (
                <th key={m.id} style={styles.th}>
                  <div style={styles.memberName}>{m.teamName}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fights.map((fight: any, i: number) => {
              const winnerId = fight.resultWinnerId;
              return (
                <tr key={fight.id} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                  <td style={{ ...styles.td, ...styles.fightCol }}>
                    {fight.isTitleFight && <div style={styles.beltTag}>TITLE</div>}
                    <div style={styles.fightName}>
                      <span style={styles.red}>{fight.redLastName}</span>
                      <span style={styles.vs}>v</span>
                      <span style={styles.blue}>{fight.blueLastName}</span>
                    </div>
                    <div style={styles.fightMeta}>{fight.weightClassName}</div>
                  </td>
                  {members.map((m: any) => {
                    const pick = fight.picks[m.id];
                    if (!pick) {
                      return <td key={m.id} style={{ ...styles.td, ...styles.noPick }}>—</td>;
                    }
                    const pickedRed = pick.pickedFighterId === fight.redFighterId;
                    const method = METHOD_SHORT[pick.pickedMethod] ?? pick.pickedMethod;
                    const isCorrect = pick.isCorrect === true;
                    const isWrong = pick.isCorrect === false;
                    const isResolved = isCompleted || (isLive && winnerId);

                    return (
                      <td
                        key={m.id}
                        style={{
                          ...styles.td,
                          ...styles.pickCell,
                          ...(isCorrect ? styles.correct : {}),
                          ...(isWrong ? styles.wrong : {}),
                          ...(!isResolved && pickedRed ? styles.pickedRed : {}),
                          ...(!isResolved && !pickedRed ? styles.pickedBlue : {}),
                        }}
                      >
                        <div style={styles.pickedName}>
                          {pickedRed ? fight.redLastName : fight.blueLastName}
                        </div>
                        <div style={styles.pickedMethod}>{method}</div>
                        {isCorrect && pick.pointsEarned != null && (
                          <div style={styles.pts}>+{(+pick.pointsEarned).toFixed(0)}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Champion pick row */}
            <tr style={styles.champRow}>
              <td style={{ ...styles.td, ...styles.fightCol }}>
                <div style={styles.champRowLabel}>★ Champion</div>
                <div style={styles.champRowSub}>+30 pts if they win</div>
              </td>
              {members.map((m: any) => {
                const cp = championPicks?.[m.id];
                if (!cp) return <td key={m.id} style={{ ...styles.td, ...styles.noPick }}>—</td>;
                const won = cp.pointsEarned > 0;
                const pending = cp.resultWinnerId === null;
                const resolved = isCompleted || (isLive && cp.resultWinnerId !== null);
                return (
                  <td key={m.id} style={{
                    ...styles.td,
                    ...(resolved && won ? styles.champCorrect : {}),
                    ...(resolved && !won ? styles.champWrong : {}),
                  }}>
                    <div style={styles.champName}>{cp.firstName} {cp.lastName}</div>
                    {resolved
                      ? won
                        ? <div style={styles.champPts}>+30</div>
                        : <div style={styles.champMiss}>✗</div>
                      : pending && <div style={styles.champPending}>—</div>
                    }
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {(isLive || isCompleted) && (
        <div style={styles.totalsRow}>
          <div style={styles.totalsLabel}>Event Points</div>
          {members.map((m: any) => {
            const pickPts = fights.reduce((sum: number, f: any) => {
              const p = f.picks[m.id];
              return sum + (p?.pointsEarned ? +p.pointsEarned : 0);
            }, 0);
            const champPts = championPicks?.[m.id]?.pointsEarned ? +championPicks[m.id].pointsEarned : 0;
            const total = pickPts + champPts;
            const correct = fights.filter((f: any) => f.picks[m.id]?.isCorrect === true).length;
            return (
              <div key={m.id} style={styles.totalsCell}>
                <div style={styles.totalsPts}>{total.toFixed(0)}</div>
                <div style={styles.totalsCorrect}>{correct}/{fights.length} correct</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  header: { background: '#111', borderBottom: '1px solid #1a1a1a', padding: '20px 24px' },
  eventName: { color: '#fff', fontSize: 18, fontWeight: 700 },
  eventDate: { color: '#666', fontSize: 14, marginTop: 4 },
  empty: { color: '#555', textAlign: 'center', padding: 60, fontSize: 14 },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 500 },
  th: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid #222', whiteSpace: 'nowrap' },
  fightCol: { textAlign: 'left', minWidth: 160 },
  memberName: { color: '#aaa', fontSize: 12, fontWeight: 700 },
  td: { padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' },
  rowEven: { background: '#0f0f0f' },
  rowOdd: { background: '#0a0a0a' },
  fightName: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 },
  fightMeta: { color: '#444', fontSize: 12, marginTop: 3 },
  beltTag: { color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 },
  red: { color: '#c8102e' },
  blue: { color: '#4488cc' },
  vs: { color: '#333', fontSize: 12 },
  noPick: { color: '#333', fontSize: 18 },
  pickCell: { borderRadius: 4 },
  pickedRed: { background: '#1a0808' },
  pickedBlue: { background: '#080d1a' },
  correct: { background: '#0a1a0a' },
  wrong: { background: '#1a0808', opacity: 0.6 },
  pickedName: { color: '#ddd', fontSize: 14, fontWeight: 700 },
  pickedMethod: { color: '#666', fontSize: 12, marginTop: 2 },
  pts: { color: '#4caf50', fontSize: 12, fontWeight: 700, marginTop: 3 },
  champRow: { borderTop: '2px solid #222', background: '#0d0d00' },
  champRowLabel: { color: '#ffd700', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 },
  champRowSub: { color: '#555', fontSize: 10, marginTop: 2 },
  champName: { color: '#ddd', fontSize: 14, fontWeight: 700 },
  champPts: { color: '#4caf50', fontSize: 14, fontWeight: 700, marginTop: 3 },
  champMiss: { color: '#ff5252', fontSize: 14, fontWeight: 700, marginTop: 3 },
  champPending: { color: '#555', fontSize: 12, marginTop: 3 },
  champCorrect: { background: '#0a1a0a' },
  champWrong: { background: '#1a0808', opacity: 0.6 },
  totalsRow: { display: 'flex', alignItems: 'stretch', borderTop: '2px solid #222', background: '#111', padding: '16px 24px', gap: 0 },
  totalsLabel: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: '0 0 160px', display: 'flex', alignItems: 'center' },
  totalsCell: { flex: 1, textAlign: 'center' },
  totalsPts: { color: '#c8102e', fontSize: 20, fontWeight: 700 },
  totalsCorrect: { color: '#555', fontSize: 12, marginTop: 2 },
};
