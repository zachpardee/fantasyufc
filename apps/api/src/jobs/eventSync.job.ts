import cron from 'node-cron';
import { tracked, recordJobRun } from './jobRuns';
import { db } from '../config/database';
import { fetchUpcomingEvents, fetchEventsByDate, type EspnFight } from '../services/espn.adapter';
import { redis } from '../config/redis';
import { sendNotification } from '../services/notification.service';
import { nextHolidayTarget } from '../utils/playoffs';
import { seasonByRegularEnd } from '@fantasy-ufc/shared';
import { generateMatchupsForLeague } from '../services/matchup.service';
import { refreshStakingMatchupScores } from '../services/scoring.service';

// Runs daily at 6am UTC — syncs upcoming UFC events and their fight cards
export function startEventSyncJob() {
  cron.schedule('0 6 * * *', tracked('event_sync', syncEvents), { timezone: 'UTC' });
  // Also run at startup
  syncEvents().catch(console.error);
}

export async function syncEventsByDate(yyyymmdd: string): Promise<number> {
  const events = await fetchEventsByDate(yyyymmdd);
  let count = 0;
  for (const event of events) {
    await upsertEvent(event);
    count++;
  }
  await redis.del('events:upcoming');
  console.log(`[EventSync] syncEventsByDate(${yyyymmdd}): processed ${count} event(s)`);
  return count;
}

export async function syncEvents() {
  console.log('[EventSync] Starting event sync...');
  try {
    const events = await fetchUpcomingEvents();
    for (const event of events) {
      await upsertEvent(event);
    }
    console.log(`[EventSync] Synced ${events.length} events from scoreboard`);

    // Sync the last 30 days in case we missed recent results
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const pastYyyymmdd = thirtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');
    const recentEvents = await fetchEventsByDate(pastYyyymmdd);
    for (const event of recentEvents) {
      await upsertEvent(event);
    }

    // Scan the next 90 days in 2-week increments so far-future events aren't missed
    // ESPN's default scoreboard only returns a short window of upcoming events
    const seenEventIds = new Set(events.map((e) => e.espnEventId));
    let totalFuture = 0;
    for (let weeksAhead = 1; weeksAhead <= 13; weeksAhead += 2) {
      const futureDate = new Date(Date.now() + weeksAhead * 7 * 24 * 60 * 60 * 1000);
      const yyyymmdd = futureDate.toISOString().slice(0, 10).replace(/-/g, '');
      const futureEvents = await fetchEventsByDate(yyyymmdd);
      for (const event of futureEvents) {
        if (!seenEventIds.has(event.espnEventId)) {
          seenEventIds.add(event.espnEventId);
          await upsertEvent(event);
          totalFuture++;
        }
      }
    }
    if (totalFuture > 0) console.log(`[EventSync] Synced ${totalFuture} additional future events`);

    await redis.del('events:upcoming');
    await refreshLeaguePlayoffs();
    await enrollNewSeasonEvents();

    // Push events to all leagues + sync odds after every event sync
    const { prepUpcomingEvents } = await import('./preEventPrep.job');
    await prepUpcomingEvents()
      .then(() => recordJobRun('pre_event_prep', true))
      .catch((err: Error) => console.error('[EventSync] Pre-event prep failed:', err.message));
  } catch (err) {
    console.error('[EventSync] Error:', err);
  }
}

// For each active league, find any new UFC events that fall within the regular season
// window and add them to league_events + regenerate matchups so everyone gets a matchup.
async function enrollNewSeasonEvents() {
  const { rows: leagues } = await db.query(`
    SELECT l.id, l.playoff_semis_event_id,
           e_semis.scheduled_at AS semis_at
    FROM leagues l
    JOIN ufc_events e_semis ON e_semis.id = l.playoff_semis_event_id
    WHERE l.status = 'active'
      AND l.playoff_semis_event_id IS NOT NULL
  `);

  for (const league of leagues) {
    // Season start = 6 months before semis (covers the full Jan–Jul / Jul–Jan window)
    const seasonStart = new Date(league.semis_at);
    seasonStart.setMonth(seasonStart.getMonth() - 6);

    // Events within the regular season window not yet in league_events
    const { rows: newEvents } = await db.query(
      `
      SELECT e.id FROM ufc_events e
      WHERE e.status != 'cancelled'
        AND e.scheduled_at >= $1
        AND e.scheduled_at < $2
        AND NOT EXISTS (
          SELECT 1 FROM league_events le WHERE le.league_id = $3 AND le.event_id = e.id
        )
    `,
      [seasonStart.toISOString(), league.semis_at, league.id],
    );

    if (newEvents.length === 0) continue;

    for (const ev of newEvents) {
      await db.query(
        `INSERT INTO league_events (league_id, event_id, is_scoring) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
        [league.id, ev.id],
      );
    }

    // Regenerate matchups so every member gets a matchup for the new event
    await generateMatchupsForLeague(league.id).catch((err: Error) => {
      console.error(
        `[EventSync] Failed to regenerate matchups for league ${league.id}:`,
        err.message,
      );
    });

    console.log(
      `[EventSync] Enrolled ${newEvents.length} new event(s) into league ${league.id} and regenerated schedule`,
    );
  }
}

// After each sync, fill in missing playoff event refs for active leagues.
// Runs whenever events are synced so refs get set as soon as ESPN publishes the events.
async function refreshLeaguePlayoffs() {
  const { rows: leagues } = await db.query(`
    SELECT id, season_ends_at, season_length_months,
           playoff_semis_event_id, playoff_finals_event_id
    FROM leagues
    WHERE status IN ('active', 'playoffs')
      AND season_ends_at IS NOT NULL
      AND (
        playoff_semis_event_id IS NULL
        OR playoff_finals_event_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM ufc_events WHERE id = playoff_semis_event_id AND status != 'cancelled')
        OR NOT EXISTS (SELECT 1 FROM ufc_events WHERE id = playoff_finals_event_id AND status != 'cancelled')
      )
  `);

  if (!leagues.length) return;

  for (const league of leagues) {
    const seasonEndsAt = new Date(league.season_ends_at);
    let semisId: string | null = league.playoff_semis_event_id ?? null;
    let finalsId: string | null = league.playoff_finals_event_id ?? null;

    // Determine finals event if missing
    if (!finalsId) {
      const staticSeason = seasonByRegularEnd(seasonEndsAt);
      if (staticSeason) {
        // Static-calendar league: finals = the PPV nearest the season anchor,
        // keeping at least one event before it after the regular season (semis).
        const { rows: postSeason } = await db.query<{
          id: string;
          name: string;
          scheduled_at: string;
        }>(
          `
          SELECT id, name, scheduled_at FROM ufc_events
          WHERE scheduled_at > $1 AND scheduled_at <= $2 AND status != 'cancelled'
          ORDER BY scheduled_at ASC
        `,
          [
            seasonEndsAt.toISOString(),
            new Date(seasonEndsAt.getTime() + 45 * 86400_000).toISOString(),
          ],
        );
        if (postSeason.length >= 2) {
          const ppvs = postSeason.filter((e, i) => i >= 1 && !/^UFC Fight Night/i.test(e.name));
          const finals = ppvs.length
            ? ppvs.reduce((a, b) =>
                Math.abs(
                  new Date(a.scheduled_at).getTime() - staticSeason.finalsTarget.getTime(),
                ) <=
                Math.abs(new Date(b.scheduled_at).getTime() - staticSeason.finalsTarget.getTime())
                  ? a
                  : b,
              )
            : postSeason[1];
          const finalsIdx = postSeason.findIndex((e) => e.id === finals.id);
          semisId = semisId ?? postSeason[finalsIdx - 1].id;
          finalsId = finals.id;
        }
      } else if (league.season_length_months === 6) {
        const target = nextHolidayTarget(seasonEndsAt);
        const {
          rows: [closest],
        } = await db.query(
          `
          SELECT id FROM ufc_events
          WHERE scheduled_at > $1 AND status != 'cancelled'
          ORDER BY ABS(EXTRACT(EPOCH FROM (scheduled_at - $2::timestamptz))) ASC
          LIMIT 1
        `,
          [seasonEndsAt.toISOString(), target.toISOString()],
        );
        finalsId = closest?.id ?? null;
      } else {
        const { rows: fallback } = await db.query(
          `
          SELECT id FROM ufc_events
          WHERE scheduled_at > $1 AND status != 'cancelled'
          ORDER BY scheduled_at ASC LIMIT 2
        `,
          [seasonEndsAt.toISOString()],
        );
        if (fallback.length >= 2) {
          semisId = semisId ?? fallback[0].id;
          finalsId = fallback[1].id;
        } else if (fallback.length === 1) {
          finalsId = fallback[0].id;
        }
      }
    }

    // Determine semis event if missing: event between season end and finals
    if (!semisId && finalsId) {
      const {
        rows: [candidate],
      } = await db.query(
        `
        SELECT id FROM ufc_events
        WHERE scheduled_at > $1
          AND scheduled_at < (SELECT scheduled_at FROM ufc_events WHERE id = $2)
          AND status != 'cancelled'
        ORDER BY scheduled_at DESC
        LIMIT 1
      `,
        [seasonEndsAt.toISOString(), finalsId],
      );
      semisId = candidate?.id ?? null;
    }

    if (semisId !== league.playoff_semis_event_id || finalsId !== league.playoff_finals_event_id) {
      await db.query(
        `
        UPDATE leagues SET playoff_semis_event_id = $1, playoff_finals_event_id = $2 WHERE id = $3
      `,
        [semisId, finalsId, league.id],
      );
      console.log(
        `[EventSync] Auto-set playoffs for league ${league.id}: semis=${semisId} finals=${finalsId}`,
      );
    }

    // Ensure both playoff events are in league_events so they appear in the chip strip
    for (const eventId of [semisId, finalsId]) {
      if (eventId) {
        await db.query(
          `INSERT INTO league_events (league_id, event_id, is_scoring) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
          [league.id, eventId],
        );
      }
    }
  }
}

// Exported so preEventPrep.job can refresh individual event fight cards
export async function upsertEventPublic(
  event: Awaited<ReturnType<typeof fetchUpcomingEvents>>[number],
) {
  return upsertEvent(event);
}

async function upsertEvent(event: Awaited<ReturnType<typeof fetchUpcomingEvents>>[number]) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // ESPN sometimes returns different event IDs for the same real event depending on the
    // query date. Guard against duplicates by checking if another non-cancelled event
    // already exists within 24 hours before inserting (UFC cards span midnight UTC).
    const {
      rows: [existingByDate],
    } = await client.query(
      `
      SELECT id FROM ufc_events
      WHERE scheduled_at BETWEEN ($1::timestamptz - INTERVAL '24 hours')
                              AND ($1::timestamptz + INTERVAL '24 hours')
        AND ufc_event_id != $2
        AND status != 'cancelled'
      LIMIT 1
    `,
      [event.scheduledAt, event.espnEventId],
    );

    if (existingByDate) {
      await client.query('COMMIT');
      return;
    }

    // Upsert the event. mapStatus only returns 'live' or 'scheduled' — never 'completed'.
    // 'completed' is determined after syncing fights (see below).
    // Don't revert an in-progress event back to 'scheduled' if ESPN briefly drops the 'in' flag.
    const {
      rows: [dbEvent],
    } = await client.query(
      `
      INSERT INTO ufc_events (
        ufc_event_id, name, short_name, event_type, venue, location,
        scheduled_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (ufc_event_id) DO UPDATE SET
        name = EXCLUDED.name,
        status = CASE
          WHEN EXCLUDED.status = 'live' THEN 'live'
          WHEN ufc_events.status IN ('live', 'completed') AND EXCLUDED.status = 'scheduled' THEN ufc_events.status
          ELSE EXCLUDED.status
        END,
        scheduled_at = EXCLUDED.scheduled_at
      RETURNING id, status, scheduled_at
    `,
      [
        event.espnEventId,
        event.name,
        event.name.match(/UFC \d+/)?.[0] ?? event.name,
        event.name.toLowerCase().includes('fight night')
          ? 'fight_night'
          : event.name.match(/UFC \d+/)
            ? 'numbered'
            : 'fight_night',
        event.venueName ?? null,
        [event.venueCity, event.venueCountry].filter(Boolean).join(', ') || null,
        event.scheduledAt,
        mapStatus(event.status, event.completed),
      ],
    );

    // Reconcile: drop bouts ESPN no longer lists (cancellations / fighter swaps) before
    // upserting, so a stale fight can't block its replacement. Only for scheduled events.
    let staleResult = { removed: [] as string[], affectedLeagueIds: [] as string[] };
    if (dbEvent.status === 'scheduled') {
      staleResult = await removeStaleFights(
        client,
        dbEvent.id,
        event.fights.map((f) => f.espnFightId),
      );
      if (staleResult.removed.length)
        console.log(
          `[EventSync] Removed ${staleResult.removed.length} stale bout(s) from "${event.name}"`,
        );
    }

    // Sync fight card, tracking any fighter changes
    const changedFights: string[] = [];
    for (const fight of event.fights) {
      const changed = await upsertFight(client, dbEvent.id, fight);
      if (changed)
        changedFights.push(`${fight.redCorner.displayName} vs ${fight.blueCorner.displayName}`);
    }

    await client.query('COMMIT');

    // Recompute staking matchup scores for leagues whose bets were voided by reconciliation.
    for (const lid of staleResult.affectedLeagueIds) {
      await refreshStakingMatchupScores(lid, dbEvent.id).catch(() => {});
    }

    // After fights are synced, resolve the true event status from fight completion.
    // Only mark 'completed' when every fight has a result; revert to 'live' if not all done.
    const {
      rows: [fightStats],
    } = await db.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS done
      FROM fights WHERE event_id = $1
    `,
      [dbEvent.id],
    );

    if (fightStats.total > 0) {
      const allDone = fightStats.done === fightStats.total;
      const resolvedStatus = allDone
        ? 'completed'
        : dbEvent.status === 'completed'
          ? 'live'
          : dbEvent.status;
      if (resolvedStatus !== dbEvent.status) {
        await db.query(`UPDATE ufc_events SET status = $1 WHERE id = $2`, [
          resolvedStatus,
          dbEvent.id,
        ]);
        dbEvent.status = resolvedStatus;
      }
    }

    // Notify if fights changed and the event is still open for picks (not locked)
    const lockAt = new Date(dbEvent.scheduled_at).getTime() - 10 * 60 * 1000;
    if (changedFights.length > 0 && dbEvent.status === 'scheduled' && Date.now() < lockAt) {
      await notifyCardChange(dbEvent.id, event.name, changedFights).catch((err) =>
        console.error('[EventSync] Failed to send card change notifications:', err),
      );
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[EventSync] Failed to upsert event:', event.name, err);
  } finally {
    client.release();
  }
}

async function notifyCardChange(eventId: string, eventName: string, changedFights: string[]) {
  const { rows: users } = await db.query(
    `
    SELECT DISTINCT up.id as user_id
    FROM league_events le
    JOIN leagues l ON l.id = le.league_id
    JOIN league_members lm ON lm.league_id = l.id
    JOIN user_profiles up ON up.id = lm.user_id
    WHERE le.event_id = $1 AND le.is_scoring = true
  `,
    [eventId],
  );

  if (!users.length) return;

  const shortName = eventName
    .replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ')
    .replace(/^UFC\s+/i, 'UFC ');
  const count = changedFights.length;
  const body =
    count === 1
      ? `${changedFights[0]} has changed — review your picks before the event starts.`
      : `${count} fights updated — review your picks before the event starts.`;

  console.log(`[EventSync] Notifying ${users.length} users of card changes for ${eventName}`);

  await Promise.allSettled(
    users.map((u) =>
      sendNotification(u.user_id, 'card_change', `${shortName} card update`, body, { eventId }),
    ),
  );
}

// Remove our fights that ESPN no longer lists for a (scheduled) event — i.e. bouts that
// were cancelled or had a fighter swapped (ESPN issues a new fight id for the new pairing).
// Voids the affected pending bets/picks so a stale bout can't block its real replacement.
// Returns the league ids whose staking matchup scores need recomputing.
async function removeStaleFights(
  client: import('pg').PoolClient,
  eventId: string,
  espnFightIds: string[],
): Promise<{ removed: string[]; affectedLeagueIds: string[] }> {
  const { rows: stale } = await client.query(
    `SELECT id FROM fights
     WHERE event_id = $1 AND status <> 'completed' AND NOT (ufc_fight_id = ANY($2::text[]))`,
    [eventId, espnFightIds],
  );
  const leagueIds = new Set<string>();

  for (const f of stale) {
    // Collect leagues with bets on this fight (their matchup money-on-hand will change).
    const { rows: betLeagues } = await client.query(
      `SELECT league_id FROM staking_singles WHERE fight_id = $1
       UNION
       SELECT sp.league_id FROM staking_parlay_legs spl
         JOIN staking_parlays sp ON sp.id = spl.parlay_id
       WHERE spl.fight_id = $1`,
      [f.id],
    );
    betLeagues.forEach((r: any) => leagueIds.add(r.league_id));

    // Drop the bad leg from any parlay, then reprice (or void the parlay if < 2 legs remain).
    const { rows: affParlays } = await client.query(
      `SELECT DISTINCT parlay_id FROM staking_parlay_legs WHERE fight_id = $1`,
      [f.id],
    );
    await client.query(`DELETE FROM staking_parlay_legs WHERE fight_id = $1`, [f.id]);
    for (const ap of affParlays) {
      const { rows: legs } = await client.query(
        `SELECT decimal_odds FROM staking_parlay_legs WHERE parlay_id = $1`,
        [ap.parlay_id],
      );
      if (legs.length < 2) {
        await client.query(`DELETE FROM staking_parlays WHERE id = $1`, [ap.parlay_id]);
        continue;
      }
      const combined = legs.reduce(
        (acc: number, l: any) =>
          acc * (l.decimal_odds != null ? parseFloat(l.decimal_odds) || 1 : 1),
        1,
      );
      await client.query(
        `UPDATE staking_parlays SET decimal_odds = $1,
           potential_payout = ROUND(stake * $1, 2) WHERE id = $2`,
        [Math.round(combined * 10000) / 10000, ap.parlay_id],
      );
    }

    await client.query(`DELETE FROM staking_singles WHERE fight_id = $1`, [f.id]);
    await client.query(`DELETE FROM event_champion_picks WHERE fight_id = $1`, [f.id]);
    // event_picks cascade-delete with the fight.
    await client.query(`DELETE FROM fights WHERE id = $1`, [f.id]);
  }

  return { removed: stale.map((f: any) => f.id), affectedLeagueIds: [...leagueIds] };
}

async function upsertFight(
  client: import('pg').PoolClient,
  eventId: string,
  fight: EspnFight,
): Promise<boolean> {
  // Resolve fighters by ESPN athlete ID
  const [redFighter, blueFighter] = await Promise.all([
    resolveOrCreateFighter(client, fight.redCorner),
    resolveOrCreateFighter(client, fight.blueCorner),
  ]);

  if (!redFighter || !blueFighter) return false;

  // If this ESPN fight ID doesn't exist yet, check whether either fighter is already
  // booked for this event under a different ESPN fight ID. This prevents stale ESPN
  // competition records (e.g. cancelled matchups) from creating duplicate DB rows.
  const {
    rows: [existingById],
  } = await client.query(
    `SELECT id, red_fighter_id, blue_fighter_id FROM fights WHERE ufc_fight_id = $1`,
    [fight.espnFightId],
  );

  // Detect if fighters changed on an existing fight
  const fightersChanged =
    !!existingById &&
    (existingById.red_fighter_id !== redFighter || existingById.blue_fighter_id !== blueFighter);

  if (!existingById) {
    const {
      rows: [duplicate],
    } = await client.query(
      `
      SELECT id FROM fights
      WHERE event_id = $1
        AND ufc_fight_id != $2
        AND (red_fighter_id IN ($3,$4) OR blue_fighter_id IN ($3,$4))
      LIMIT 1
    `,
      [eventId, fight.espnFightId, redFighter, blueFighter],
    );
    if (duplicate) {
      console.log(
        `[EventSync] Skipping duplicate fight ${fight.espnFightId} — fighter already booked for this event`,
      );
      return false;
    }
  }

  // Resolve weight class. ESPN abbreviates women's divisions as "W Bantamweight" etc.,
  // while our table stores "Women's Bantamweight" — normalize before matching.
  const wcText = fight.weightClassText.replace(/^W\s+/i, "Women's ");
  const {
    rows: [weightClass],
  } = await client.query(
    `SELECT id FROM weight_classes WHERE name ILIKE $1 OR slug ILIKE $2 LIMIT 1`,
    [wcText, wcText.toLowerCase().replace(/\s+/g, '-')],
  );
  if (!weightClass) return false;

  await client.query(
    `
    INSERT INTO fights (
      ufc_fight_id, event_id, red_fighter_id, blue_fighter_id,
      weight_class_id, scheduled_rounds, status,
      red_fighter_odds, blue_fighter_odds,
      bout_order, is_main_event, is_co_main, card_segment
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (ufc_fight_id) DO UPDATE SET
      status = CASE
        WHEN EXCLUDED.status = 'completed' THEN 'completed'
        ELSE fights.status
      END,
      red_fighter_odds = COALESCE(EXCLUDED.red_fighter_odds, fights.red_fighter_odds),
      blue_fighter_odds = COALESCE(EXCLUDED.blue_fighter_odds, fights.blue_fighter_odds),
      bout_order = EXCLUDED.bout_order,
      is_main_event = EXCLUDED.is_main_event,
      is_co_main = EXCLUDED.is_co_main,
      card_segment = EXCLUDED.card_segment
  `,
    [
      fight.espnFightId,
      eventId,
      redFighter,
      blueFighter,
      weightClass.id,
      fight.scheduledRounds,
      fight.completed ? 'completed' : 'scheduled',
      fight.redOdds ?? null,
      fight.blueOdds ?? null,
      fight.boutOrder,
      fight.isMainEvent,
      fight.isCoMain,
      fight.cardSegment,
    ],
  );

  return fightersChanged;
}

async function resolveOrCreateFighter(
  client: import('pg').PoolClient,
  corner: EspnFight['redCorner'],
): Promise<string | null> {
  // Try by ESPN ID first
  const {
    rows: [byEspnId],
  } = await client.query(`SELECT id FROM fighters WHERE ufc_fighter_id = $1`, [
    corner.espnAthleteId,
  ]);
  if (byEspnId) return byEspnId.id;

  // Try by name
  const nameParts = corner.displayName.trim().split(/\s+/);
  const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0];
  const lastName = nameParts[nameParts.length - 1];

  const {
    rows: [byName],
  } = await client.query(
    `SELECT id FROM fighters WHERE first_name ILIKE $1 AND last_name ILIKE $2 LIMIT 1`,
    [firstName, lastName],
  );
  if (byName) {
    // Store the ESPN ID for future lookups
    await client.query(`UPDATE fighters SET ufc_fighter_id = $1 WHERE id = $2`, [
      corner.espnAthleteId,
      byName.id,
    ]);
    return byName.id;
  }

  // Create a minimal fighter record — will be enriched by fighterSync
  const {
    rows: [wc],
  } = await client.query(
    `SELECT id FROM weight_classes WHERE display_order = 5`, // Default: Lightweight
  );

  let wins = 0,
    losses = 0,
    draws = 0;
  if (corner.record) {
    const parts = corner.record.split('-');
    wins = parseInt(parts[0]) || 0;
    losses = parseInt(parts[1]) || 0;
    draws = parseInt(parts[2]) || 0;
  }

  const {
    rows: [newFighter],
  } = await client.query(
    `
    INSERT INTO fighters (ufc_fighter_id, first_name, last_name, weight_class_id, record_wins, record_losses, record_draws)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `,
    [corner.espnAthleteId, firstName, lastName, wc?.id, wins, losses, draws],
  );

  return newFighter?.id ?? null;
}

// ESPN's event-level "completed" flag fires after the prelims, before the main card ends.
// We determine 'completed' from fight-level data instead; here we only signal 'live' vs 'scheduled'.
function mapStatus(state: string, completed: boolean): string {
  if (state === 'in' || completed) return 'live';
  return 'scheduled';
}
