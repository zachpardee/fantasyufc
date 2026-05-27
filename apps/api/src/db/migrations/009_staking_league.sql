-- Staking league format support

ALTER TABLE leagues
  ADD COLUMN league_format varchar(20) NOT NULL DEFAULT 'pickem',
  ADD COLUMN weekly_budget integer;

ALTER TABLE league_members
  ADD COLUMN staking_balance numeric(10,2) NOT NULL DEFAULT 0;

-- Single bets (one per fight per member per event)
CREATE TABLE staking_singles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  event_id     uuid        NOT NULL REFERENCES ufc_events(id),
  member_id    uuid        NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  fight_id     uuid        NOT NULL REFERENCES fights(id),
  fighter_id   uuid        NOT NULL REFERENCES fighters(id),
  odds         integer     NOT NULL,
  stake        numeric(10,2) NOT NULL CHECK (stake > 0),
  potential_payout numeric(10,2) NOT NULL,
  actual_payout    numeric(10,2),
  profit_loss      numeric(10,2),
  status       varchar(20) NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, event_id, member_id, fight_id)
);

-- Parlays (one per member per event)
CREATE TABLE staking_parlays (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  event_id         uuid        NOT NULL REFERENCES ufc_events(id),
  member_id        uuid        NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  stake            numeric(10,2) NOT NULL CHECK (stake > 0),
  decimal_odds     numeric(12,4) NOT NULL DEFAULT 1.0,
  potential_payout numeric(10,2) NOT NULL,
  actual_payout    numeric(10,2),
  profit_loss      numeric(10,2),
  status           varchar(20) NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, event_id, member_id)
);

-- Parlay legs
CREATE TABLE staking_parlay_legs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parlay_id    uuid        NOT NULL REFERENCES staking_parlays(id) ON DELETE CASCADE,
  fight_id     uuid        NOT NULL REFERENCES fights(id),
  fighter_id   uuid        NOT NULL REFERENCES fighters(id),
  odds         integer     NOT NULL,
  decimal_odds numeric(8,4) NOT NULL,
  result       varchar(20) NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parlay_id, fight_id)
);

CREATE INDEX idx_staking_singles_member  ON staking_singles (league_id, event_id, member_id);
CREATE INDEX idx_staking_singles_fight   ON staking_singles (fight_id);
CREATE INDEX idx_staking_parlays_member  ON staking_parlays (league_id, event_id, member_id);
CREATE INDEX idx_staking_parlay_legs_fight ON staking_parlay_legs (fight_id);
