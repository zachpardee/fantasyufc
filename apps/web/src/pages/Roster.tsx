import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { RosterFighter } from '@fantasy-ufc/shared';

export function RosterPage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: fighters, refetch } = useQuery<(RosterFighter & { first_name: string; last_name: string; weight_class_name: string; ranking: number; average_fantasy_points: number; is_champion: boolean })[]>({
    queryKey: ['roster', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster`),
  });

  const dropMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.delete(`/leagues/${leagueId}/roster/${fighterId}`),
    onSuccess: () => refetch(),
  });

  const starters = fighters?.filter((f) => f.slotType === 'starter') ?? [];
  const bench = fighters?.filter((f) => f.slotType === 'bench') ?? [];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>My Roster</h1>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Starters <span style={styles.count}>{starters.length}</span></h2>
        {starters.map((f) => <FighterRow key={f.id} fighter={f} onDrop={() => dropMutation.mutate(f.fighterId)} />)}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Bench <span style={styles.count}>{bench.length}</span></h2>
        {bench.map((f) => <FighterRow key={f.id} fighter={f} onDrop={() => dropMutation.mutate(f.fighterId)} isBench />)}
      </div>
    </div>
  );
}

function FighterRow({ fighter, onDrop }: { fighter: any; onDrop: () => void; isBench?: boolean }) {
  return (
    <div style={styles.row}>
      <div style={styles.rowLeft}>
        {(fighter.isChampion || fighter.is_champion) && <span style={styles.champ}>C</span>}
        <div>
          <div style={styles.name}>{fighter.first_name} {fighter.last_name}</div>
          <div style={styles.meta}>{fighter.weight_class_name} · Acquired via {fighter.acquiredVia}</div>
        </div>
      </div>
      <div style={styles.rowRight}>
        <span style={styles.ranking}>{fighter.ranking ? `#${fighter.ranking}` : 'NR'}</span>
        <span style={styles.avgPts}>{fighter.average_fantasy_points?.toFixed(1) ?? '--'} avg</span>
        <button style={styles.dropBtn} onClick={onDrop}>Drop</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', padding: 24 },
  title: { color: '#fff', fontSize: 24, marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: '#333', color: '#aaa', borderRadius: 10, padding: '2px 8px', fontSize: 11 },
  row: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '14px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  champ: { background: '#2a2400', color: '#ffd700', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 },
  name: { color: '#fff', fontSize: 15, fontWeight: 600 },
  meta: { color: '#666', fontSize: 12, marginTop: 2 },
  rowRight: { display: 'flex', alignItems: 'center', gap: 16 },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 14, minWidth: 32 },
  avgPts: { color: '#888', fontSize: 13 },
  dropBtn: { background: 'transparent', border: '1px solid #444', borderRadius: 5, color: '#888', padding: '5px 12px', cursor: 'pointer', fontSize: 12 },
};
