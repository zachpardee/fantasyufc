-- Track whether weekly budget has been credited for a settled staking event
ALTER TABLE league_events ADD COLUMN staking_settled boolean NOT NULL DEFAULT false;
