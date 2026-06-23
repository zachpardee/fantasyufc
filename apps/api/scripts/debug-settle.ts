import { db } from '../src/config/database';

async function main() {
  const {
    rows: [event],
  } = await db.query(`SELECT id FROM ufc_events WHERE status = 'live'`);

  // All fights in DB for this event
  const { rows: fights } = await db.query(
    `
    SELECT f.id, f.ufc_fight_id, f.status,
           rf.first_name || ' ' || rf.last_name as red,
           bf.first_name || ' ' || bf.last_name as blue,
           fr.outcome, fr.winner_id
    FROM fights f
    JOIN fighters rf ON rf.id = f.red_fighter_id
    JOIN fighters bf ON bf.id = f.blue_fighter_id
    LEFT JOIN fight_results fr ON fr.fight_id = f.id
    WHERE f.event_id = $1
    ORDER BY f.bout_order DESC
  `,
    [event.id],
  );

  console.log('Fights in DB:');
  for (const f of fights) {
    console.log(
      `  [${f.ufc_fight_id}] ${f.red} vs ${f.blue} | status: ${f.status} | result: ${f.outcome ?? 'none'}`,
    );
  }

  // Pending bets with fight IDs
  const { rows: pending } = await db.query(
    `
    SELECT DISTINCT ss.fight_id, f.ufc_fight_id,
           rf.first_name || ' ' || rf.last_name as fighter_bet_on,
           f2.id IS NOT NULL as fight_in_db,
           rf2.first_name || ' ' || rf2.last_name as red_corner,
           bf2.first_name || ' ' || bf2.last_name as blue_corner
    FROM staking_singles ss
    JOIN fighters rf ON rf.id = ss.fighter_id
    JOIN fights f ON f.id = ss.fight_id
    LEFT JOIN fights f2 ON f2.id = ss.fight_id
    LEFT JOIN fighters rf2 ON rf2.id = f2.red_fighter_id
    LEFT JOIN fighters bf2 ON bf2.id = f2.blue_fighter_id
    WHERE ss.status = 'pending' AND ss.event_id = $1
  `,
    [event.id],
  );

  console.log('\nUnique fights with pending bets:');
  for (const p of pending) {
    console.log(
      `  fight_id: ${p.fight_id} | ufc_fight_id: ${p.ufc_fight_id} | ${p.red_corner} vs ${p.blue_corner} | bet on: ${p.fighter_bet_on}`,
    );
  }

  await db.end();
}
main().catch(console.error);
