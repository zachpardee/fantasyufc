import cron from 'node-cron';
import { db } from '../config/database';
import { fetchEventsByDate } from '../services/espn.adapter';
import { searchEventResults } from '../services/sportsdb.adapter';
import { processFightResult } from '../services/scoring.service';
import { sendNotification } from '../services/notification.service';
import { finalizeMatchupResults } from '../services/matchup.service';

// Polls every 5 minutes. During live events it updates results in real-time.
export function startLivePollerJob() {
  cron.schedule('*/5 * * * *', () => pollLiveEvents(), { timezone: 'UTC' });
}

async function pollLiveEvents() {
  // Find events that are live or starting within 8 hours
  const { rows: activeEvents } = await db.query(`
    SELECT id, ufc_event_id, name, scheduled_at, status
    FROM ufc_events
    WHERE status IN ('live', 'scheduled')
      AND scheduled_at BETWEEN NOW() - INTERVAL '1 hour' AND NOW() + INTERVAL '8 hours'
  `);

  if (!activeEvents.length) return;

  for (const event of activeEvents) {
    try {
      await pollEvent(event);
    } catch (err) {
      console.error('[LivePoller] Error polling event:', event.name, err);
    }
  }
}

async function pollEvent(event: { id: string; ufc_event_id: string; name: string; scheduled_at: string; status: string }) {
  const dateStr = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
  const espnEvents = await fetchEventsByDate(dateStr);

  // Match our DB event to the ESPN event by ID or name
  const espnEvent = espnEvents.find(
    (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
  );
  if (!espnEvent) return;

  // Update event status
  const newStatus = espnEvent.completed ? 'completed' : espnEvent.status === 'in' ? 'live' : 'scheduled';
  if (newStatus !== event.status) {
    await db.query(`UPDATE ufc_events SET status = $1 WHERE id = $2`, [newStatus, event.id]);

    if (newStatus === 'live') {
      await notifyEventStarting(event.id, event.name);
    }
  }

  // Process each completed fight
  for (const espnFight of espnEvent.fights) {
    if (!espnFight.completed) continue;

    // Check if we already have a result for this fight
    const { rows: [existingFight] } = await db.query(
      `SELECT f.id, fr.id as result_id
       FROM fights f
       LEFT JOIN fight_results fr ON fr.fight_id = f.id
       WHERE f.ufc_fight_id = $1`,
      [espnFight.espnFightId],
    );

    if (!existingFight || existingFight.result_id) continue; // Already processed

    // Determine winner
    const isDraw = !espnFight.redCorner.isWinner && !espnFight.blueCorner.isWinner;
    const winner = isDraw ? null : (espnFight.redCorner.isWinner ? espnFight.redCorner : espnFight.blueCorner);
    const winnerSide = isDraw ? null : (espnFight.redCorner.isWinner ? 'red' : 'blue');

    if (!winner && !isDraw) continue;

    // Infer outcome from round/clock (method unknown at this stage)
    const isDecision = espnFight.period >= espnFight.scheduledRounds &&
      espnFight.clockSeconds >= espnFight.scheduledRounds * 300 - 5;
    const inferredOutcome = isDecision ? 'decision_unanimous' : 'ko_tko'; // Optimistic — updated by SportsDB

    // Resolve winner fighter ID (null for draws)
    let winnerId: string | null = null;
    if (winner) {
      const { rows: [winnerFighter] } = await db.query(
        `SELECT id FROM fighters WHERE ufc_fighter_id = $1`,
        [winner.espnAthleteId],
      );
      if (!winnerFighter) continue;
      winnerId = winnerFighter.id;
    }

    // Insert basic result (method will be corrected by SportsDB enrichment)
    const { rows: [fightResult] } = await db.query(`
      INSERT INTO fight_results (
        fight_id, winner_id, winner_side, outcome,
        ending_round, ending_time_seconds,
        performance_of_night, fight_of_night
      ) VALUES ($1, $2, $3, $4, $5, $6, false, false)
      RETURNING id
    `, [
      existingFight.id,
      winnerId,
      winnerSide,
      isDraw ? 'draw' : inferredOutcome,
      espnFight.period,
      espnFight.clockSeconds,
    ]);

    await db.query(`UPDATE fights SET status = 'completed' WHERE id = $1`, [existingFight.id]);

    // Trigger scoring for all leagues
    await processFightResult(fightResult.id).catch((err) =>
      console.error('[LivePoller] Scoring error for fight:', espnFight.espnFightId, err),
    );

    console.log(`[LivePoller] Processed result for fight ${espnFight.espnFightId}: ${isDraw ? 'DRAW' : winner!.displayName + ' wins'} R${espnFight.period}`);
  }

  // If event just completed, enrich methods from SportsDB then finalize matchup W/L records
  if (newStatus === 'completed') {
    await enrichResultsFromSportsDB(event.id, event.name);
    await finalizeAllLeagueMatchups(event.id);
  }
}

async function finalizeAllLeagueMatchups(eventId: string) {
  const { rows: leagues } = await db.query(`
    SELECT DISTINCT le.league_id
    FROM league_events le
    WHERE le.event_id = $1 AND le.is_scoring = true
  `, [eventId]);

  await Promise.allSettled(
    leagues.map((l) =>
      finalizeMatchupResults(l.league_id, eventId).catch((err) =>
        console.error('[LivePoller] finalizeMatchupResults error for league', l.league_id, err),
      ),
    ),
  );
}

async function enrichResultsFromSportsDB(eventId: string, eventName: string) {
  console.log('[LivePoller] Enriching results from SportsDB for:', eventName);

  // Try different name formats
  const searchName = eventName.replace(/^UFC\s+/i, 'UFC ').replace(/:.+$/, '').trim();
  const sportsDbEvent = await searchEventResults(searchName);

  if (!sportsDbEvent?.results.length) {
    console.warn('[LivePoller] No SportsDB results found for:', eventName);
    return;
  }

  const { rows: fights } = await db.query(`
    SELECT f.id, f.ufc_fight_id, fr.id as result_id, fr.outcome,
           rf.first_name as red_first, rf.last_name as red_last,
           bf.first_name as blue_first, bf.last_name as blue_last
    FROM fights f
    JOIN fight_results fr ON fr.fight_id = f.id
    JOIN fighters rf ON rf.id = f.red_fighter_id
    JOIN fighters bf ON bf.id = f.blue_fighter_id
    WHERE f.event_id = $1
  `, [eventId]);

  let updatedCount = 0;
  for (const fight of fights) {
    const redName = `${fight.red_first} ${fight.red_last}`.toLowerCase();
    const blueName = `${fight.blue_first} ${fight.blue_last}`.toLowerCase();

    const sdbResult = sportsDbEvent.results.find((r) => {
      const wName = r.winnerName.toLowerCase();
      const lName = r.loserName.toLowerCase();
      return (
        (redName.includes(wName.split(' ').pop()!) || wName.includes(redName.split(' ').pop()!)) ||
        (blueName.includes(lName.split(' ').pop()!) || lName.includes(blueName.split(' ').pop()!))
      );
    });

    if (!sdbResult || sdbResult.method === fight.outcome) continue;

    await db.query(
      `UPDATE fight_results SET outcome = $1, ending_round = $2, ending_time_seconds = $3 WHERE id = $4`,
      [sdbResult.method, sdbResult.round, sdbResult.timeSeconds, fight.result_id],
    );

    // Re-run scoring with corrected method (handles finish bonus correction)
    await processFightResult(fight.result_id).catch(console.error);
    updatedCount++;
  }

  console.log(`[LivePoller] SportsDB enrichment: corrected ${updatedCount} fight methods for ${eventName}`);
}

async function notifyEventStarting(eventId: string, eventName: string) {
  // Notify all users in leagues that have this event scheduled
  const { rows: users } = await db.query(`
    SELECT DISTINCT up.id as user_id
    FROM league_events le
    JOIN leagues l ON l.id = le.league_id
    JOIN league_members lm ON lm.league_id = l.id
    JOIN user_profiles up ON up.id = lm.user_id
    WHERE le.event_id = $1 AND le.is_scoring = true
  `, [eventId]);

  await Promise.allSettled(
    users.map((u) =>
      sendNotification(u.user_id, 'event_starting', `${eventName} is live!`,
        'Your fighters are competing now. Check your lineup!', { eventId }),
    ),
  );
}
