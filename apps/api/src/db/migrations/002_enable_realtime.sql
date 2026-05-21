-- Enable Supabase Realtime for tables that need live updates.
-- Supabase uses a publication called supabase_realtime; adding tables here
-- makes their INSERT/UPDATE/DELETE events broadcast to subscribed clients.

ALTER PUBLICATION supabase_realtime ADD TABLE draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE matchup_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE fight_results;
