import { db } from '../src/config/database';
import { generateMatchupsForLeague } from '../src/services/matchup.service';

async function main() {
  const { rows: leagues } = await db.query(`
    SELECT l.id, l.name, l.status,
      (SELECT COUNT(*) FROM league_events le WHERE le.league_id = l.id AND le.is_scoring = true) as event_count,
      (SELECT COUNT(*) FROM matchups m WHERE m.league_id = l.id AND m.is_playoffs = false) as regular_matchups,
      (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id AND lm.is_active = true) as member_count
    FROM leagues l
    WHERE l.status IN ('active', 'playoffs')
    ORDER BY l.created_at DESC
  `);

  console.log('Active leagues:');
  for (const l of leagues) {
    console.log(`  ${l.name} (${l.id}): status=${l.status}, events=${l.event_count}, regular_matchups=${l.regular_matchups}, members=${l.member_count}`);
  }

  for (const league of leagues) {
    console.log(`\nRegenerating matchups for: ${league.name} (${league.id})`);
    try {
      const result = await generateMatchupsForLeague(league.id);
      console.log(`  Done: ${result.events} events, ${result.rounds} rounds, ${result.teams} teams`);
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
    }
  }

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
