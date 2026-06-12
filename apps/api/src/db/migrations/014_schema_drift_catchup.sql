-- Capture schema that was applied directly to production but never recorded
-- as a migration (discovered when bootstrapping the dev environment):
-- league season/playoff columns, member avatar colors, and the message board.
-- Everything is IF NOT EXISTS so this is a no-op on databases that already
-- have the changes (i.e. production).

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS season_length_months    INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS season_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS playoff_semis_event_id  UUID REFERENCES ufc_events(id),
  ADD COLUMN IF NOT EXISTS playoff_finals_event_id UUID REFERENCES ufc_events(id);

ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#5555ff';

CREATE TABLE IF NOT EXISTS league_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_messages_league_created
  ON league_messages (league_id, created_at DESC);
