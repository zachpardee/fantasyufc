-- Seed UFC events for dev/testing
-- Run manually: psql $DATABASE_URL -f events.sql

INSERT INTO ufc_events (ufc_event_id, name, short_name, event_type, venue, location, scheduled_at, status, is_scoring_event)
VALUES
  ('ufc-310',   'UFC 310',                  'UFC 310',        'numbered',  'T-Mobile Arena',               'Las Vegas, NV',         '2026-06-07 03:00:00+00', 'scheduled', true),
  ('ufc-311',   'UFC 311',                  'UFC 311',        'numbered',  'Kia Forum',                    'Inglewood, CA',         '2026-07-19 03:00:00+00', 'scheduled', true),
  ('ufc-312',   'UFC 312',                  'UFC 312',        'numbered',  'Qudos Bank Arena',             'Sydney, Australia',     '2026-08-09 12:00:00+00', 'scheduled', true),
  ('ufc-313',   'UFC 313',                  'UFC 313',        'numbered',  'T-Mobile Arena',               'Las Vegas, NV',         '2026-09-06 03:00:00+00', 'scheduled', true),
  ('ufc-fn-248','UFC Fight Night: Holloway vs. Allen', 'UFC FN 248', 'fight_night', 'UFC Apex',           'Las Vegas, NV',         '2026-06-21 00:00:00+00', 'scheduled', true),
  ('ufc-fn-249','UFC Fight Night: Whittaker vs. Muniz', 'UFC FN 249', 'fight_night', 'O2 Arena',         'London, England',       '2026-07-12 17:00:00+00', 'scheduled', true),
  ('ufc-fn-250','UFC Fight Night: Oliveira vs. Makhachev 2', 'UFC FN 250', 'fight_night', 'UFC Apex',    'Las Vegas, NV',         '2026-08-01 00:00:00+00', 'scheduled', true),
  -- Already-completed events for testing scoring
  ('ufc-309',   'UFC 309: Jones vs. Miocic', 'UFC 309',       'numbered',  'Madison Square Garden',        'New York, NY',          '2026-04-12 03:00:00+00', 'completed', true),
  ('ufc-fn-247','UFC Fight Night: Barboza vs. Murphy', 'UFC FN 247', 'fight_night', 'UFC Apex',           'Las Vegas, NV',         '2026-05-03 00:00:00+00', 'completed', true)
ON CONFLICT (ufc_event_id) DO NOTHING;
