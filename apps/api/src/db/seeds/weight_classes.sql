INSERT INTO weight_classes (name, slug, weight_limit_lbs, gender, display_order) VALUES
  ('Heavyweight', 'heavyweight', 265, 'male', 1),
  ('Light Heavyweight', 'light-heavyweight', 205, 'male', 2),
  ('Middleweight', 'middleweight', 185, 'male', 3),
  ('Welterweight', 'welterweight', 170, 'male', 4),
  ('Lightweight', 'lightweight', 155, 'male', 5),
  ('Featherweight', 'featherweight', 145, 'male', 6),
  ('Bantamweight', 'bantamweight', 135, 'male', 7),
  ('Flyweight', 'flyweight', 125, 'male', 8),
  ('Women''s Strawweight', 'womens-strawweight', 115, 'female', 9),
  ('Women''s Flyweight', 'womens-flyweight', 125, 'female', 10),
  ('Women''s Bantamweight', 'womens-bantamweight', 135, 'female', 11),
  ('Women''s Featherweight', 'womens-featherweight', 145, 'female', 12)
ON CONFLICT (slug) DO NOTHING;
