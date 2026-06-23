import './apps/api/src/config/env';
import { db } from './apps/api/src/config/database';

async function main() {
  const { rows: leagues } = await db.query(`SELECT id FROM leagues WHERE name ILIKE '%testy%'`);
  if (!leagues.length) {
    console.log('No test league found');
    return;
  }
  const leagueId = leagues[0].id;

  // Delete all roster_fighters for this league
  const { rowCount: deleted } = await db.query(
    `
    DELETE FROM roster_fighters
    WHERE roster_id IN (
      SELECT r.id FROM rosters r
      JOIN league_members lm ON lm.id = r.league_member_id
      WHERE lm.league_id = $1
    )
  `,
    [leagueId],
  );
  console.log(`Deleted ${deleted} roster entries`);

  // Repopulate from draft_picks
  const { rowCount: inserted } = await db.query(
    `
    INSERT INTO roster_fighters (roster_id, fighter_id, slot_type, acquired_via)
    SELECT r.id, dp.fighter_id, 'starter', 'draft'
    FROM draft_picks dp
    JOIN draft_sessions ds ON ds.id = dp.draft_session_id
    JOIN rosters r ON r.league_member_id = dp.league_member_id
    WHERE ds.league_id = $1
  `,
    [leagueId],
  );
  console.log(`Inserted ${inserted} roster entries from draft picks`);

  // Verify
  const { rows } = await db.query(
    `
    SELECT lm.user_id, COUNT(rf.id) as count
    FROM roster_fighters rf
    JOIN rosters r ON r.id = rf.roster_id
    JOIN league_members lm ON lm.id = r.league_member_id
    WHERE lm.league_id = $1
    GROUP BY lm.user_id
  `,
    [leagueId],
  );
  console.log('Final counts:', rows);

  await db.end();
}

main().catch(console.error);
