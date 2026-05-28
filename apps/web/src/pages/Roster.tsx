import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { LoadingInline } from '../components/LoadingScreen';

export function RosterPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: fighters, isLoading } = useQuery<any[]>({
    queryKey: ['roster', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster`),
  });

  const all = fighters ?? [];
  const isEmpty = !isLoading && fighters !== undefined && all.length === 0;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>My Roster</span>
      </nav>

      <div style={styles.body}>
        {isLoading && <LoadingInline label="Loading roster..." />}

        {isEmpty && (
          <div style={styles.empty}>
            <div style={styles.emptyTitle}>Your roster is empty</div>
            <div style={styles.emptyMeta}>Fighters will appear here after the draft.</div>
          </div>
        )}

        {!isEmpty && !isLoading && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Roster <span style={styles.count}>{all.length}</span></h2>
            {all.map((f) => <FighterRow key={f.id} fighter={f} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function FighterAvatar({ imageUrl, firstName, lastName }: { imageUrl?: string; firstName: string; lastName: string }) {
  if (imageUrl) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', flexShrink: 0, background: '#222' }}>
        <img src={imageUrl} alt={`${firstName} ${lastName}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
      </div>
    );
  }
  const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();
  return (
    <div style={{ width: 44, height: 44, borderRadius: 22, background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function FighterRow({ fighter }: { fighter: any }) {
  return (
    <div style={styles.row}>
      <div style={styles.rowLeft}>
        <FighterAvatar imageUrl={fighter.imageUrl} firstName={fighter.firstName} lastName={fighter.lastName} />
        <div>
          <div style={styles.nameRow}>
            <span style={styles.name}>{fighter.firstName} {fighter.lastName}</span>
            {fighter.isChampion
              ? <span style={styles.rankChamp}>C</span>
              : fighter.ranking
              ? <span style={styles.rank}>#{fighter.ranking}</span>
              : <span style={styles.rankNR}>NR</span>}
          </div>
          <div style={styles.meta}>{fighter.weightClassName} · via {fighter.acquiredVia}</div>
          <div style={styles.nextEvent}>
            {fighter.nextEventName
              ? <>{fighter.nextEventName} · {new Date(fighter.nextEventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
              : 'TBD'}
          </div>
        </div>
      </div>
      <div style={styles.rowRight}>
        <span style={styles.avgPts}>{fighter.averageFantasyPoints != null ? (+fighter.averageFantasyPoints).toFixed(1) : '--'} avg pts</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  loading: { color: '#555', fontSize: 14, padding: '40px 0', textAlign: 'center' },
  empty: { padding: '60px 0', textAlign: 'center' },
  emptyTitle: { color: '#666', fontSize: 16, fontWeight: 600, marginBottom: 8 },
  emptyMeta: { color: '#444', fontSize: 14 },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: 700 },
  body: { padding: 24 },
  section: { marginBottom: 32 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: '#333', color: '#aaa', borderRadius: 10, padding: '2px 8px', fontSize: 12 },
  row: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '14px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  name: { color: '#fff', fontSize: 15, fontWeight: 600 },
  rank: { color: '#c8102e', fontSize: 12, fontWeight: 700 },
  rankChamp: { background: '#2a2400', color: '#ffd700', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 },
  rankNR: { color: '#444', fontSize: 12 },
  meta: { color: '#666', fontSize: 12, marginTop: 2 },
  nextEvent: { color: '#555', fontSize: 12, marginTop: 3 },
  rowRight: { display: 'flex', alignItems: 'center', gap: 16 },
  avgPts: { color: '#888', fontSize: 14 },
};
