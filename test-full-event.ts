import './apps/api/src/config/env';
import { db } from './apps/api/src/config/database';
import { processFightResult } from './apps/api/src/services/scoring.service';
import { finalizeMatchupResults } from './apps/api/src/services/matchup.service';

// Fight results: [fightId, winnerId (red=r/blue=b), outcome, round]
// Picks: My Team mostly red/DQ, Zach 2 mostly blue
// Making red win most fights so My Team wins matchup; giving some method matches
const fights = [
  // fight_id, red_id, blue_id, winner_side, outcome, round
  ['f994fc23-5ba3-43e4-aa2e-073fdea4f8ab', null, 'red', 'decision_unanimous', 3],   // Kangjie wins - my_team: red DEC ✓ method
  ['84e5c665-7710-422c-82e6-e86926fe52df', null, 'blue', 'decision_unanimous', 3],  // Tsuruya wins - both picked blue, my DQ ✗ method, them no method
  ['9f2c75d4-c303-4c98-afef-48167aae74b0', null, 'blue', 'decision_split', 3],      // Henrique wins - my blue DEC ✓ winner+method=300, them red ✗
  ['bcb518e1-e303-4fd3-b2ce-a4b359326128', null, 'red', 'submission', 2],           // Dias wins - my red DEC ✓ winner, them blue ✗
  ['b5fcf8fc-231f-4372-9f01-032241550c17', null, 'red', 'ko_tko', 1],              // Perez wins - both picked red, my DQ ✗ method, them no method→100pts each
  ['415b1009-d169-47c5-b602-a472f708b6f6', null, 'red', 'decision_unanimous', 3],  // Matthews wins - my red DQ ✗ method, them blue ✗
  ['e82a2121-a622-4245-a503-3ae00672d338', null, 'red', 'decision_unanimous', 3],  // Asakura wins - my red DQ ✗ method, them blue ✗
  ['1f8be1cb-1269-44f2-90a1-2bd415bb9edc', null, 'red', 'ko_tko', 2],             // Pavlovich wins - my red DQ ✗ method, them blue ✗
  ['5493a2bd-2279-4099-8f6e-62a5ad59a4ad', null, 'red', 'decision_unanimous', 3],  // Menifield wins - my red DQ ✗ method, them blue ✗
  ['232f53e3-0709-4338-ade6-c17db20f326d', null, 'red', 'decision_unanimous', 3],  // Yadong wins - my red DQ ✗ method, them blue ✗
];

// Fetch red/blue fighter IDs for each fight
async function run() {
  const leagueId = (await db.query(`SELECT id FROM leagues WHERE name='Testy Leagy'`)).rows[0].id;
  const eventId = (await db.query(`SELECT id FROM ufc_events WHERE name ILIKE '%Song%Figueiredo%'`)).rows[0].id;

  for (const [fightId, , side, outcome, round] of fights) {
    const { rows: [fight] } = await db.query(
      `SELECT red_fighter_id, blue_fighter_id FROM fights WHERE id=$1`, [fightId]
    );
    const winnerId = side === 'red' ? fight.red_fighter_id : fight.blue_fighter_id;

    const { rows: [fr] } = await db.query(`
      INSERT INTO fight_results (fight_id, winner_id, winner_side, outcome, ending_round, ending_time_seconds, performance_of_night, fight_of_night)
      VALUES ($1,$2,$3,$4,$5,0,false,false)
      ON CONFLICT (fight_id) DO UPDATE SET winner_id=$2, winner_side=$3, outcome=$4, ending_round=$5
      RETURNING id
    `, [fightId, winnerId, side, outcome, round]);

    await db.query(`UPDATE fights SET status='completed' WHERE id=$1`, [fightId]);
    await processFightResult(fr.id);
    process.stdout.write('.');
  }

  console.log('\nAll fights scored. Finalizing matchup...');
  await finalizeMatchupResults(leagueId, eventId);

  // Results
  const picks = await db.query(`
    SELECT lm.team_name, COUNT(*) as total,
      SUM(CASE WHEN ep.is_correct THEN 1 ELSE 0 END) as correct,
      SUM(ep.points_earned) as pick_pts
    FROM event_picks ep
    JOIN league_members lm ON lm.id = ep.member_id
    WHERE ep.league_id=$1
    GROUP BY lm.team_name
  `, [leagueId]);
  console.log('\nPick summary:');
  picks.rows.forEach((r: any) => console.log(` ${r.team_name}: ${r.correct}/${r.total} correct, ${r.pick_pts} pts`));

  const matchup = await db.query(`
    SELECT ht.team_name as home, m.home_score, at2.team_name as away, m.away_score, m.winner_id,
      ht.total_points as home_season, at2.total_points as away_season
    FROM matchups m
    JOIN league_members ht ON ht.id=m.home_team_id
    JOIN league_members at2 ON at2.id=m.away_team_id
    WHERE m.league_id=$1
  `, [leagueId]);
  console.log('\nMatchup result:');
  const m = matchup.rows[0];
  console.log(` ${m.home}: matchup=${m.home_score}, season=${m.home_season}`);
  console.log(` ${m.away}: matchup=${m.away_score}, season=${m.away_season}`);
  console.log(` Winner: ${m.winner_id ? (m.winner_id === (await db.query('SELECT id FROM league_members WHERE team_name=$1', [m.home])).rows[0]?.id ? m.home : m.away) : 'TBD'}`);

  const perfect = await db.query(`SELECT lm.team_name, pcb.fights_correct, pcb.points_awarded FROM perfect_card_bonuses pcb JOIN league_members lm ON lm.id=pcb.member_id`);
  console.log('\nPerfect card bonuses:', perfect.rows.length ? perfect.rows : 'none');

  const winBonus = await db.query(`SELECT lm.team_name, rwb.points_awarded FROM roster_win_bonuses rwb JOIN league_members lm ON lm.id=rwb.member_id`);
  console.log('Roster win bonuses:', winBonus.rows.length ? winBonus.rows : 'none');

  process.exit(0);
}
run().catch(e => { console.error(e.message, e.stack); process.exit(1); });
