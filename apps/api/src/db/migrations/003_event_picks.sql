-- Event picks: users select a winner for each fight before the event starts
CREATE TABLE IF NOT EXISTS event_picks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id         UUID NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  fight_id          UUID NOT NULL REFERENCES fights(id) ON DELETE CASCADE,
  picked_fighter_id UUID NOT NULL REFERENCES fighters(id),
  picked_method     VARCHAR(20),       -- ko_tko | submission | decision | disqualification (optional bonus)
  is_correct        BOOLEAN,           -- NULL until fight completes
  points_earned     NUMERIC(8,2) NOT NULL DEFAULT 0,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, member_id, fight_id)
);
CREATE INDEX IF NOT EXISTS idx_event_picks_league_member ON event_picks(league_id, member_id);
CREATE INDEX IF NOT EXISTS idx_event_picks_fight ON event_picks(fight_id);

-- Perfect card bonus: all picks correct on an event → (n-3) × 100 pts season bonus
CREATE TABLE IF NOT EXISTS perfect_card_bonuses (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id      UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES ufc_events(id),
  fights_correct INT NOT NULL,
  points_awarded NUMERIC(8,2) NOT NULL,
  awarded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, member_id, event_id)
);

-- Season bonus: 250 pts added to total_points when a drafted fighter wins
CREATE TABLE IF NOT EXISTS roster_win_bonuses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id        UUID NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  fighter_id       UUID NOT NULL REFERENCES fighters(id),
  fight_result_id  UUID NOT NULL REFERENCES fight_results(id),
  points_awarded   NUMERIC(8,2) NOT NULL DEFAULT 250,
  awarded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, member_id, fight_result_id)
);
