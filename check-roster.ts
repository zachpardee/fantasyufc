import './apps/api/src/config/env';
import { db } from './apps/api/src/config/database';

async function main() {
  const { rows } = await db.query(`
    SELECT lm.user_id, l.name as league_name, COUNT(rf.id) as fighter_count,
           array_agg(f.first_name || ' ' || f.last_name ORDER BY f.first_name) as fighters
    FROM roster_fighters rf
    JOIN rosters r ON r.id = rf.roster_id
    JOIN league_members lm ON lm.id = r.league_member_id
    JOIN leagues l ON l.id = lm.league_id
    JOIN fighters f ON f.id = rf.fighter_id
    GROUP BY lm.user_id, l.name
    ORDER BY l.name, lm.user_id
  `);
  console.log(JSON.stringify(rows, null, 2));

  // Also check for duplicates
  const { rows: dupes } = await db.query(`
    SELECT rf.roster_id, rf.fighter_id, COUNT(*) as cnt,
           f.first_name || ' ' || f.last_name as fighter_name
    FROM roster_fighters rf
    JOIN fighters f ON f.id = rf.fighter_id
    GROUP BY rf.roster_id, rf.fighter_id, f.first_name, f.last_name
    HAVING COUNT(*) > 1
  `);
  if (dupes.length > 0) {
    console.log('\nDUPLICATES FOUND:');
    console.log(JSON.stringify(dupes, null, 2));
  } else {
    console.log('\nNo duplicates found.');
  }

  await db.end();
}

main().catch(console.error);
// Check draft picks too - appended for debugging
