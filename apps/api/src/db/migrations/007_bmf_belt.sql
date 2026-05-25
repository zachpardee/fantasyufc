ALTER TABLE leagues
  ADD COLUMN bmf_belt_holder_id UUID REFERENCES league_members(id) ON DELETE SET NULL;
