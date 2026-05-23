import cron from 'node-cron';
import { db } from '../config/database';
import { generateMatchupsForLeague } from '../services/matchup.service';

// Runs daily at noon UTC.
// For each active league whose most recent event ended 2+ days ago,
// automatically adds the next upcoming UFC event to that league's schedule.
// Commissioners only need to seed the first event; everything else is automatic.
export function startAutoScheduleJob() {
  cron.schedule('0 12 * * *', () => autoScheduleNextEvents(), { timezone: 'UTC' });
}

export async function autoScheduleNextEvents() {
  console.log('[AutoSchedule] Checking for leagues needing next event...');

  // Active leagues whose latest scheduled event was 2+ days ago
  // (and don't already have a future event on their schedule)
  const { rows: leagues } = await db.query(`
    SELECT l.id, MAX(e.scheduled_at) AS last_event_at
    FROM leagues l
    JOIN league_events le ON le.league_id = l.id AND le.is_scoring = true
    JOIN ufc_events e ON e.id = le.event_id
    WHERE l.status = 'active'
    GROUP BY l.id
    HAVING MAX(e.scheduled_at) < NOW() - INTERVAL '2 days'
  `);

  if (!leagues.length) {
    console.log('[AutoSchedule] No leagues need scheduling.');
    return;
  }

  for (const league of leagues) {
    try {
      await scheduleNextEventForLeague(league.id, league.last_event_at);
    } catch (err) {
      console.error('[AutoSchedule] Error scheduling for league', league.id, err);
    }
  }
}

async function scheduleNextEventForLeague(leagueId: string, lastEventAt: Date) {
  // Next UFC scoring event that isn't already on this league's schedule
  const { rows: [nextEvent] } = await db.query(`
    SELECT e.id, e.name, e.scheduled_at
    FROM ufc_events e
    WHERE e.status = 'scheduled'
      AND e.is_scoring_event = true
      AND e.scheduled_at > $1
      AND e.id NOT IN (
        SELECT event_id FROM league_events WHERE league_id = $2
      )
    ORDER BY e.scheduled_at ASC
    LIMIT 1
  `, [lastEventAt, leagueId]);

  if (!nextEvent) {
    console.log(`[AutoSchedule] No upcoming event available for league ${leagueId}`);
    return;
  }

  await db.query(`
    INSERT INTO league_events (league_id, event_id, is_scoring)
    VALUES ($1, $2, true)
    ON CONFLICT (league_id, event_id) DO NOTHING
  `, [leagueId, nextEvent.id]);

  await generateMatchupsForLeague(leagueId);

  console.log(`[AutoSchedule] Scheduled "${nextEvent.name}" (${nextEvent.scheduled_at}) for league ${leagueId}`);
}
