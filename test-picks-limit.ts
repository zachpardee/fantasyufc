import './apps/api/src/config/env';
import { db } from './apps/api/src/config/database';
import { processFightResult } from './apps/api/src/services/scoring.service';
import { finalizeMatchupResults } from './apps/api/src/services/matchup.service';

async function run() {
  const leagueId = (await db.query(`SELECT id FROM leagues WHERE name='Testy Leagy'`)).rows[0].id;
  const eventId = (await db.query(`SELECT id FROM ufc_events WHERE name ILIKE '%Song%Figueiredo%'`)).rows[0].id;

  // --- Reset ---
  await db.query(`DELETE FROM roster_win_bonuses WHERE league_id=$1`, [leagueId]);
  await db.query(`DELETE FROM fight_results WHERE fight_id IN (SELECT id FROM fights WHERE event_id=$1)`, [eventId]);
  await db.query(`UPDATE fights SET status='scheduled' WHERE event_id=$1`, [eventId]);
  await db.query(`DELETE FROM event_picks WHERE league_id=$1`, [leagueId]);
  await db.query(`DELETE FROM perfect_card_bonuses WHERE league_id=$1`, [leagueId]);
  await db.query(`DELETE FROM matchup_scores WHERE matchup_id IN (SELECT id FROM matchups WHERE league_id=$1)`, [leagueId]);
  await db.query(`UPDATE matchups SET home_score=0, away_score=0, winner_id=NULL WHERE league_id=$1`, [leagueId]);
  await db.query(`UPDATE league_members SET wins=0, losses=0, ties=0, streak=0, total_points=0 WHERE league_id=$1`, [leagueId]);
  console.log('State reset.\n');

  // Top 6 pickable fights for this event
  const { rows: top6 } = await db.query(`
    SELECT id, red_fighter_id, blue_fighter_id, is_main_event, is_co_main, bout_order
    FROM fights WHERE event_id=$1
    ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC
    LIMIT 6
  `, [eventId]);
  console.log(`Top 6 fights: ${top6.map((f:any) => f.id.slice(0,8)).join(', ')}\n`);

  // Get both members
  const { rows: members } = await db.query(
    `SELECT id, team_name FROM league_members WHERE league_id=$1 ORDER BY team_name`, [leagueId]
  );
  const [m1, m2] = members;

  // Create picks: m1 picks red + decision, m2 picks blue + ko_tko
  for (const f of top6) {
    await db.query(`
      INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method)
      VALUES ($1,$2,$3,$4,'decision')
      ON CONFLICT (league_id,member_id,fight_id) DO UPDATE SET picked_fighter_id=$4, picked_method='decision'
    `, [leagueId, m1.id, f.id, f.red_fighter_id]);

    await db.query(`
      INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method)
      VALUES ($1,$2,$3,$4,'ko_tko')
      ON CONFLICT (league_id,member_id,fight_id) DO UPDATE SET picked_fighter_id=$4, picked_method='ko_tko'
    `, [leagueId, m2.id, f.id, f.blue_fighter_id]);
  }
  console.log(`Created picks: ${m1.team_name} → red/DEC, ${m2.team_name} → blue/KO\n`);

  // Put first fight's red fighter on m1's roster so they get a +50 roster bonus
  const { rows: [m1Roster] } = await db.query(
    `SELECT id FROM rosters WHERE league_member_id=$1`, [m1.id]
  );
  await db.query(`
    INSERT INTO roster_fighters (roster_id, fighter_id, slot_type)
    VALUES ($1, $2, 'starter')
    ON CONFLICT (roster_id, fighter_id) DO NOTHING
  `, [m1Roster.id, top6[0].red_fighter_id]);
  console.log(`Added fighter ${top6[0].red_fighter_id.slice(0,8)} to ${m1.team_name}'s roster\n`);

  // Score fights: red wins all via decision — m1 gets 6/6 correct + method=300 each, m2 gets 0/6
  for (const f of top6) {
    const { rows: [fr] } = await db.query(`
      INSERT INTO fight_results (fight_id, winner_id, winner_side, outcome, ending_round, ending_time_seconds, performance_of_night, fight_of_night)
      VALUES ($1,$2,'red','decision_unanimous',3,0,false,false)
      ON CONFLICT (fight_id) DO UPDATE SET winner_id=$2, winner_side='red', outcome='decision_unanimous', ending_round=3
      RETURNING id
    `, [f.id, f.red_fighter_id]);
    await db.query(`UPDATE fights SET status='completed' WHERE id=$1`, [f.id]);
    await processFightResult(fr.id);
    process.stdout.write('.');
  }
  console.log('\n\nFinalizing matchup...');
  await finalizeMatchupResults(leagueId, eventId);

  // Report
  const picks = await db.query(`
    SELECT lm.team_name, COUNT(*) as total,
      SUM(CASE WHEN ep.is_correct THEN 1 ELSE 0 END) as correct,
      SUM(ep.points_earned) as pick_pts
    FROM event_picks ep
    JOIN league_members lm ON lm.id=ep.member_id
    WHERE ep.league_id=$1 GROUP BY lm.team_name ORDER BY lm.team_name
  `, [leagueId]);
  console.log('\nPick summary:');
  picks.rows.forEach((r:any) => console.log(`  ${r.team_name}: ${r.correct}/${r.total} correct, ${r.pick_pts} pts`));

  const matchup = await db.query(`
    SELECT ht.team_name as home, m.home_score, at2.team_name as away, m.away_score,
      ht.total_points as home_season, at2.total_points as away_season, m.winner_id,
      ht.wins as hw, ht.losses as hl, at2.wins as aw, at2.losses as al
    FROM matchups m
    JOIN league_members ht ON ht.id=m.home_team_id
    JOIN league_members at2 ON at2.id=m.away_team_id
    WHERE m.league_id=$1
  `, [leagueId]);
  const row = matchup.rows[0];
  console.log(`\nMatchup: ${row.home} ${row.home_score} vs ${row.away} ${row.away_score}`);
  console.log(`Records: ${row.home} ${row.hw}W-${row.hl}L | ${row.away} ${row.aw}W-${row.al}L`);
  console.log(`Season:  ${row.home} ${row.home_season} pts | ${row.away} ${row.away_season} pts`);

  const perfect = await db.query(`
    SELECT lm.team_name, pcb.fights_correct, pcb.points_awarded
    FROM perfect_card_bonuses pcb JOIN league_members lm ON lm.id=pcb.member_id
    WHERE pcb.league_id=$1
  `, [leagueId]);
  console.log('\nPerfect card bonuses:', perfect.rows.length ? perfect.rows : 'none');

  const rosterBonuses = await db.query(`
    SELECT lm.team_name, SUM(rwb.points_awarded) as total
    FROM roster_win_bonuses rwb JOIN league_members lm ON lm.id=rwb.member_id
    WHERE rwb.league_id=$1 GROUP BY lm.team_name
  `, [leagueId]);
  console.log('Roster win bonuses:', rosterBonuses.rows.length ? rosterBonuses.rows : 'none');

  // Expected: m1 = 6/6 correct → 6×300=1800 pick pts + 300 milestone + 50 roster bonus = 2150 matchup
  // Season = 2150 + 250 (matchup win) + 300 (perfect card) = 2700
  console.log('\nExpected:');
  console.log(`  ${m1.team_name}: 6/6 correct, 2150 matchup pts (1800 picks + 300 milestone + 50 roster), perfect=300, season=2700`);
  console.log(`  ${m2.team_name}: 0/6 correct, 0 matchup pts, season=0`);

  process.exit(0);
}
run().catch(e => { console.error(e.message, e.stack); process.exit(1); });
