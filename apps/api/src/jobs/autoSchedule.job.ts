import cron from 'node-cron';
import { db } from '../config/database';
import { seasonByRegularEnd } from '@fantasy-ufc/shared';
import { generateMatchupsForLeague } from '../services/matchup.service';

// The fantasy season runs January 1 – June 30 of each year.
export function seasonWindow(year: number) {
  return {
    start: new Date(`${year}-01-01T00:00:00Z`),
    end: new Date(`${year}-06-30T23:59:59Z`),
  };
}

// Runs daily at noon UTC.
// For each active league whose most recent event ended 2+ days ago,
// automatically adds the next upcoming UFC event within the season window.
// Also completes any leagues whose season window has fully elapsed.
export function startAutoScheduleJob() {
  cron.schedule('0 12 * * *', () => autoScheduleNextEvents(), { timezone: 'UTC' });
}

export async function autoScheduleNextEvents() {
  console.log('[AutoSchedule] Checking for leagues needing next event...');

  await completeElapsedSeasons();

  // Active leagues whose latest scheduled event was 2+ days ago — or that have
  // no events yet at all (league activated before its season's schedule was
  // announced). LEFT JOIN keeps the zero-event leagues in the result.
  const { rows: leagues } = await db.query(`
    SELECT l.id, l.season_year, l.season_ends_at,
           COALESCE(MAX(e.scheduled_at), l.created_at) AS last_event_at
    FROM leagues l
    LEFT JOIN league_events le ON le.league_id = l.id AND le.is_scoring = true
    LEFT JOIN ufc_events e ON e.id = le.event_id
    WHERE l.status = 'active'
    GROUP BY l.id
    HAVING COALESCE(MAX(e.scheduled_at), l.created_at) < NOW() - INTERVAL '2 days'
  `);

  if (!leagues.length) {
    console.log('[AutoSchedule] No leagues need scheduling.');
    return;
  }

  for (const league of leagues) {
    try {
      await scheduleNextEventForLeague(
        league.id,
        league.season_year,
        league.last_event_at,
        league.season_ends_at,
      );
    } catch (err) {
      console.error('[AutoSchedule] Error scheduling for league', league.id, err);
    }
  }
}

async function scheduleNextEventForLeague(
  leagueId: string,
  seasonYear: number,
  lastEventAt: Date,
  seasonEndsAt: Date | null,
) {
  // Per-league season end set at season start (covers static-calendar leagues
  // running outside the legacy Jan-Jun window). Legacy window is the fallback.
  const seasonEnd = seasonEndsAt ? new Date(seasonEndsAt) : seasonWindow(seasonYear).end;

  // Season window has passed — nothing to schedule
  if (new Date() > seasonEnd) {
    console.log(`[AutoSchedule] Season window closed for league ${leagueId} (${seasonYear})`);
    return;
  }

  // For static-calendar leagues, never schedule events before the season's
  // opening day (a league can be activated during the preseason).
  const staticSeason = seasonEndsAt ? seasonByRegularEnd(new Date(seasonEndsAt)) : null;
  const lowerBound =
    staticSeason && staticSeason.startsAt > new Date(lastEventAt)
      ? staticSeason.startsAt
      : new Date(lastEventAt);

  // Next UFC scoring event within the season window that isn't already scheduled
  const {
    rows: [nextEvent],
  } = await db.query(
    `
    SELECT e.id, e.name, e.scheduled_at
    FROM ufc_events e
    WHERE e.status = 'scheduled'
      AND e.is_scoring_event = true
      AND e.scheduled_at > $1
      AND e.scheduled_at <= $2
      AND e.id NOT IN (
        SELECT event_id FROM league_events WHERE league_id = $3
      )
    ORDER BY e.scheduled_at ASC
    LIMIT 1
  `,
    [lowerBound, seasonEnd, leagueId],
  );

  if (!nextEvent) {
    console.log(`[AutoSchedule] No upcoming event in season window for league ${leagueId}`);
    return;
  }

  await db.query(
    `
    INSERT INTO league_events (league_id, event_id, is_scoring)
    VALUES ($1, $2, true)
    ON CONFLICT (league_id, event_id) DO NOTHING
  `,
    [leagueId, nextEvent.id],
  );

  await generateMatchupsForLeague(leagueId);

  console.log(
    `[AutoSchedule] Scheduled "${nextEvent.name}" (${nextEvent.scheduled_at}) for league ${leagueId}`,
  );
}

// Mark leagues as completed when their season window has ended and all events are done.
async function completeElapsedSeasons() {
  const { rows: leagues } = await db.query(`
    SELECT l.id, l.season_year
    FROM leagues l
    WHERE l.status = 'active'
      AND NOW() > COALESCE(
        l.season_ends_at,
        DATE_TRUNC('year', MAKE_DATE(l.season_year::int, 1, 1)) + INTERVAL '6 months' - INTERVAL '1 second'
      )
      -- never complete a league still waiting for its playoff events to be assigned
      AND (l.season_ends_at IS NULL OR l.playoff_finals_event_id IS NOT NULL)
  `);

  for (const league of leagues) {
    // Only complete if every scoring event for this league is done (no live/scheduled events left)
    const {
      rows: [{ pending }],
    } = await db.query<{ pending: string }>(
      `
      SELECT COUNT(*) AS pending
      FROM league_events le
      JOIN ufc_events e ON e.id = le.event_id
      WHERE le.league_id = $1 AND le.is_scoring = true
        AND e.status IN ('scheduled', 'live')
    `,
      [league.id],
    );

    if (parseInt(pending) === 0) {
      await db.query(`UPDATE leagues SET status = 'completed' WHERE id = $1`, [league.id]);
      console.log(
        `[AutoSchedule] Completed season for league ${league.id} (${league.season_year})`,
      );
    }
  }
}
