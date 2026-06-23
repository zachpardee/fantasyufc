import 'dotenv/config';
import { db } from '../src/config/database';
import { fetchEventsByDate } from '../src/services/espn.adapter';

async function run() {
  // Pull the last 12 events worth of dates to cover current + recent cards
  const { rows: events } = await db.query(
    `SELECT ufc_event_id, name, scheduled_at FROM ufc_events ORDER BY scheduled_at DESC LIMIT 12`,
  );

  let updated = 0;
  const seen = new Set<string>();

  for (const event of events) {
    const dateStr = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
    const espnEvents = await fetchEventsByDate(dateStr);
    const match = espnEvents.find(
      (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
    );
    if (!match) {
      console.log(`  No ESPN match for: ${event.name}`);
      continue;
    }

    for (const fight of match.fights) {
      for (const corner of [fight.redCorner, fight.blueCorner]) {
        if (!corner.country || seen.has(corner.espnAthleteId)) continue;
        seen.add(corner.espnAthleteId);
        const r = await db.query(`UPDATE fighters SET nationality = $1 WHERE ufc_fighter_id = $2`, [
          corner.country,
          corner.espnAthleteId,
        ]);
        if (r.rowCount && r.rowCount > 0) {
          console.log(`  ${corner.displayName} → ${corner.country}`);
          updated++;
        }
      }
    }
    console.log(`Done: ${event.name}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nUpdated ${updated} fighters with nationality.`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
