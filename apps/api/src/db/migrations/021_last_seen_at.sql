-- Track real app activity: auth middleware touches this (throttled to ~once an
-- hour per user) on any authenticated request, so "last seen" reflects actual
-- use rather than fresh logins (sessions persist, so last_sign_in_at undercounts).
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
