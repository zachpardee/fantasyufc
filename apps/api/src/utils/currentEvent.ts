// "Current event" review window.
//
// After an event completes, keep it as the league's current event/matchup for a few days so
// users can review how their matchup went, then switch to the next matchup. For a Saturday
// event this shows results through Monday and switches at Tuesday 00:00 local time.
//
// The switch happens at local midnight in CURRENT_EVENT_TZ (the server runs UTC). Default is
// US Mountain; override with the CURRENT_EVENT_TZ env var.
export const CURRENT_EVENT_TZ = process.env.CURRENT_EVENT_TZ ?? 'America/Denver';

// Days the completed event lingers: event day + 2 full days, switching on day 3 at midnight.
// (Saturday event → through Monday, switch Tuesday 00:00.)
export const LINGER_DAYS = 3;

/**
 * SQL boolean: true while a completed event is still inside its post-event review window.
 * `eventAlias` is the aliased ufc_events table in the surrounding query.
 * Values are constants (not user input), so string interpolation is safe here.
 */
export function lingerWindowSql(eventAlias = 'e'): string {
  return `now() < (
    (date_trunc('day', ${eventAlias}.scheduled_at AT TIME ZONE '${CURRENT_EVENT_TZ}')
      + interval '${LINGER_DAYS} days') AT TIME ZONE '${CURRENT_EVENT_TZ}'
  )`;
}
