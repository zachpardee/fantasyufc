-- Staking matchup scores were stored as (weekly_budget + P&L), starting at 100.
-- Convert them to pure P&L (starting at 0, can be negative) so the scoreboard
-- correctly shows profit/loss rather than an arbitrary budget-offset balance.
UPDATE matchups m
SET home_score = m.home_score - COALESCE(l.weekly_budget, 100),
    away_score = m.away_score - COALESCE(l.weekly_budget, 100)
FROM leagues l
WHERE l.id = m.league_id
  AND l.league_format = 'staking';
