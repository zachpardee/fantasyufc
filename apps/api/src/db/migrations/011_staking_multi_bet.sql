-- Allow multiple bets per fight per member (drop the one-bet-per-fight constraint)
ALTER TABLE staking_singles DROP CONSTRAINT IF EXISTS staking_singles_league_id_event_id_member_id_fight_id_key;
