-- Add playoff bracket columns to matchups
ALTER TABLE matchups
  ADD COLUMN IF NOT EXISTS playoff_round VARCHAR(10) CHECK (playoff_round IN ('semis', 'finals')),
  ADD COLUMN IF NOT EXISTS home_seed     SMALLINT,
  ADD COLUMN IF NOT EXISTS away_seed     SMALLINT;

-- Add champion flag to league_members
ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS is_champion BOOLEAN NOT NULL DEFAULT FALSE;

-- Extend leagues.status enum to include 'playoffs'
ALTER TYPE league_status ADD VALUE IF NOT EXISTS 'playoffs';
