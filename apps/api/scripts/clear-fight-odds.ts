/**
 * Clear stale/wrong odds for a scheduled fight (so it reads as honestly unpriced until a
 * valid line is auto-synced). Targets fights where either fighter's last name matches.
 *
 * Usage: tsx --env-file=.env scripts/clear-fight-odds.ts "chikadze"
 */
import { db } from '../src/config/database';

const NAME = (process.argv[2] ?? '').toLowerCase();

async function main() {
  if (!NAME) {
    console.log('Provide a fighter last-name substring.');
    await db.end();
    return;
  }

  const { rows } = await db.query(
    `
    SELECT f.id, e.name AS event_name,
           rf.first_name || ' ' || rf.last_name AS red,
           bf.first_name || ' ' || bf.last_name AS blue,
           f.red_fighter_odds, f.blue_fighter_odds
    FROM fights f
    JOIN ufc_events e ON e.id = f.event_id
    JOIN fighters rf ON rf.id = f.red_fighter_id
    JOIN fighters bf ON bf.id = f.blue_fighter_id
    WHERE (LOWER(rf.last_name) LIKE $1 OR LOWER(bf.last_name) LIKE $1)
      AND e.status = 'scheduled'
    `,
    [`%${NAME}%`],
  );

  if (!rows.length) {
    console.log(`No scheduled fight found for "${NAME}".`);
    await db.end();
    return;
  }

  for (const f of rows) {
    console.log(
      `${f.event_name}: ${f.red} vs ${f.blue}  | before → red: ${f.red_fighter_odds ?? 'NULL'}  blue: ${f.blue_fighter_odds ?? 'NULL'}`,
    );
    await db.query(
      `UPDATE fights SET red_fighter_odds = NULL, blue_fighter_odds = NULL WHERE id = $1`,
      [f.id],
    );
    console.log(`  → cleared (both NULL). Auto-sync will refill if/when a valid line is posted.`);
  }

  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
