/**
 * Compare our stored fight card against the live ESPN card for an event, matched by
 * ufc_fight_id / espnFightId, to spot fighter swaps the upsert never applied.
 *
 * Usage: tsx --env-file=.env scripts/compare-card.ts "kape"
 */
import { db } from '../src/config/database';
import { fetchEventsByDate } from '../src/services/espn.adapter';

const NAME = (process.argv[2] ?? 'kape').toLowerCase();

async function main() {
  const {
    rows: [event],
  } = await db.query(
    `SELECT id, name, ufc_event_id, scheduled_at FROM ufc_events
     WHERE LOWER(name) LIKE $1 AND status = 'scheduled'
     ORDER BY scheduled_at ASC LIMIT 1`,
    [`%${NAME}%`],
  );
  if (!event) {
    console.log(`No scheduled event matching "${NAME}".`);
    await db.end();
    return;
  }
  console.log(
    `Event: "${event.name}"  (${event.scheduled_at})  ufc_event_id=${event.ufc_event_id}\n`,
  );

  const { rows: dbFights } = await db.query(
    `SELECT f.ufc_fight_id, f.bout_order,
            rf.first_name || ' ' || rf.last_name AS red,
            bf.first_name || ' ' || bf.last_name AS blue
     FROM fights f
     JOIN fighters rf ON rf.id = f.red_fighter_id
     JOIN fighters bf ON bf.id = f.blue_fighter_id
     WHERE f.event_id = $1
     ORDER BY f.bout_order DESC`,
    [event.id],
  );

  const yyyymmdd = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
  const espnEvents = await fetchEventsByDate(yyyymmdd).catch((e) => {
    console.log('ESPN fetch failed:', e.message);
    return [];
  });
  const espnMatch = espnEvents.find(
    (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
  );
  if (!espnMatch) {
    console.log(
      `No ESPN event matched. ESPN returned: ${espnEvents.map((e) => e.name).join(', ')}`,
    );
    await db.end();
    return;
  }

  const espnById = new Map(espnMatch.fights.map((f) => [f.espnFightId, f]));
  console.log('OUR DB  vs  ESPN (matched by fight id):\n');
  for (const d of dbFights) {
    const e = espnById.get(d.ufc_fight_id);
    const ours = `${d.red} vs ${d.blue}`;
    if (!e) {
      console.log(`  • ${ours}\n      ESPN: (no matching fight id ${d.ufc_fight_id})`);
      continue;
    }
    const theirs = `${e.redCorner.displayName} vs ${e.blueCorner.displayName}`;
    const same =
      ours.toLowerCase().replace(/\s+/g, '') === theirs.toLowerCase().replace(/\s+/g, '');
    console.log(
      `  ${same ? '✓' : '✗'} ${ours}\n      ESPN: ${theirs}${same ? '' : '   <-- MISMATCH'}`,
    );
  }

  // ESPN fights not present in our DB at all
  const dbIds = new Set(dbFights.map((d: any) => d.ufc_fight_id));
  const extra = espnMatch.fights.filter((f) => !dbIds.has(f.espnFightId));
  if (extra.length) {
    console.log('\nESPN fights NOT in our DB (new fight ids):');
    for (const e of extra)
      console.log(
        `  • ${e.redCorner.displayName} vs ${e.blueCorner.displayName}  (id ${e.espnFightId})`,
      );
  }

  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
