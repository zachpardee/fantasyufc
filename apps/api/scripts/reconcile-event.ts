/**
 * Force a fight-card reconcile for one scheduled event: pulls the live ESPN card and runs
 * upsertEventPublic (which now removes stale bouts + inserts the real ones, voiding the
 * affected pending bets/picks).
 *
 * Usage: tsx --env-file=.env scripts/reconcile-event.ts "kape"
 */
import { db } from '../src/config/database';
import { fetchEventsByDate } from '../src/services/espn.adapter';
import { upsertEventPublic } from '../src/jobs/eventSync.job';

const NAME = (process.argv[2] ?? 'kape').toLowerCase();

async function main() {
  const {
    rows: [event],
  } = await db.query(
    `SELECT id, name, ufc_event_id, scheduled_at FROM ufc_events
     WHERE LOWER(name) LIKE $1 AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1`,
    [`%${NAME}%`],
  );
  if (!event) {
    console.log(`No scheduled event matching "${NAME}".`);
    await db.end();
    return;
  }

  const yyyymmdd = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
  const espnEvents = await fetchEventsByDate(yyyymmdd);
  const espnMatch = espnEvents.find(
    (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
  );
  if (!espnMatch) {
    console.log(`No ESPN event matched "${event.name}".`);
    await db.end();
    return;
  }

  console.log(`Reconciling "${event.name}" against ESPN (${espnMatch.fights.length} fights)...`);
  await upsertEventPublic(espnMatch);
  console.log('Done. Re-run compare-card.ts to verify.');
  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
