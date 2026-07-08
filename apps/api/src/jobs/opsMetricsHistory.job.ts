import cron from 'node-cron';
import { db } from '../config/database';
import { getOpsMetrics } from '../services/opsMetrics.service';

// Snapshots a curated set of numeric ops metrics into ops_metrics_history for the admin
// dashboard trend graphs. Runs hourly and prunes anything older than 90 days.
export function startOpsMetricsHistoryJob() {
  cron.schedule('5 * * * *', () => snapshotOpsMetrics().catch(console.error), { timezone: 'UTC' });
  // Take one snapshot shortly after boot so the graphs aren't empty until the first tick.
  setTimeout(() => snapshotOpsMetrics().catch(console.error), 30_000);
}

export async function snapshotOpsMetrics(): Promise<void> {
  try {
    const m = await getOpsMetrics();
    const railwayUsage = (m.railway?.data as any)?.usage ?? [];
    const railwayVal = (name: string) =>
      railwayUsage.find((u: any) => u.measurement === name)?.value ?? null;

    const points: Record<string, number | null> = {
      odds_remaining: m.odds?.remaining ?? null,
      odds_used: m.odds?.used ?? null,
      db_size_mb: (m.supabase?.data as any)?.dbSizeMb ?? null,
      users: m.app?.users ?? null,
      active_members: m.app?.activeMembers ?? null,
      leagues: Object.values(m.app?.leaguesByStatus ?? {}).reduce((a, b) => a + b, 0),
      railway_memory: railwayVal('MEMORY_USAGE_GB'),
      railway_cpu: railwayVal('CPU_USAGE'),
    };

    const entries = Object.entries(points).filter(([, v]) => typeof v === 'number');
    if (entries.length) {
      const values: any[] = [];
      const tuples = entries
        .map(([metric, v], i) => {
          values.push(metric, v);
          return `($${i * 2 + 1}, $${i * 2 + 2})`;
        })
        .join(', ');
      await db.query(`INSERT INTO ops_metrics_history (metric, value) VALUES ${tuples}`, values);
    }

    await db.query(
      `DELETE FROM ops_metrics_history WHERE captured_at < now() - interval '90 days'`,
    );
  } catch (err) {
    console.error('[OpsMetricsHistory] snapshot failed:', err);
  }
}
