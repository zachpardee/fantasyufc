import './apps/api/src/config/env';
import { db } from './apps/api/src/config/database';

async function main() {
  const { rows } = await db.query(`
    SELECT dp.league_member_id, dp.overall_pick, dp.round_number, dp.pick_in_round,
           f.first_name || ' ' || f.last_name as fighter
    FROM draft_picks dp
    JOIN draft_sessions ds ON ds.id = dp.draft_session_id
    JOIN leagues l ON l.id = ds.league_id
    JOIN fighters f ON f.id = dp.fighter_id
    WHERE l.name ILIKE '%testy%'
    ORDER BY dp.overall_pick
  `);
  console.log(JSON.stringify(rows, null, 2));
  console.log('\nTotal draft picks:', rows.length);
  await db.end();
}

main().catch(console.error);
