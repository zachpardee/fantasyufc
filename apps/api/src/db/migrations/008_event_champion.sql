CREATE TABLE IF NOT EXISTS event_champion_picks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES ufc_events(id) ON DELETE CASCADE,
  fighter_id  UUID NOT NULL REFERENCES fighters(id),
  fight_id    UUID NOT NULL REFERENCES fights(id),
  points_earned NUMERIC(8,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, member_id, event_id)
);
CREATE INDEX idx_event_champion_league_event ON event_champion_picks(league_id, event_id);
