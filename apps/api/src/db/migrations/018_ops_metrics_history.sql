-- Time-series snapshots of ops metrics for the admin dashboard trend graphs.
-- Narrow (metric, value) shape so each metric is an easy-to-query series.
CREATE TABLE IF NOT EXISTS ops_metrics_history (
  id          BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric      TEXT NOT NULL,
  value       DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS ops_metrics_history_metric_time
  ON ops_metrics_history (metric, captured_at);
