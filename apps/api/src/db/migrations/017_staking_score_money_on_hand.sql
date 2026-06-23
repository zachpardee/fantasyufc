-- Reverts 016. Staking matchup scores are money-on-hand for the event: start from the
-- weekly budget ($100) and spend down as bets are placed, rise with winnings. Whoever
-- ends the event with the most money wins the matchup. (Adding the budget to both sides
-- never changes who wins — it only reframes the scoreboard from P&L to bankroll.)
UPDATE matchups m
SET home_score = m.home_score + COALESCE(l.weekly_budget, 100),
    away_score = m.away_score + COALESCE(l.weekly_budget, 100)
FROM leagues l
WHERE l.id = m.league_id
  AND l.league_format = 'staking';
