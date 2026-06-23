import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { Fighter } from '@fantasy-ufc/shared';

export function FighterBrowserPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [weightClass, setWeightClass] = useState('');
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);

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

  const weightClasses = [
    'heavyweight',
    'light-heavyweight',
    'middleweight',
    'welterweight',
    'lightweight',
    'featherweight',
    'bantamweight',
    'flyweight',
  ];

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <button style={styles.back} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <span style={styles.title}>Fighters</span>
      </nav>
      <div style={styles.filters}>
        <input
          style={styles.search}
          placeholder="Search fighters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={styles.select}
          value={weightClass}
          onChange={(e) => setWeightClass(e.target.value)}
        >
          <option value="">All Divisions</option>
          {weightClasses.map((wc) => (
            <option key={wc} value={wc}>
              {wc.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      <div style={{ padding: '0 24px' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['#', 'Fighter', 'Division', 'Record', 'Avg Pts'].map((h) => (
                <th key={h} style={styles.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fighters?.map((f) => (
              <tr key={f.id} style={styles.row}>
                <td style={styles.td}>
                  <span style={styles.ranking}>{f.ranking ? `#${f.ranking}` : 'NR'}</span>
                </td>
                <td style={styles.td}>
                  <div style={styles.nameRow}>
                    {(f as any).imageUrl && (
                      <div
                        style={{
                          width: 36,
                          height: 40,
                          borderRadius: 4,
                          overflow: 'hidden',
                          flexShrink: 0,
                          background: '#222',
                          cursor: 'zoom-in',
                        }}
                        onClick={() =>
                          setZoomedImage({
                            url: (f as any).imageUrl,
                            name: `${f.firstName} ${f.lastName}`,
                          })
                        }
                      >
                        <img
                          src={(f as any).imageUrl}
                          alt={`${f.firstName} ${f.lastName}`}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'top center',
                          }}
                        />
                      </div>
                    )}
                    {f.isChampion && <span style={styles.champ}>C</span>}
                    <div>
                      <span style={styles.name}>
                        {f.firstName} {f.lastName}
                      </span>
                      {f.nickname && <div style={styles.nickname}>"{f.nickname}"</div>}
                    </div>
                  </div>
                </td>
                <td style={styles.td}>
                  <span style={styles.division}>{f.weightClassName}</span>
                </td>
                <td style={styles.td}>
                  <span style={styles.record}>
                    {f.record.wins}-{f.record.losses}-{f.record.draws}
                  </span>
                </td>
                <td style={styles.td}>
                  <span style={styles.avgPts}>{f.averageFantasyPoints?.toFixed(1) ?? '--'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {zoomedImage && (
        <div style={styles.lightboxOverlay} onClick={() => setZoomedImage(null)}>
          <img
            src={zoomedImage.url}
            alt={zoomedImage.name}
            style={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    background: 'rgba(17,17,17,0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid #222',
    padding: '8px 20px',
    minHeight: 52,
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  back: {
    background: 'none',
    border: 'none',
    color: '#c8102e',
    fontSize: 14,
    cursor: 'pointer',
    padding: 0,
  },
  title: { color: '#fff', fontWeight: 700, fontSize: 18 },
  filters: { display: 'flex', gap: 12, margin: '20px 24px' },
  search: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    flex: 1,
    maxWidth: 320,
  },
  select: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    color: '#555',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    padding: '10px 14px',
    textAlign: 'left',
    borderBottom: '1px solid #222',
  },
  row: { borderBottom: '1px solid #1a1a1a' },
  td: { padding: '12px 14px' },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  champ: {
    background: '#2a2400',
    color: '#ffd700',
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 3,
  },
  name: { color: '#fff', fontWeight: 600, fontSize: 14 },
  nickname: { color: '#666', fontSize: 12, marginTop: 2 },
  division: { color: '#888', fontSize: 14 },
  record: { color: '#aaa', fontSize: 14, fontFamily: 'monospace' },
  avgPts: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  lightboxOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'zoom-out',
  },
  lightboxImg: {
    maxHeight: '85vh',
    maxWidth: '90vw',
    borderRadius: 8,
    objectFit: 'contain',
    objectPosition: 'top center',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  },
};
