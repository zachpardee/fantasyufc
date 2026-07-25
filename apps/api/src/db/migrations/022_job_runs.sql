-- One row per background job, upserted on every run — powers the admin Jobs
-- freshness card. A stale last_run_at means the cron silently died.
CREATE TABLE IF NOT EXISTS job_runs (
  job_name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL,
  last_ok_at timestamptz,
  last_status text,
  detail text
);
