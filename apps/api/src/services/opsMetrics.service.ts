// Ops metrics for the admin dashboard: app/DB stats, the-odds-api quota, and best-effort
// Railway / Supabase usage (behind env tokens, gracefully degrading when not configured).
import { db } from '../config/database';

export interface OpsMetrics {
  generatedAt: string;
  app: {
    users: number;
    leaguesByStatus: Record<string, number>;
    activeMembers: number;
    events: { live: number; scheduled: number; completed: number };
    nextEvent: { name: string; scheduledAt: string } | null;
    lastCompletedEvent: { name: string; scheduledAt: string } | null;
  };
  odds: {
    configured: boolean;
    remaining: number | null;
    used: number | null;
    error?: string;
  };
  railway: { configured: boolean; data?: unknown; error?: string };
  supabase: { configured: boolean; data?: unknown; error?: string };
}

async function appStats(): Promise<OpsMetrics['app']> {
  const [users, leagues, members, events, nextEvent, lastDone] = await Promise.all([
    db.query(`SELECT count(*)::int AS n FROM user_profiles`),
    db.query(`SELECT status, count(*)::int AS n FROM leagues GROUP BY status`),
    db.query(`SELECT count(*)::int AS n FROM league_members WHERE is_active = true`),
    db.query(`SELECT status, count(*)::int AS n FROM ufc_events GROUP BY status`),
    db.query(
      `SELECT name, scheduled_at FROM ufc_events WHERE status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1`,
    ),
    db.query(
      `SELECT name, scheduled_at FROM ufc_events WHERE status = 'completed' ORDER BY scheduled_at DESC LIMIT 1`,
    ),
  ]);

  const leaguesByStatus: Record<string, number> = {};
  for (const r of leagues.rows) leaguesByStatus[r.status] = r.n;

  const evt = { live: 0, scheduled: 0, completed: 0 } as Record<string, number>;
  for (const r of events.rows) if (r.status in evt) evt[r.status] = r.n;

  return {
    users: users.rows[0].n,
    leaguesByStatus,
    activeMembers: members.rows[0].n,
    events: evt as OpsMetrics['app']['events'],
    nextEvent: nextEvent.rows[0]
      ? { name: nextEvent.rows[0].name, scheduledAt: nextEvent.rows[0].scheduled_at }
      : null,
    lastCompletedEvent: lastDone.rows[0]
      ? { name: lastDone.rows[0].name, scheduledAt: lastDone.rows[0].scheduled_at }
      : null,
  };
}

// The /v4/sports endpoint is free (doesn't consume quota) and returns the usage headers.
async function oddsQuota(): Promise<OpsMetrics['odds']> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { configured: false, remaining: null, used: null };
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return {
        configured: true,
        remaining: null,
        used: null,
        error: `Odds API ${res.status}`,
      };
    }
    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    return {
      configured: true,
      remaining: remaining != null ? Number(remaining) : null,
      used: used != null ? Number(used) : null,
    };
  } catch (err: any) {
    return { configured: true, remaining: null, used: null, error: err?.message ?? 'fetch failed' };
  }
}

// Best-effort Railway usage via the public GraphQL API. Needs RAILWAY_API_TOKEN (and
// optionally RAILWAY_PROJECT_ID). Degrades gracefully — the dashboard also deep-links out.
async function railwayUsage(): Promise<OpsMetrics['railway']> {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) return { configured: false };
  const projectId = process.env.RAILWAY_PROJECT_ID;
  try {
    const query = projectId
      ? `query { project(id: "${projectId}") { name estimatedUsage { estimatedValue measurement } } }`
      : `query { me { email projects { edges { node { id name } } } } }`;
    const res = await fetch('https://backboard.railway.com/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json();
    if (json.errors) return { configured: true, error: JSON.stringify(json.errors) };
    return { configured: true, data: json.data };
  } catch (err: any) {
    return { configured: true, error: err?.message ?? 'fetch failed' };
  }
}

// Best-effort Supabase usage via the Management API. Needs SUPABASE_ACCESS_TOKEN and the
// project ref (SUPABASE_PROJECT_REF, or derived from SUPABASE_URL).
async function supabaseUsage(): Promise<OpsMetrics['supabase']> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return { configured: false };
  const ref =
    process.env.SUPABASE_PROJECT_REF ??
    process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ??
    null;
  if (!ref) return { configured: true, error: 'Could not resolve project ref' };
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/usage`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return {
        configured: true,
        error: `Supabase API ${res.status}: ${await res.text().catch(() => '')}`,
      };
    }
    return { configured: true, data: await res.json() };
  } catch (err: any) {
    return { configured: true, error: err?.message ?? 'fetch failed' };
  }
}

export async function getOpsMetrics(): Promise<OpsMetrics> {
  const [app, odds, railway, supabase] = await Promise.all([
    appStats(),
    oddsQuota(),
    railwayUsage(),
    supabaseUsage(),
  ]);
  return { generatedAt: new Date().toISOString(), app, odds, railway, supabase };
}
