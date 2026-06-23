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
                <>
                  <Big>{data.odds?.remaining ?? '—'}</Big>
                  <Unit>requests remaining</Unit>
                  <Row label="Used" value={data.odds?.used ?? '—'} />
                </>
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
              <Row
                label="Events"
                value={`${data.app?.events?.live ?? 0} live · ${data.app?.events?.scheduled ?? 0} sched · ${data.app?.events?.completed ?? 0} done`}
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
                <Pre>{JSON.stringify(data.railway?.data, null, 2)}</Pre>
              )}
            </Card>

            {/* Supabase */}
            <Card title="Supabase">
              {data.supabase?.configured === false ? (
                <Muted>Set SUPABASE_ACCESS_TOKEN to enable. Use the link below for now.</Muted>
              ) : data.supabase?.error ? (
                <ErrorText>{data.supabase.error}</ErrorText>
              ) : (
                <Pre>{JSON.stringify(data.supabase?.data, null, 2)}</Pre>
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
