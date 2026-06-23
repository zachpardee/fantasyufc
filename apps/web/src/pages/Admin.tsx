import { useQuery } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { LoadingInline } from '../components/LoadingScreen';

// External dashboards we can't (or don't) pull via API — one click out to each.
const LINKS: { label: string; url: string; note: string }[] = [
  {
    label: 'Railway',
    url: 'https://railway.com/project/e0af0be5-c875-454e-be75-ef5094946495',
    note: 'API host · credits & usage',
  },
  {
    label: 'Supabase',
    url: 'https://supabase.com/dashboard/project/njrwgieloladyrajglpf',
    note: 'Database · auth · storage',
  },
  {
    label: 'Vercel',
    url: 'https://vercel.com/zach-pardee-s-projects/fantasy-ufc',
    note: 'Web hosting · deploys',
  },
  {
    label: 'The Odds API',
    url: 'https://the-odds-api.com/account/',
    note: 'Odds quota & billing',
  },
];

export function AdminPage() {
  const { data: me, isLoading: meLoading } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => apiClient.get('/auth/me'),
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery<any>({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiClient.get('/admin/dashboard'),
    enabled: !!me?.isAdmin,
    refetchInterval: 60_000,
  });

  if (meLoading) return <LoadingInline />;
  if (!me?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <Link to="/" style={s.back}>
            ← Home
          </Link>
          <h1 style={s.title}>Admin · Ops</h1>
        </div>
        <button style={s.refreshBtn} onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <LoadingInline />
      ) : error ? (
        <div style={s.errorBox}>
          Failed to load metrics: {String((error as any)?.message ?? error)}
        </div>
      ) : data ? (
        <>
          {data.generatedAt && (
            <div style={s.timestamp}>Updated {new Date(data.generatedAt).toLocaleString()}</div>
          )}

          <div style={s.grid}>
            {/* Odds API quota */}
            <Card title="Odds API quota">
              {data.odds?.configured === false ? (
                <Muted>Not configured</Muted>
              ) : data.odds?.error ? (
                <ErrorText>{data.odds.error}</ErrorText>
              ) : (
                (() => {
                  const used = data.odds?.used ?? null;
                  const rem = data.odds?.remaining ?? null;
                  const total = (used ?? 0) + (rem ?? 0);
                  return (
                    <>
                      <Big>{rem ?? '—'}</Big>
                      <Unit>requests remaining</Unit>
                      {total > 0 && used != null && <Bar value={used} max={total} dangerHigh />}
                      <Row label="Used" value={used ?? '—'} />
                      {total > 0 && <Row label="Monthly cap" value={total} />}
                    </>
                  );
                })()
              )}
            </Card>

            {/* App / DB stats */}
            <Card title="App">
              <Row label="Users" value={data.app?.users ?? '—'} />
              <Row label="Active members" value={data.app?.activeMembers ?? '—'} />
              <Row
                label="Leagues"
                value={
                  Object.entries(data.app?.leaguesByStatus ?? {})
                    .map(([k, v]) => `${v} ${k}`)
                    .join(' · ') || '0'
                }
              />
              <StackedBar
                segments={Object.entries(data.app?.leaguesByStatus ?? {}).map(([k, v]) => ({
                  label: k,
                  value: Number(v),
                  color: STATUS_COLORS[k] ?? '#555',
                }))}
              />
              <Row
                label="Events"
                value={`${data.app?.events?.live ?? 0} live · ${data.app?.events?.scheduled ?? 0} sched · ${data.app?.events?.completed ?? 0} done`}
              />
              <StackedBar
                segments={[
                  { label: 'live', value: data.app?.events?.live ?? 0, color: '#c8102e' },
                  { label: 'scheduled', value: data.app?.events?.scheduled ?? 0, color: '#3b6cff' },
                  { label: 'completed', value: data.app?.events?.completed ?? 0, color: '#555' },
                ]}
              />
            </Card>

            {/* Events */}
            <Card title="Events">
              <Row
                label="Next"
                value={
                  data.app?.nextEvent
                    ? `${data.app.nextEvent.name} · ${new Date(data.app.nextEvent.scheduledAt).toLocaleDateString()}`
                    : '—'
                }
              />
              <Row
                label="Last done"
                value={
                  data.app?.lastCompletedEvent
                    ? `${data.app.lastCompletedEvent.name} · ${new Date(data.app.lastCompletedEvent.scheduledAt).toLocaleDateString()}`
                    : '—'
                }
              />
            </Card>

            {/* Railway */}
            <Card title="Railway">
              {data.railway?.configured === false ? (
                <Muted>Set RAILWAY_API_TOKEN to enable. Use the link below for now.</Muted>
              ) : data.railway?.error ? (
                <ErrorText>{data.railway.error}</ErrorText>
              ) : (
                <UsageView data={data.railway?.data} />
              )}
            </Card>

            {/* Supabase */}
            <Card title="Supabase">
              {data.supabase?.configured === false ? (
                <Muted>Set SUPABASE_ACCESS_TOKEN to enable. Use the link below for now.</Muted>
              ) : data.supabase?.error ? (
                <ErrorText>{data.supabase.error}</ErrorText>
              ) : (
                <UsageView data={data.supabase?.data} />
              )}
            </Card>
          </div>
        </>
      ) : null}

      {/* External dashboards */}
      <h2 style={s.sectionTitle}>Dashboards</h2>
      <div style={s.linksRow}>
        {LINKS.map((l) => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer" style={s.linkTile}>
            <div style={s.linkLabel}>{l.label} ↗</div>
            <div style={s.linkNote}>{l.note}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: '#4caf50',
  setup: '#e0a000',
  playoffs: '#3b6cff',
  completed: '#555',
};

// Horizontal progress bar. `dangerHigh` colors it green→amber→red as it fills (for quotas
// you don't want to exhaust); otherwise it's a flat accent fill.
function Bar({ value, max, dangerHigh }: { value: number; max: number; dangerHigh?: boolean }) {
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const color = dangerHigh
    ? frac >= 0.85
      ? '#ff5252'
      : frac >= 0.6
        ? '#e0a000'
        : '#4caf50'
    : '#c8102e';
  return (
    <div style={s.barTrack} title={`${value} / ${max}`}>
      <div style={{ ...s.barFill, width: `${frac * 100}%`, background: color }} />
    </div>
  );
}

// Proportional stacked bar of labeled segments (e.g. leagues/events by status).
function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  if (total <= 0) return null;
  return (
    <div style={s.barTrack}>
      {segments
        .filter((seg) => seg.value > 0)
        .map((seg) => (
          <div
            key={seg.label}
            style={{
              width: `${(seg.value / total) * 100}%`,
              background: seg.color,
              height: '100%',
            }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
    </div>
  );
}

// Renders an external usage payload (Railway/Supabase): any numeric { usage/used, limit/total }
// pairs become bars; everything else falls back to a JSON view.
function UsageView({ data }: { data: unknown }) {
  const rows: { label: string; used: number; limit: number }[] = [];
  const walk = (obj: any, prefix = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') {
        const o = v as any;
        const used = o.usage ?? o.used ?? o.current ?? o.value ?? o.estimatedValue;
        const limit = o.limit ?? o.total ?? o.max ?? o.included ?? o.quota;
        if (typeof used === 'number' && typeof limit === 'number' && limit > 0) {
          rows.push({ label: prefix + k, used, limit });
        } else {
          walk(v, prefix + k + '.');
        }
      }
    }
  };
  try {
    walk(data);
  } catch {
    /* ignore */
  }
  if (rows.length === 0) return <Pre>{JSON.stringify(data, null, 2)}</Pre>;
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 8 }}>
          <Row label={r.label} value={`${r.used} / ${r.limit}`} />
          <Bar value={r.used} max={r.limit} dangerHigh />
        </div>
      ))}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statValue}>{value}</span>
    </div>
  );
}
const Big = ({ children }: { children: React.ReactNode }) => <div style={s.big}>{children}</div>;
const Unit = ({ children }: { children: React.ReactNode }) => <div style={s.unit}>{children}</div>;
const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={s.muted}>{children}</div>
);
const ErrorText = ({ children }: { children: React.ReactNode }) => (
  <div style={s.errorText}>{children}</div>
);
const Pre = ({ children }: { children: React.ReactNode }) => <pre style={s.pre}>{children}</pre>;

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '24px 16px 64px', color: '#fff' },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  back: { color: '#888', fontSize: 13, textDecoration: 'none' },
  title: { fontSize: 24, fontWeight: 800, margin: '4px 0 0' },
  refreshBtn: {
    background: '#1a1a1a',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  timestamp: { color: '#555', fontSize: 12, marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  card: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 16,
    minHeight: 110,
  },
  cardTitle: {
    color: '#c8102e',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  big: { fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1 },
  unit: { color: '#888', fontSize: 12, marginTop: 2, marginBottom: 8 },
  barTrack: {
    display: 'flex',
    width: '100%',
    height: 8,
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: 999,
    overflow: 'hidden',
    margin: '6px 0',
  },
  barFill: { height: '100%', borderRadius: 999, transition: 'width 0.3s' },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    padding: '4px 0',
    fontSize: 13,
  },
  statLabel: { color: '#888' },
  statValue: { color: '#ddd', fontWeight: 600, textAlign: 'right' },
  muted: { color: '#666', fontSize: 13, lineHeight: 1.5 },
  errorText: { color: '#ff5252', fontSize: 12, wordBreak: 'break-word' },
  errorBox: {
    background: '#1a0808',
    border: '1px solid #c8102e44',
    color: '#ff8080',
    borderRadius: 10,
    padding: 16,
    fontSize: 13,
  },
  pre: {
    color: '#9fcaff',
    fontSize: 11,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 160,
    overflow: 'auto',
  },
  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '28px 0 12px' },
  linksRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  linkTile: {
    display: 'block',
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 16,
    textDecoration: 'none',
  },
  linkLabel: { color: '#fff', fontSize: 15, fontWeight: 700 },
  linkNote: { color: '#666', fontSize: 12, marginTop: 4 },
};
