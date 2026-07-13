-- Username is being retired: display_name becomes the only human-name field.
-- Phase 1: stop requiring username (new signups no longer set it) and make sure
-- every existing profile has a display_name. The column drop is a later
-- migration (020) so it only runs once no deployed code references username.
ALTER TABLE user_profiles ALTER COLUMN username DROP NOT NULL;

UPDATE user_profiles
SET display_name = username
WHERE display_name IS NULL AND username IS NOT NULL;
