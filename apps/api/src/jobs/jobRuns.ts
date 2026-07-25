import { db } from '../config/database';

// Telemetry must never break a job — swallow all errors.
export async function recordJobRun(job: string, ok: boolean, detail?: string): Promise<void> {
  try {
    await db.query(
      `INSERT INTO job_runs (job_name, last_run_at, last_ok_at, last_status, detail)
       VALUES ($1, now(), CASE WHEN $2 THEN now() END, $3, $4)
       ON CONFLICT (job_name) DO UPDATE SET
         last_run_at = now(),
         last_ok_at = CASE WHEN $2 THEN now() ELSE job_runs.last_ok_at END,
         last_status = $3,
         detail = $4`,
      [job, ok, ok ? 'ok' : 'error', detail ?? null],
    );
  } catch {
    /* ignore */
  }
}

// Wrap a job's main function for cron registration: records success/failure
// and guarantees the rejection is consumed.
export function tracked(job: string, fn: () => Promise<unknown>): () => void {
  return () => {
    fn()
      .then(() => recordJobRun(job, true))
      .catch((err) => {
        console.error(`[${job}]`, err);
        return recordJobRun(job, false, String(err).slice(0, 500));
      });
  };
}
