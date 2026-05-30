import cron from 'node-cron';
import { db } from '../config/database';
import { fetchUpcomingEvents, fetchEventsByDate, type EspnFight } from '../services/espn.adapter';
import { redis } from '../config/redis';
import { sendNotification } from '../services/notification.service';

// Runs daily at 6am UTC — syncs upcoming UFC events and their fight cards
export function startEventSyncJob() {
  cron.schedule('0 6 * * *', () => syncEvents(), { timezone: 'UTC' });
  // Also run at startup
  syncEvents().catch(console.error);
}

export async function syncEvents() {
  console.log('[EventSync] Starting event sync...');
  try {
    const events = await fetchUpcomingEvents();
    for (const event of events) {
      await upsertEvent(event);
    }
    console.log(`[EventSync] Synced ${events.length} events`);

    // Also sync the last 30 days in case we missed recent results
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const yyyymmdd = thirtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, '');
    const recentEvents = await fetchEventsByDate(yyyymmdd);
    for (const event of recentEvents) {
      await upsertEvent(event);
    }

    await redis.del('events:upcoming');
  } catch (err) {
    console.error('[EventSync] Error:', err);
  }
}

async function upsertEvent(event: Awaited<ReturnType<typeof fetchUpcomingEvents>>[number]) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Upsert the event
    const { rows: [dbEvent] } = await client.query(`
      INSERT INTO ufc_events (
        ufc_event_id, name, short_name, event_type, venue, location,
        scheduled_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (ufc_event_id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        scheduled_at = EXCLUDED.scheduled_at
      RETURNING id, status, scheduled_at
    `, [
      event.espnEventId,
      event.name,
      event.name.match(/UFC \d+/)?.[0] ?? event.name,
      event.name.toLowerCase().includes('fight night') ? 'fight_night'
        : event.name.match(/UFC \d+/) ? 'numbered' : 'fight_night',
      event.venueName ?? null,
      [event.venueCity, event.venueCountry].filter(Boolean).join(', ') || null,
      event.scheduledAt,
      mapStatus(event.status, event.completed),
    ]);

    // Sync fight card, tracking any fighter changes
    const changedFights: string[] = [];
    for (const fight of event.fights) {
      const changed = await upsertFight(client, dbEvent.id, fight);
      if (changed) changedFights.push(`${fight.redCorner.displayName} vs ${fight.blueCorner.displayName}`);
    }

    await client.query('COMMIT');

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
  const { rows: users } = await db.query(`
    SELECT DISTINCT up.id as user_id
    FROM league_events le
    JOIN leagues l ON l.id = le.league_id
    JOIN league_members lm ON lm.league_id = l.id
    JOIN user_profiles up ON up.id = lm.user_id
    WHERE le.event_id = $1 AND le.is_scoring = true
  `, [eventId]);

  if (!users.length) return;

  const shortName = eventName.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ').replace(/^UFC\s+/i, 'UFC ');
  const count = changedFights.length;
  const body = count === 1
    ? `${changedFights[0]} has changed — review your picks before the event starts.`
    : `${count} fights updated — review your picks before the event starts.`;

  console.log(`[EventSync] Notifying ${users.length} users of card changes for ${eventName}`);

  await Promise.allSettled(
    users.map((u) =>
      sendNotification(u.user_id, 'card_change', `${shortName} card update`, body, { eventId }),
    ),
  );
}

async function upsertFight(client: import('pg').PoolClient, eventId: string, fight: EspnFight): Promise<boolean> {
  // Resolve fighters by ESPN athlete ID
  const [redFighter, blueFighter] = await Promise.all([
    resolveOrCreateFighter(client, fight.redCorner),
    resolveOrCreateFighter(client, fight.blueCorner),
  ]);

  if (!redFighter || !blueFighter) return false;

  // If this ESPN fight ID doesn't exist yet, check whether either fighter is already
  // booked for this event under a different ESPN fight ID. This prevents stale ESPN
  // competition records (e.g. cancelled matchups) from creating duplicate DB rows.
  const { rows: [existingById] } = await client.query(
    `SELECT id, red_fighter_id, blue_fighter_id FROM fights WHERE ufc_fight_id = $1`, [fight.espnFightId],
  );

  // Detect if fighters changed on an existing fight
  const fightersChanged = !!existingById && (
    existingById.red_fighter_id !== redFighter || existingById.blue_fighter_id !== blueFighter
  );

  if (!existingById) {
    const { rows: [duplicate] } = await client.query(`
      SELECT id FROM fights
      WHERE event_id = $1
        AND ufc_fight_id != $2
        AND (red_fighter_id IN ($3,$4) OR blue_fighter_id IN ($3,$4))
      LIMIT 1
    `, [eventId, fight.espnFightId, redFighter, blueFighter]);
    if (duplicate) {
      console.log(`[EventSync] Skipping duplicate fight ${fight.espnFightId} — fighter already booked for this event`);
      return false;
    }
  }

  // Resolve weight class
  const { rows: [weightClass] } = await client.query(
    `SELECT id FROM weight_classes WHERE name ILIKE $1 OR slug ILIKE $2 LIMIT 1`,
    [fight.weightClassText, fight.weightClassText.toLowerCase().replace(/\s+/g, '-')],
  );
  if (!weightClass) return false;

  await client.query(`
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
  `, [
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
  ]);

  return fightersChanged;
}

async function resolveOrCreateFighter(
  client: import('pg').PoolClient,
  corner: EspnFight['redCorner'],
): Promise<string | null> {
  // Try by ESPN ID first
  const { rows: [byEspnId] } = await client.query(
    `SELECT id FROM fighters WHERE ufc_fighter_id = $1`,
    [corner.espnAthleteId],
  );
  if (byEspnId) return byEspnId.id;

  // Try by name
  const nameParts = corner.displayName.trim().split(/\s+/);
  const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0];
  const lastName = nameParts[nameParts.length - 1];

  const { rows: [byName] } = await client.query(
    `SELECT id FROM fighters WHERE first_name ILIKE $1 AND last_name ILIKE $2 LIMIT 1`,
    [firstName, lastName],
  );
  if (byName) {
    // Store the ESPN ID for future lookups
    await client.query(
      `UPDATE fighters SET ufc_fighter_id = $1 WHERE id = $2`,
      [corner.espnAthleteId, byName.id],
    );
    return byName.id;
  }

  // Create a minimal fighter record — will be enriched by fighterSync
  const { rows: [wc] } = await client.query(
    `SELECT id FROM weight_classes WHERE display_order = 5`, // Default: Lightweight
  );

  let wins = 0, losses = 0, draws = 0;
  if (corner.record) {
    const parts = corner.record.split('-');
    wins = parseInt(parts[0]) || 0;
    losses = parseInt(parts[1]) || 0;
    draws = parseInt(parts[2]) || 0;
  }

  const { rows: [newFighter] } = await client.query(`
    INSERT INTO fighters (ufc_fighter_id, first_name, last_name, weight_class_id, record_wins, record_losses, record_draws)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [corner.espnAthleteId, firstName, lastName, wc?.id, wins, losses, draws]);

  return newFighter?.id ?? null;
}

function mapStatus(state: string, completed: boolean): string {
  if (completed) return 'completed';
  if (state === 'in') return 'live';
  return 'scheduled';
}
