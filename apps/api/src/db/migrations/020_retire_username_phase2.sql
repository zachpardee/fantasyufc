-- Username retirement phase 2: drop the column. Only safe once no deployed
-- code references user_profiles.username (phase 1 removed every reference;
-- verified against prod before this ran).
ALTER TABLE user_profiles DROP COLUMN IF EXISTS username;
