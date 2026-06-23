/**
 * Seeds event_champion_picks for the full test league across all past events.
 * Usage: DATABASE_URL=... npx tsx src/db/seeds/champion_picks_test.ts
 */
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // Find the test league (most members, active/completed status)
  const { rows: leagues } = await db.query(`
    SELECT l.id, l.name, l.status, COUNT(lm.id)::int AS member_count
    FROM leagues l
    JOIN league_members lm ON lm.league_id = l.id AND lm.is_active = true
    GROUP BY l.id, l.name, l.status
    ORDER BY member_count DESC, l.created_at DESC
    LIMIT 5
  `);
  console.log(
    'Leagues:',
    leagues.map((l: any) => `${l.name} (${l.member_count} members, ${l.status})`),
  );

  const league = leagues[0];
  if (!league) {
    console.log('No leagues found');
    return;
  }
  console.log(`\nUsing league: ${league.name} (${league.id})`);

  // Get members
  const { rows: members } = await db.query(
    `
    SELECT id, team_name FROM league_members
    WHERE league_id = $1 AND is_active = true
    ORDER BY total_points DESC
  `,
    [league.id],
  );
  console.log(
    'Members:',
    members.map((m: any) => m.team_name),
  );

  // Get past scoring events (completed)
  const { rows: events } = await db.query(
    `
    SELECT e.id, e.name
    FROM ufc_events e
    JOIN league_events le ON le.event_id = e.id
    WHERE le.league_id = $1 AND le.is_scoring = true AND e.status = 'completed'
    ORDER BY e.scheduled_at ASC
  `,
    [league.id],
  );
  console.log(
    'Past events:',
    events.map((e: any) => e.name),
  );

  let inserted = 0;
  for (const event of events) {
    // Top-6 fights for this event
    const { rows: fights } = await db.query(
      `
      SELECT f.id, f.red_fighter_id, f.blue_fighter_id,
             rf.first_name || ' ' || rf.last_name AS red_name,
             bf.first_name || ' ' || bf.last_name AS blue_name,
             fr.winner_id
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      LEFT JOIN fight_results fr ON fr.fight_id = f.id
      WHERE f.event_id = $1
      ORDER BY f.is_main_event DESC, f.is_co_main DESC, f.bout_order DESC, f.id DESC
      LIMIT 6
    `,
      [event.id],
    );

    if (!fights.length) {
      console.log(`  ${event.name}: no fights, skipping`);
      continue;
    }

    // All fighters across top-6 fights
    const fighters = fights.flatMap((f: any) => [
      { id: f.red_fighter_id, name: f.red_name, fightId: f.id, winnerId: f.winner_id },
      { id: f.blue_fighter_id, name: f.blue_name, fightId: f.id, winnerId: f.winner_id },
    ]);

    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      // Rotate through fighters so each member picks a different one
      const pick = fighters[i % fighters.length];
      const pointsEarned = pick.winnerId === pick.id ? 30 : 0;

      await db.query(
        `
        INSERT INTO event_champion_picks
          (league_id, member_id, event_id, fighter_id, fight_id, points_earned)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (league_id, member_id, event_id) DO UPDATE SET
          fighter_id = EXCLUDED.fighter_id,
          fight_id = EXCLUDED.fight_id,
          points_earned = EXCLUDED.points_earned
      `,
        [league.id, member.id, event.id, pick.id, pick.fightId, pointsEarned],
      );

      inserted++;
      console.log(
        `  ${event.name} · ${member.team_name} → ${pick.name} (${pointsEarned > 0 ? '+30' : '0 pts'})`,
      );
    }
  }

  console.log(`\nInserted/updated ${inserted} champion picks.`);
  await db.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
