-- Add betting odds columns to fights table (used for underdog bonus scoring and picks display)
ALTER TABLE fights
  ADD COLUMN IF NOT EXISTS red_fighter_odds  SMALLINT,
  ADD COLUMN IF NOT EXISTS blue_fighter_odds SMALLINT;
