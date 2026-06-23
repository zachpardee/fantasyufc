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

  const { data: history } = useQuery<Record<string, { t: string; v: number }[]>>({
    queryKey: ['admin-history'],
    queryFn: () => apiClient.get('/admin/history?days=30'),
    enabled: !!me?.isAdmin,
    refetchInterval: 5 * 60_000,
  });
  const series = (metric: string) => (history?.[metric] ?? []).map((p) => p.v);

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
                      <Trend label="Remaining · 30d" points={series('odds_remaining')} />
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
              <Trend label="Users · 30d" points={series('users')} color="#4caf50" />
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
                <RailwayView data={data.railway?.data} memSeries={series('railway_memory')} />
              )}
            </Card>

            {/* Supabase */}
            <Card title="Supabase">
              <SupabaseView data={data.supabase?.data} sizeSeries={series('db_size_mb')} />
              {data.supabase?.error && <ErrorText>{data.supabase.error}</ErrorText>}
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
const RAILWAY_LABELS: Record<string, string> = {
  CPU_USAGE: 'CPU',
  MEMORY_USAGE_GB: 'Memory',
  NETWORK_TX_GB: 'Network out',
  DISK_USAGE_GB: 'Disk',
};

function RailwayView({ data, memSeries }: { data: any; memSeries: number[] }) {
  if (!data) return <Muted>No data</Muted>;
  return (
    <>
      {data.plan && <Row label="Plan" value={data.plan} />}
      {data.includedUsageDollars != null && (
        <Row label="Included usage" value={`$${data.includedUsageDollars}`} />
      )}
      {(data.usage ?? []).length > 0 && <div style={s.subLabel}>Est. usage this period</div>}
      {(data.usage ?? []).map((u: any) => (
        <Row
          key={u.measurement}
          label={RAILWAY_LABELS[u.measurement] ?? u.measurement}
          value={Number(u.value).toFixed(u.value < 10 ? 2 : 0)}
        />
      ))}
      <Trend label="Memory · 30d" points={memSeries} color="#e0a000" />
      <Muted>Exact credits → Railway dashboard ↓</Muted>
    </>
  );
}

function SupabaseView({ data, sizeSeries }: { data: any; sizeSeries: number[] }) {
  if (!data) return <Muted>No data</Muted>;
  return (
    <>
      {data.dbSizeMb != null && (
        <>
          <Row
            label="DB size"
            value={`${Number(data.dbSizeMb).toFixed(1)} / ${data.dbLimitMb} MB`}
          />
          <Bar value={data.dbSizeMb} max={data.dbLimitMb} dangerHigh />
        </>
      )}
      <Trend label="DB size · 30d" points={sizeSeries} color="#3b6cff" />
      {data.status && <Row label="Status" value={data.status} />}
      {data.region && <Row label="Region" value={data.region} />}
      {data.pgVersion && <Row label="Postgres" value={data.pgVersion} />}
    </>
  );
}

// Inline SVG sparkline with a small label. Hidden until there are at least 2 points.
function Trend({
  label,
  points,
  color = '#c8102e',
}: {
  label: string;
  points: number[];
  color?: string;
}) {
  if (!points || points.length < 2) return null;
  const h = 30;
  const w = 100;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${(i * step).toFixed(2)},${(h - ((p - min) / range) * h).toFixed(2)}`)
    .join(' ');
  return (
    <div style={{ marginTop: 8 }}>
      <div style={s.subLabel}>{label}</div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: h, display: 'block' }}
      >
        <polyline
          points={path}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
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
  subLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    margin: '8px 0 2px',
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
