import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { LoadingInline } from '../components/LoadingScreen';

const WINDOWS = [7, 30, 90] as const;

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

  const [days, setDays] = useState<number>(30);
  const [showUsers, setShowUsers] = useState(false);
  const qc = useQueryClient();
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const { data: jobs = [] } = useQuery<
    {
      jobName: string;
      lastRunAt: string;
      lastOkAt?: string;
      lastStatus?: string;
      detail?: string;
    }[]
  >({
    queryKey: ['admin-jobs'],
    queryFn: () => apiClient.get('/admin/jobs'),
    enabled: !!me?.isAdmin,
    refetchInterval: 60_000,
  });

  const { data: adminEvents = [] } = useQuery<
    { id: string; name: string; status: string; scheduledAt: string }[]
  >({
    queryKey: ['admin-events'],
    queryFn: () => apiClient.get('/admin/events'),
    enabled: !!me?.isAdmin,
  });

  async function runAction(label: string, fn: () => Promise<any>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActionBusy(true);
    setActionMsg(`${label}…`);
    try {
      const r: any = await fn();
      setActionMsg(`${label}: ${r?.message ?? summarizeActionResult(r)}`);
      qc.invalidateQueries({ queryKey: ['admin-health'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-jobs'] });
    } catch (e: any) {
      setActionMsg(`${label} failed: ${e?.error ?? e?.message ?? String(e)}`);
    } finally {
      setActionBusy(false);
    }
  }

  const { data: health } = useQuery<{
    generatedAt: string;
    checks: { key: string; label: string; status: string; detail: string }[];
  }>({
    queryKey: ['admin-health'],
    queryFn: () => apiClient.get('/admin/health-check'),
    enabled: !!me?.isAdmin,
    refetchInterval: 5 * 60_000,
  });
  const {
    data: users,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery<any[]>({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/admin/users'),
    enabled: !!me?.isAdmin && showUsers,
  });
  const { data: history } = useQuery<Record<string, { t: string; v: number }[]>>({
    queryKey: ['admin-history', days],
    queryFn: () => apiClient.get(`/admin/history?days=${days}`),
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
        <div style={s.headerRight}>
          <div style={s.toggle}>
            {WINDOWS.map((w) => (
              <button
                key={w}
                style={{ ...s.toggleBtn, ...(days === w ? s.toggleBtnActive : {}) }}
                onClick={() => setDays(w)}
              >
                {w}d
              </button>
            ))}
          </div>
          <button style={s.refreshBtn} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
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

          {/* The Odds API — full-width requests & usage banner */}
          <OddsBanner
            odds={data.odds}
            usedHistory={history?.['odds_used']}
            remSeries={series('odds_remaining')}
            usedSeries={series('odds_used')}
            days={days}
          />

          <div style={s.grid}>
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
              <Trend label={`Users · ${days}d`} points={series('users')} color="#4caf50" />
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
                <RailwayView
                  data={data.railway?.data}
                  memSeries={series('railway_memory')}
                  days={days}
                />
              )}
            </Card>

            {/* Supabase */}
            <Card title="Supabase">
              <SupabaseView
                data={data.supabase?.data}
                sizeSeries={series('db_size_mb')}
                days={days}
              />
              {data.supabase?.error && <ErrorText>{data.supabase.error}</ErrorText>}
            </Card>
          </div>
        </>
      ) : null}

      {/* Users */}
      {/* App health — same checks as the Sunday cloud routine, on demand */}
      <h2 style={s.sectionTitle}>Health</h2>
      <div style={s.healthCard}>
        {!health ? (
          <LoadingInline />
        ) : (
          health.checks.map((c) => (
            <div key={c.key} style={s.healthRow}>
              <span style={{ ...s.healthChip, ...HEALTH_CHIP[c.status] }}>
                {c.status.toUpperCase()}
              </span>
              <span style={s.healthLabel}>{c.label}</span>
              <span style={s.healthDetail}>{c.detail}</span>
            </div>
          ))
        )}
      </div>

      {/* Background job freshness */}
      <h2 style={s.sectionTitle}>Jobs</h2>
      <div style={s.healthCard}>
        {jobs.length === 0 ? (
          <Muted>No job runs recorded yet — populates as crons fire after this deploy.</Muted>
        ) : (
          jobs.map((j) => {
            const meta = JOB_META[j.jobName] ?? { label: j.jobName, staleAfterMin: 1560 };
            const ageMin = (Date.now() - new Date(j.lastRunAt).getTime()) / 60_000;
            const stale = ageMin > meta.staleAfterMin;
            const errored = j.lastStatus === 'error';
            const chip = errored ? 'fail' : stale ? 'warn' : 'pass';
            const chipText = errored ? 'ERROR' : stale ? 'STALE' : 'OK';
            return (
              <div key={j.jobName} style={s.healthRow}>
                <span style={{ ...s.healthChip, ...HEALTH_CHIP[chip] }}>{chipText}</span>
                <span style={s.healthLabel}>{meta.label}</span>
                <span style={s.healthDetail}>
                  ran {fmtAgo(ageMin)}
                  {errored && j.detail ? ` — ${j.detail.slice(0, 120)}` : ''}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Manual admin actions (existing API endpoints) */}
      <h2 style={s.sectionTitle}>Actions</h2>
      <div style={s.healthCard}>
        <div style={s.actionRow}>
          <button
            style={s.actionBtn}
            disabled={actionBusy}
            onClick={() => runAction('Sync events', () => apiClient.post('/admin/sync/events'))}
          >
            Sync events
          </button>
          <button
            style={s.actionBtn}
            disabled={actionBusy}
            onClick={() =>
              runAction(
                'Sync fighters',
                () => apiClient.post('/admin/sync/fighters'),
                'Fighter sync takes several minutes and runs in the background. Start it?',
              )
            }
          >
            Sync fighters
          </button>
          <button
            style={s.actionBtn}
            disabled={actionBusy}
            onClick={() => runAction('Auto-schedule', () => apiClient.post('/admin/schedule/auto'))}
          >
            Auto-schedule
          </button>
          <button
            style={{ ...s.actionBtn, ...s.actionBtnDanger }}
            disabled={actionBusy}
            onClick={() =>
              runAction(
                'Deduplicate events',
                () => apiClient.post('/admin/events/deduplicate'),
                'Deletes duplicate event rows sharing a calendar date (keeps the oldest). Continue?',
              )
            }
          >
            Deduplicate events
          </button>
        </div>
        <div style={s.actionRow}>
          <select
            style={s.actionSelect}
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="">Select event…</option>
            {adminEvents.slice(0, 12).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.status})
              </option>
            ))}
          </select>
          <button
            style={s.actionBtn}
            disabled={actionBusy || !selectedEventId}
            onClick={() =>
              runAction('Sync odds', () =>
                apiClient.post(`/admin/events/${selectedEventId}/sync-odds`),
              )
            }
          >
            Sync odds
          </button>
          <button
            style={s.actionBtn}
            disabled={actionBusy || !selectedEventId}
            onClick={() =>
              runAction('Resync fight card', () =>
                apiClient.post(`/admin/events/${selectedEventId}/resync-fights`),
              )
            }
          >
            Resync fight card
          </button>
        </div>
        {actionMsg && <div style={s.actionMsg}>{actionMsg}</div>}
      </div>

      <h2 style={s.sectionTitle}>Users</h2>
      {!showUsers ? (
        <button style={s.refreshBtn} onClick={() => setShowUsers(true)}>
          Show users &amp; emails
        </button>
      ) : usersLoading ? (
        <LoadingInline />
      ) : usersError ? (
        <div style={s.errorBox}>
          Failed to load users: {String((usersError as any)?.message ?? usersError)}
        </div>
      ) : (
        <UsersTable users={users ?? []} />
      )}

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

// Average requests burned per day across the history window. Skipped when the window
// contains a monthly quota reset (used would decrease) or has fewer than 2 points.
function oddsBurnRate(points: { t: string; v: number }[] | undefined): number | null {
  if (!points || points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = (new Date(last.t).getTime() - new Date(first.t).getTime()) / 86_400_000;
  const delta = last.v - first.v;
  if (spanDays <= 0 || delta < 0) return null;
  return delta / spanDays;
}

function OddsBanner({
  odds,
  usedHistory,
  remSeries,
  usedSeries,
  days,
}: {
  odds: any;
  usedHistory: { t: string; v: number }[] | undefined;
  remSeries: number[];
  usedSeries: number[];
  days: number;
}) {
  const used: number | null = odds?.used ?? null;
  const rem: number | null = odds?.remaining ?? null;
  const total = (used ?? 0) + (rem ?? 0);
  const burnRate = oddsBurnRate(usedHistory);
  const runwayDays = burnRate && burnRate > 0 && rem != null ? rem / burnRate : null;

  return (
    <div style={s.banner}>
      <div style={s.cardTitle}>The Odds API — Requests &amp; Usage</div>
      {odds?.configured === false ? (
        <Muted>Not configured — set ODDS_API_KEY.</Muted>
      ) : odds?.error ? (
        <ErrorText>{odds.error}</ErrorText>
      ) : (
        <>
          <div style={s.bannerStats}>
            <div style={s.bannerStat}>
              <div style={s.big}>{rem ?? '—'}</div>
              <div style={s.unit}>requests remaining</div>
            </div>
            <div style={s.bannerStat}>
              <div style={s.bannerStatValue}>{used ?? '—'}</div>
              <div style={s.unit}>used this period</div>
            </div>
            <div style={s.bannerStat}>
              <div style={s.bannerStatValue}>{total > 0 ? total : '—'}</div>
              <div style={s.unit}>monthly cap</div>
            </div>
            <div style={s.bannerStat}>
              <div style={s.bannerStatValue}>{burnRate != null ? burnRate.toFixed(1) : '—'}</div>
              <div style={s.unit}>avg req/day · {days}d</div>
            </div>
            <div style={s.bannerStat}>
              <div style={s.bannerStatValue}>
                {runwayDays != null ? `~${Math.floor(runwayDays)}d` : '—'}
              </div>
              <div style={s.unit}>runway at this rate</div>
            </div>
          </div>
          {total > 0 && used != null && <Bar value={used} max={total} dangerHigh />}
          <div style={s.bannerTrends}>
            <div style={{ flex: 1 }}>
              <Trend label={`Remaining · ${days}d`} points={remSeries} />
            </div>
            <div style={{ flex: 1 }}>
              <Trend label={`Used · ${days}d`} points={usedSeries} color="#e0a000" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const JOB_META: Record<string, { label: string; staleAfterMin: number }> = {
  live_poller: { label: 'Live poller (every 2m)', staleAfterMin: 10 },
  pre_event_prep: { label: 'Pre-event prep (every 4h)', staleAfterMin: 540 },
  event_sync: { label: 'Event sync (daily)', staleAfterMin: 1560 },
  ops_metrics: { label: 'Ops metrics (hourly)', staleAfterMin: 150 },
  auto_schedule: { label: 'Auto-schedule (daily)', staleAfterMin: 1560 },
  fighter_sync: { label: 'Fighter sync (weekly)', staleAfterMin: 11520 },
};

function fmtAgo(min: number): string {
  if (min < 1) return 'just now';
  if (min < 60) return `${Math.round(min)}m ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

function summarizeActionResult(r: any): string {
  if (r == null) return 'done';
  const parts: string[] = [];
  if (r.matched != null) parts.push(`matched ${r.matched}/${r.total}`);
  if (r.requestsRemaining != null) parts.push(`${r.requestsRemaining} odds requests left`);
  if (r.deleted != null) parts.push(`deleted ${r.deleted}`);
  if (r.updated != null) parts.push(`updated ${r.updated}`);
  return parts.length ? parts.join(', ') : 'done';
}

const HEALTH_CHIP: Record<string, React.CSSProperties> = {
  pass: { background: '#153c15', color: '#4caf50' },
  warn: { background: '#3c3208', color: '#e0a000' },
  fail: { background: '#3c1515', color: '#ff5252' },
  skip: { background: '#222', color: '#888' },
};

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

function RailwayView({ data, memSeries, days }: { data: any; memSeries: number[]; days: number }) {
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
      <Trend label={`Memory · ${days}d`} points={memSeries} color="#e0a000" />
      <Muted>Exact credits → Railway dashboard ↓</Muted>
    </>
  );
}

function SupabaseView({
  data,
  sizeSeries,
  days,
}: {
  data: any;
  sizeSeries: number[];
  days: number;
}) {
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
      <Trend label={`DB size · ${days}d`} points={sizeSeries} color="#3b6cff" />
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

function UsersTable({ users }: { users: any[] }) {
  if (!users.length) return <Muted>No users found.</Muted>;
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {['Email', 'Display name', 'Leagues', 'Joined', 'Last sign-in', 'Last seen'].map(
              (h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={s.td}>{u.email ?? '—'}</td>
              <td style={s.td}>{u.displayName ?? '—'}</td>
              <td style={s.td}>
                {(u.memberships ?? []).length
                  ? u.memberships.map((m: any) => (
                      <div key={`${m.leagueName}-${m.teamName}`}>
                        {m.teamName} <span style={{ color: '#666' }}>· {m.leagueName}</span>
                      </div>
                    ))
                  : '—'}
              </td>
              <td style={s.td}>{fmtDate(u.createdAt)}</td>
              <td style={s.td}>{fmtDate(u.lastSignInAt)}</td>
              <td style={s.td}>{fmtDate(u.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ ...s.muted, marginTop: 8 }}>{users.length} registered users</div>
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
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  toggle: {
    display: 'flex',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleBtn: {
    background: 'transparent',
    color: '#888',
    border: 'none',
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  toggleBtnActive: { background: '#c8102e', color: '#fff' },
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
  banner: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  bannerStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px 28px',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  bannerStat: { minWidth: 90 },
  bannerStatValue: { fontSize: 22, fontWeight: 800, color: '#ddd', lineHeight: 1 },
  bannerTrends: { display: 'flex', gap: 20 },
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
  healthCard: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: '8px 16px',
  },
  healthRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    padding: '8px 0',
    borderBottom: '1px solid #1e1e1e',
    flexWrap: 'wrap' as const,
  },
  healthChip: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.5,
    padding: '3px 8px',
    borderRadius: 4,
    minWidth: 40,
    textAlign: 'center' as const,
  },
  healthLabel: { color: '#ddd', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
    padding: '8px 0',
  },
  actionBtn: {
    background: '#1a1a1a',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  actionBtnDanger: { border: '1px solid #c8102e66', color: '#ff8080' },
  actionSelect: {
    background: '#1a1a1a',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    maxWidth: 320,
  },
  actionMsg: { color: '#e0a000', fontSize: 12, padding: '4px 0 8px' },
  healthDetail: { color: '#777', fontSize: 12 },
  tableWrap: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 16,
    overflowX: 'auto',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    color: '#888',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    padding: '6px 12px 8px 0',
    borderBottom: '1px solid #2a2a2a',
    whiteSpace: 'nowrap',
  },
  td: {
    color: '#ddd',
    padding: '8px 12px 8px 0',
    borderBottom: '1px solid #1e1e1e',
    verticalAlign: 'top',
  },
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
