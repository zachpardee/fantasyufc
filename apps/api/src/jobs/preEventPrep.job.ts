import cron from 'node-cron';
import { db } from '../config/database';
import { fetchEventsByDate } from '../services/espn.adapter';
import { generateMatchupsForLeague } from '../services/matchup.service';
import { redis } from '../config/redis';
import { upsertEventPublic } from './eventSync.job';

// Runs every 4 hours. Within 48 hours of an event: also triggered after each eventSync.
// Handles everything so commissioners don't need to manually prepare events:
//   1. Refreshes fight cards for events within 7 days (ESPN may update cards)
//   2. Pushes upcoming events to every active league
//   3. Generates matchups for any leagues that newly received the event
//   4. Syncs odds from The Odds API (when ODDS_API_KEY is configured, within 7 days)
export function startPreEventPrepJob() {
  cron.schedule('0 */4 * * *', () => prepUpcomingEvents().catch(console.error), { timezone: 'UTC' });
}

export async function prepUpcomingEvents(): Promise<void> {
  console.log('[PreEventPrep] Running...');
  try {
    const { rows: events } = await db.query<{
      id: string; name: string; ufc_event_id: string; scheduled_at: string;
    }>(`
      SELECT id, name, ufc_event_id, scheduled_at
      FROM ufc_events
      WHERE status = 'scheduled'
        AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '14 days'
      ORDER BY scheduled_at ASC
    `);

    if (events.length === 0) {
      console.log('[PreEventPrep] No upcoming events in next 14 days');
      return;
    }

    for (const event of events) {
      const daysUntil = (new Date(event.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

      // Refresh fight card from ESPN for events within 7 days (roster changes, order shifts)
      if (daysUntil <= 7) {
        const yyyymmdd = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
        const espnEvents = await fetchEventsByDate(yyyymmdd).catch(() => []);
        const espnMatch = espnEvents.find(
          (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
        );
        if (espnMatch) {
          await upsertEventPublic(espnMatch);
          await redis.del('events:upcoming');
          console.log(`[PreEventPrep] Refreshed fight card for "${event.name}"`);
        }
      }

      // Ensure every active/playoffs league has this event and a matchup
      const pushed = await pushEventToAllLeagues(event.id);
      if (pushed > 0) {
        console.log(`[PreEventPrep] Pushed "${event.name}" to ${pushed} new league(s)`);
      }

      // Sync odds for events within 7 days when the API key is available
      if (process.env.ODDS_API_KEY && daysUntil <= 7) {
        const matched = await syncOddsForEvent(event).catch((err: Error) => {
          console.warn(`[PreEventPrep] Odds sync failed for "${event.name}": ${err.message}`);
          return 0;
        });
        if (matched) console.log(`[PreEventPrep] Updated odds for ${matched} fight(s) in "${event.name}"`);
      }
    }

    console.log('[PreEventPrep] Done');
  } catch (err) {
    console.error('[PreEventPrep] Error:', err);
  }
}

async function pushEventToAllLeagues(eventId: string): Promise<number> {
  const { rows: leagues } = await db.query<{ id: string }>(`
    SELECT l.id FROM leagues l
    WHERE l.status IN ('active', 'playoffs')
      AND NOT EXISTS (
        SELECT 1 FROM league_events le WHERE le.league_id = l.id AND le.event_id = $1
      )
  `, [eventId]);

  for (const league of leagues) {
    await db.query(
      `INSERT INTO league_events (league_id, event_id, is_scoring) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
      [league.id, eventId],
    );
    await generateMatchupsForLeague(league.id).catch((err: Error) =>
      console.error(`[PreEventPrep] Matchup gen failed for league ${league.id}:`, err.message),
    );
  }

  return leagues.length;
}

async function syncOddsForEvent(event: { id: string; name: string; scheduled_at: string }): Promise<number> {
  const apiKey = process.env.ODDS_API_KEY!;

  const { rows: fights } = await db.query<{
    id: string; red_last: string; blue_last: string;
  }>(`
    SELECT f.id, rf.last_name AS red_last, bf.last_name AS blue_last
    FROM fights f
    JOIN fighters rf ON rf.id = f.red_fighter_id
    JOIN fighters bf ON bf.id = f.blue_fighter_id
    WHERE f.event_id = $1
  `, [event.id]);

  if (!fights.length) return 0;

  const eventDate = new Date(event.scheduled_at);
  const commenceFrom = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const commenceTo = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const url = `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&commenceTimeFrom=${commenceFrom}&commenceTimeTo=${commenceTo}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return 0;

  const oddsEvents = await res.json() as any[];
  let matched = 0;

  for (const fight of fights) {
    const redLast = fight.red_last.toLowerCase();
    const blueLast = fight.blue_last.toLowerCase();

    const oddsEvent = oddsEvents.find((oe) => {
      const names = [oe.home_team?.toLowerCase() ?? '', oe.away_team?.toLowerCase() ?? ''];
      return names.some((n) => n.includes(redLast) || n.includes(blueLast));
    });
    if (!oddsEvent) continue;

    const bookmaker = oddsEvent.bookmakers?.find((b: any) => b.key === 'draftkings') ?? oddsEvent.bookmakers?.[0];
    const h2h = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
    if (!h2h) continue;

    let redOdds: number | null = null;
    let blueOdds: number | null = null;
    for (const outcome of h2h.outcomes ?? []) {
      const name = outcome.name?.toLowerCase() ?? '';
      if (name.includes(redLast)) redOdds = outcome.price;
      else if (name.includes(blueLast)) blueOdds = outcome.price;
    }

    if (redOdds !== null || blueOdds !== null) {
      await db.query(
        `UPDATE fights SET
          red_fighter_odds = COALESCE($1, red_fighter_odds),
          blue_fighter_odds = COALESCE($2, blue_fighter_odds)
         WHERE id = $3`,
        [redOdds, blueOdds, fight.id],
      );
      matched++;
    }
  }

  return matched;
}
