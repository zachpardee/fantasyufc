import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { Fighter } from '@fantasy-ufc/shared';

export function FighterBrowserPage() {
  const [search, setSearch] = useState('');
  const [weightClass, setWeightClass] = useState('');

  const { data: fighters } = useQuery<(Fighter & { weightClassName: string })[]>({
    queryKey: ['fighters', search, weightClass],
    queryFn: () => {
      const p = new URLSearchParams({ status: 'active' });
      if (search) p.set('search', search);
      if (weightClass) p.set('weightClass', weightClass);
      return apiClient.get(`/fighters?${p}`);
    },
    staleTime: 60_000,
  });

  const weightClasses = ['heavyweight','light-heavyweight','middleweight','welterweight','lightweight','featherweight','bantamweight','flyweight'];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Fighters</h1>
      <div style={styles.filters}>
        <input style={styles.search} placeholder="Search fighters..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={styles.select} value={weightClass} onChange={(e) => setWeightClass(e.target.value)}>
          <option value="">All Divisions</option>
          {weightClasses.map((wc) => (
            <option key={wc} value={wc}>{wc.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>{['#', 'Fighter', 'Division', 'Record', 'Avg Pts'].map((h) => (
            <th key={h} style={styles.th}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {fighters?.map((f) => (
            <tr key={f.id} style={styles.row}>
              <td style={styles.td}>
                <span style={styles.ranking}>{f.ranking ? `#${f.ranking}` : 'NR'}</span>
              </td>
              <td style={styles.td}>
                <div style={styles.nameRow}>
                  {f.isChampion && <span style={styles.champ}>C</span>}
                  <span style={styles.name}>{f.firstName} {f.lastName}</span>
                </div>
                {f.nickname && <div style={styles.nickname}>"{f.nickname}"</div>}
              </td>
              <td style={styles.td}><span style={styles.division}>{f.weightClassName}</span></td>
              <td style={styles.td}><span style={styles.record}>{f.record.wins}-{f.record.losses}-{f.record.draws}</span></td>
              <td style={styles.td}><span style={styles.avgPts}>{f.averageFantasyPoints?.toFixed(1) ?? '--'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', padding: 24 },
  title: { color: '#fff', fontSize: 24, marginBottom: 20 },
  filters: { display: 'flex', gap: 12, marginBottom: 20 },
  search: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', flex: 1, maxWidth: 320 },
  select: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #222' },
  row: { borderBottom: '1px solid #1a1a1a' },
  td: { padding: '12px 14px' },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  champ: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3 },
  name: { color: '#fff', fontWeight: 600, fontSize: 14 },
  nickname: { color: '#666', fontSize: 12, marginTop: 2 },
  division: { color: '#888', fontSize: 13 },
  record: { color: '#aaa', fontSize: 13, fontFamily: 'monospace' },
  avgPts: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
};
