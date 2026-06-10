-- Allow null odds/payout on singles and parlay legs so bets can be placed
-- before The Odds API syncs lines (typically 5-7 days before the event).
-- Payouts are calculated/updated when odds are synced by the pre-event prep job.
ALTER TABLE staking_singles
  ALTER COLUMN odds DROP NOT NULL,
  ALTER COLUMN potential_payout DROP NOT NULL;

ALTER TABLE staking_parlay_legs
  ALTER COLUMN odds DROP NOT NULL,
  ALTER COLUMN decimal_odds DROP NOT NULL;

ALTER TABLE staking_parlays
  ALTER COLUMN decimal_odds DROP NOT NULL,
  ALTER COLUMN potential_payout DROP NOT NULL;
