-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
CREATE TYPE fight_outcome AS ENUM ('ko_tko','submission','decision_unanimous','decision_split','decision_majority','no_contest','disqualification','draw');
CREATE TYPE fight_result_side AS ENUM ('red','blue');
CREATE TYPE draft_type AS ENUM ('snake','auction');
CREATE TYPE draft_status AS ENUM ('pending','active','paused','completed');
CREATE TYPE pick_status AS ENUM ('pending','picked','auto_picked','skipped');
CREATE TYPE trade_status AS ENUM ('pending','accepted','rejected','cancelled','expired');
CREATE TYPE waiver_status AS ENUM ('pending','processed','approved','denied');
CREATE TYPE roster_slot_type AS ENUM ('starter','bench','ir');
CREATE TYPE league_status AS ENUM ('setup','drafting','active','completed');
CREATE TYPE event_status AS ENUM ('scheduled','live','completed','cancelled');
CREATE TYPE fight_status AS ENUM ('scheduled','live','completed','cancelled');
CREATE TYPE notification_type AS ENUM ('trade_offer','trade_accepted','trade_rejected','waiver_approved','waiver_denied','draft_pick','fight_result','event_starting','matchup_result','league_invite');

-- Weight Classes
CREATE TABLE weight_classes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(50)  NOT NULL UNIQUE,
  slug          VARCHAR(30)  NOT NULL UNIQUE,
  weight_limit_lbs SMALLINT NOT NULL,
  gender        VARCHAR(10)  NOT NULL DEFAULT 'male',
  display_order SMALLINT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_weight_classes_slug ON weight_classes(slug);

-- Fighters
CREATE TABLE fighters (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ufc_fighter_id        VARCHAR(50) UNIQUE,
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  nickname              VARCHAR(100),
  weight_class_id       UUID NOT NULL REFERENCES weight_classes(id),
  nationality           VARCHAR(100),
  team                  VARCHAR(150),
  record_wins           SMALLINT NOT NULL DEFAULT 0,
  record_losses         SMALLINT NOT NULL DEFAULT 0,
  record_draws          SMALLINT NOT NULL DEFAULT 0,
  record_nc             SMALLINT NOT NULL DEFAULT 0,
  ranking               SMALLINT,
  is_champion           BOOLEAN NOT NULL DEFAULT FALSE,
  is_interim_champ      BOOLEAN NOT NULL DEFAULT FALSE,
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  image_url             VARCHAR(500),
  reach_inches          NUMERIC(4,1),
  height_inches         NUMERIC(4,1),
  stance                VARCHAR(20),
  dob                   DATE,
  average_fantasy_points NUMERIC(6,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fighters_weight_class ON fighters(weight_class_id);
CREATE INDEX idx_fighters_status ON fighters(status);
CREATE INDEX idx_fighters_name_trgm ON fighters USING gin((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX idx_fighters_ranking ON fighters(weight_class_id, ranking) WHERE ranking IS NOT NULL;

-- UFC Events
CREATE TABLE ufc_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ufc_event_id     VARCHAR(50) UNIQUE,
  name             VARCHAR(200) NOT NULL,
  short_name       VARCHAR(100),
  event_type       VARCHAR(20)  NOT NULL DEFAULT 'numbered',
  venue            VARCHAR(200),
  location         VARCHAR(200),
  scheduled_at     TIMESTAMPTZ  NOT NULL,
  doors_open_at    TIMESTAMPTZ,
  main_card_at     TIMESTAMPTZ,
  prelims_at       TIMESTAMPTZ,
  early_prelims_at TIMESTAMPTZ,
  status           event_status NOT NULL DEFAULT 'scheduled',
  poster_url       VARCHAR(500),
  is_scoring_event BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ufc_events_status ON ufc_events(status);
CREATE INDEX idx_ufc_events_scheduled_at ON ufc_events(scheduled_at DESC);

-- Fights
CREATE TABLE fights (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ufc_fight_id     VARCHAR(50) UNIQUE,
  event_id         UUID NOT NULL REFERENCES ufc_events(id) ON DELETE CASCADE,
  red_fighter_id   UUID NOT NULL REFERENCES fighters(id),
  blue_fighter_id  UUID NOT NULL REFERENCES fighters(id),
  weight_class_id  UUID NOT NULL REFERENCES weight_classes(id),
  is_title_fight   BOOLEAN NOT NULL DEFAULT FALSE,
  is_main_event    BOOLEAN NOT NULL DEFAULT FALSE,
  is_co_main       BOOLEAN NOT NULL DEFAULT FALSE,
  card_segment     VARCHAR(20) NOT NULL DEFAULT 'main',
  scheduled_rounds SMALLINT NOT NULL DEFAULT 3,
  bout_order       SMALLINT NOT NULL DEFAULT 0,
  status           fight_status NOT NULL DEFAULT 'scheduled',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT different_fighters CHECK (red_fighter_id != blue_fighter_id)
);
CREATE INDEX idx_fights_event ON fights(event_id);
CREATE INDEX idx_fights_red_fighter ON fights(red_fighter_id);
CREATE INDEX idx_fights_blue_fighter ON fights(blue_fighter_id);
CREATE INDEX idx_fights_status ON fights(status);

-- Fight Results
CREATE TABLE fight_results (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fight_id                     UUID NOT NULL UNIQUE REFERENCES fights(id) ON DELETE CASCADE,
  winner_id                    UUID REFERENCES fighters(id),
  winner_side                  fight_result_side,
  outcome                      fight_outcome NOT NULL,
  ending_round                 SMALLINT NOT NULL,
  ending_time_seconds          SMALLINT NOT NULL,
  winner_sig_strikes_landed    SMALLINT,
  winner_sig_strikes_attempted SMALLINT,
  winner_total_strikes_landed  SMALLINT,
  winner_takedowns_landed      SMALLINT,
  winner_takedowns_attempted   SMALLINT,
  winner_submission_attempts   SMALLINT,
  winner_knockdowns            SMALLINT,
  loser_sig_strikes_landed     SMALLINT,
  loser_sig_strikes_attempted  SMALLINT,
  loser_total_strikes_landed   SMALLINT,
  loser_takedowns_landed       SMALLINT,
  loser_takedowns_attempted    SMALLINT,
  loser_submission_attempts    SMALLINT,
  loser_knockdowns             SMALLINT,
  judge1_name                  VARCHAR(100),
  judge1_red_score             SMALLINT,
  judge1_blue_score            SMALLINT,
  judge2_name                  VARCHAR(100),
  judge2_red_score             SMALLINT,
  judge2_blue_score            SMALLINT,
  judge3_name                  VARCHAR(100),
  judge3_red_score             SMALLINT,
  judge3_blue_score            SMALLINT,
  performance_of_night         BOOLEAN NOT NULL DEFAULT FALSE,
  fight_of_night               BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data                     JSONB,
  recorded_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fight_results_fight ON fight_results(fight_id);
CREATE INDEX idx_fight_results_winner ON fight_results(winner_id);

-- User Profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username              VARCHAR(50) NOT NULL UNIQUE,
  display_name          VARCHAR(100),
  avatar_url            VARCHAR(500),
  favorite_fighter_id   UUID REFERENCES fighters(id),
  timezone              VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  push_token            VARCHAR(500),
  push_token_updated_at TIMESTAMPTZ,
  notification_prefs    JSONB NOT NULL DEFAULT '{"tradeOffers":true,"fightResults":true,"draftPicks":true,"eventStarting":true,"waiverResults":true}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_profiles_username ON user_profiles(username);

-- Leagues
CREATE TABLE leagues (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    VARCHAR(100) NOT NULL,
  description             TEXT,
  commissioner_id         UUID NOT NULL REFERENCES user_profiles(id),
  invite_code             VARCHAR(10) NOT NULL UNIQUE,
  max_teams               SMALLINT NOT NULL DEFAULT 10,
  roster_size             SMALLINT NOT NULL DEFAULT 10,
  starter_slots           SMALLINT NOT NULL DEFAULT 5,
  bench_slots             SMALLINT NOT NULL DEFAULT 5,
  draft_type              draft_type NOT NULL DEFAULT 'snake',
  draft_scheduled_at      TIMESTAMPTZ,
  draft_pick_time_seconds SMALLINT NOT NULL DEFAULT 90,
  waiver_order_type       VARCHAR(20) NOT NULL DEFAULT 'inverse_standings',
  waiver_day              SMALLINT NOT NULL DEFAULT 2,
  trade_deadline_days     SMALLINT NOT NULL DEFAULT 3,
  scoring_settings_id     UUID,
  status                  league_status NOT NULL DEFAULT 'setup',
  is_public               BOOLEAN NOT NULL DEFAULT FALSE,
  season_year             SMALLINT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::SMALLINT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_leagues_commissioner ON leagues(commissioner_id);
CREATE INDEX idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX idx_leagues_status ON leagues(status);

-- League Members
CREATE TABLE league_members (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  team_name        VARCHAR(100) NOT NULL,
  draft_position   SMALLINT,
  total_points     NUMERIC(8,2) NOT NULL DEFAULT 0,
  wins             SMALLINT NOT NULL DEFAULT 0,
  losses           SMALLINT NOT NULL DEFAULT 0,
  ties             SMALLINT NOT NULL DEFAULT 0,
  streak           SMALLINT NOT NULL DEFAULT 0,
  waiver_priority  SMALLINT NOT NULL DEFAULT 0,
  auction_budget   SMALLINT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);
CREATE INDEX idx_league_members_league ON league_members(league_id);
CREATE INDEX idx_league_members_user ON league_members(user_id);
CREATE INDEX idx_league_members_standings ON league_members(league_id, wins DESC, total_points DESC);

-- Scoring Settings
CREATE TABLE scoring_settings (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id                 UUID NOT NULL UNIQUE REFERENCES leagues(id) ON DELETE CASCADE,
  pts_win                   NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  pts_ko_tko                NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  pts_submission            NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  pts_decision              NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  pts_draw                  NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  pts_no_contest            NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  pts_finish_rd1            NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  pts_finish_rd2            NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  pts_finish_rd3            NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  pts_finish_rd4            NUMERIC(5,2) NOT NULL DEFAULT 0.50,
  pts_finish_rd5            NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  pts_knockdown             NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  pts_sig_strike_landed     NUMERIC(5,2) NOT NULL DEFAULT 0.20,
  pts_sig_strike_attempted  NUMERIC(5,2) NOT NULL DEFAULT -0.05,
  pts_total_strike_landed   NUMERIC(5,2) NOT NULL DEFAULT 0.10,
  pts_takedown_landed       NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  pts_takedown_attempted    NUMERIC(5,2) NOT NULL DEFAULT -0.25,
  pts_submission_attempt    NUMERIC(5,2) NOT NULL DEFAULT 0.50,
  pts_performance_of_night  NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  pts_fight_of_night        NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  pts_loss                  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  pts_ko_loss_penalty       NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  title_fight_multiplier    NUMERIC(3,2) NOT NULL DEFAULT 1.50,
  score_prelims             BOOLEAN NOT NULL DEFAULT TRUE,
  score_early_prelims       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rosters
CREATE TABLE rosters (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_member_id UUID NOT NULL UNIQUE REFERENCES league_members(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roster Fighters
CREATE TABLE roster_fighters (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id    UUID NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  fighter_id   UUID NOT NULL REFERENCES fighters(id),
  slot_type    roster_slot_type NOT NULL DEFAULT 'starter',
  slot_position SMALLINT NOT NULL DEFAULT 0,
  acquired_via VARCHAR(20) NOT NULL DEFAULT 'draft',
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(roster_id, fighter_id)
);
CREATE INDEX idx_roster_fighters_roster ON roster_fighters(roster_id);
CREATE INDEX idx_roster_fighters_fighter ON roster_fighters(fighter_id);

-- Draft Sessions
CREATE TABLE draft_sessions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id             UUID NOT NULL UNIQUE REFERENCES leagues(id) ON DELETE CASCADE,
  draft_type            draft_type NOT NULL DEFAULT 'snake',
  status                draft_status NOT NULL DEFAULT 'pending',
  current_round         SMALLINT NOT NULL DEFAULT 1,
  current_pick          SMALLINT NOT NULL DEFAULT 1,
  current_team_id       UUID REFERENCES league_members(id),
  total_rounds          SMALLINT NOT NULL,
  pick_time_seconds     SMALLINT NOT NULL DEFAULT 90,
  current_pick_deadline TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Draft Order
CREATE TABLE draft_order (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_session_id UUID NOT NULL REFERENCES draft_sessions(id) ON DELETE CASCADE,
  league_member_id UUID NOT NULL REFERENCES league_members(id),
  position         SMALLINT NOT NULL,
  UNIQUE(draft_session_id, position),
  UNIQUE(draft_session_id, league_member_id)
);
CREATE INDEX idx_draft_order_session ON draft_order(draft_session_id, position);

-- Draft Picks (Realtime enabled)
CREATE TABLE draft_picks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_session_id UUID NOT NULL REFERENCES draft_sessions(id) ON DELETE CASCADE,
  league_member_id UUID NOT NULL REFERENCES league_members(id),
  fighter_id       UUID REFERENCES fighters(id),
  overall_pick     SMALLINT NOT NULL,
  round_number     SMALLINT NOT NULL,
  pick_in_round    SMALLINT NOT NULL,
  status           pick_status NOT NULL DEFAULT 'pending',
  auto_picked      BOOLEAN NOT NULL DEFAULT FALSE,
  pick_duration_seconds SMALLINT,
  picked_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draft_session_id, overall_pick)
);
CREATE INDEX idx_draft_picks_session ON draft_picks(draft_session_id, overall_pick);
CREATE INDEX idx_draft_picks_fighter ON draft_picks(fighter_id);
CREATE INDEX idx_draft_picks_team ON draft_picks(league_member_id);

-- Matchups
CREATE TABLE matchups (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id    UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES ufc_events(id),
  home_team_id UUID NOT NULL REFERENCES league_members(id),
  away_team_id UUID NOT NULL REFERENCES league_members(id),
  home_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
  away_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
  winner_id    UUID REFERENCES league_members(id),
  is_playoffs  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT different_teams CHECK (home_team_id != away_team_id)
);
CREATE INDEX idx_matchups_league_event ON matchups(league_id, event_id);
CREATE INDEX idx_matchups_home_team ON matchups(home_team_id);
CREATE INDEX idx_matchups_away_team ON matchups(away_team_id);

-- Matchup Scores (Realtime enabled)
CREATE TABLE matchup_scores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matchup_id        UUID NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
  roster_fighter_id UUID NOT NULL REFERENCES roster_fighters(id),
  fight_id          UUID REFERENCES fights(id),
  fighter_id        UUID NOT NULL REFERENCES fighters(id),
  pts_win           NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_finish        NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_round_bonus   NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_sig_strikes   NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_total_strikes NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_knockdowns    NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_takedowns     NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_submissions   NUMERIC(5,2) NOT NULL DEFAULT 0,
  pts_bonuses       NUMERIC(5,2) NOT NULL DEFAULT 0,
  title_multiplier  NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  total_points      NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_starter        BOOLEAN NOT NULL DEFAULT TRUE,
  scored_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(matchup_id, fighter_id)
);
CREATE INDEX idx_matchup_scores_matchup ON matchup_scores(matchup_id);
CREATE INDEX idx_matchup_scores_fighter ON matchup_scores(fighter_id);
CREATE INDEX idx_matchup_scores_fight ON matchup_scores(fight_id);

-- Trades
CREATE TABLE trades (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  proposing_team_id UUID NOT NULL REFERENCES league_members(id),
  receiving_team_id UUID NOT NULL REFERENCES league_members(id),
  status            trade_status NOT NULL DEFAULT 'pending',
  message           TEXT,
  proposed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT different_trade_teams CHECK (proposing_team_id != receiving_team_id)
);
CREATE INDEX idx_trades_league ON trades(league_id);
CREATE INDEX idx_trades_proposing ON trades(proposing_team_id, status);
CREATE INDEX idx_trades_receiving ON trades(receiving_team_id, status);

-- Trade Items
CREATE TABLE trade_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id     UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  from_team_id UUID NOT NULL REFERENCES league_members(id),
  to_team_id   UUID NOT NULL REFERENCES league_members(id),
  fighter_id   UUID NOT NULL REFERENCES fighters(id)
);
CREATE INDEX idx_trade_items_trade ON trade_items(trade_id);
CREATE INDEX idx_trade_items_fighter ON trade_items(fighter_id);

-- Waiver Claims
CREATE TABLE waiver_claims (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  claiming_team_id UUID NOT NULL REFERENCES league_members(id),
  fighter_id       UUID NOT NULL REFERENCES fighters(id),
  drop_fighter_id  UUID REFERENCES fighters(id),
  priority         SMALLINT NOT NULL,
  status           waiver_status NOT NULL DEFAULT 'pending',
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  denial_reason    VARCHAR(200),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_waiver_claims_league ON waiver_claims(league_id, status);
CREATE INDEX idx_waiver_claims_team ON waiver_claims(claiming_team_id);
CREATE UNIQUE INDEX idx_waiver_unique_pending ON waiver_claims(league_id, claiming_team_id, fighter_id) WHERE status = 'pending';

-- Fighter Transactions
CREATE TABLE fighter_transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  fighter_id       UUID NOT NULL REFERENCES fighters(id),
  from_team_id     UUID REFERENCES league_members(id),
  to_team_id       UUID REFERENCES league_members(id),
  transaction_type VARCHAR(20) NOT NULL,
  related_id       UUID,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fighter_tx_league ON fighter_transactions(league_id, occurred_at DESC);
CREATE INDEX idx_fighter_tx_fighter ON fighter_transactions(fighter_id);

-- Notifications
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  push_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  push_sent_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- League Invites
CREATE TABLE league_invites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  invited_by      UUID NOT NULL REFERENCES user_profiles(id),
  invited_email   VARCHAR(255),
  invited_user_id UUID REFERENCES user_profiles(id),
  token           VARCHAR(64) NOT NULL UNIQUE,
  accepted        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_league_invites_token ON league_invites(token);

-- League Events
CREATE TABLE league_events (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  event_id  UUID NOT NULL REFERENCES ufc_events(id),
  is_scoring BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(league_id, event_id)
);
CREATE INDEX idx_league_events_league ON league_events(league_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fighters','ufc_events','fights','fight_results','user_profiles','leagues','scoring_settings','rosters','draft_sessions','matchups','matchup_scores','trades','weight_classes'] LOOP
    EXECUTE format('CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t);
  END LOOP;
END;
$$;

-- RLS
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_fighters ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchup_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY leagues_select ON leagues FOR SELECT USING (
  is_public = TRUE OR commissioner_id = auth.uid()
  OR id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);
CREATE POLICY leagues_update ON leagues FOR UPDATE USING (commissioner_id = auth.uid());
CREATE POLICY leagues_insert ON leagues FOR INSERT WITH CHECK (commissioner_id = auth.uid());

CREATE POLICY league_members_select ON league_members FOR SELECT USING (
  league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
);

CREATE POLICY notifications_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY rosters_select ON rosters FOR SELECT USING (
  league_member_id IN (
    SELECT lm.id FROM league_members lm
    WHERE lm.league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY draft_picks_select ON draft_picks FOR SELECT USING (
  draft_session_id IN (
    SELECT ds.id FROM draft_sessions ds
    WHERE ds.league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY matchup_scores_select ON matchup_scores FOR SELECT USING (
  matchup_id IN (
    SELECT m.id FROM matchups m
    WHERE m.league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  )
);
