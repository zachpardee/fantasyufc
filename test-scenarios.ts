import './apps/api/src/config/env';
import { db } from './apps/api/src/config/database';
import { processFightResult } from './apps/api/src/services/scoring.service';
import { finalizeMatchupResults } from './apps/api/src/services/matchup.service';

async function reset(leagueId: string, eventId: string) {
  // roster_win_bonuses refs fight_results — delete dependents first
  await db.query(`DELETE FROM roster_win_bonuses WHERE league_id=$1`, [leagueId]);
  await db.query(`DELETE FROM fight_results WHERE fight_id IN (SELECT id FROM fights WHERE event_id=$1)`, [eventId]);
  await db.query(`UPDATE fights SET status='scheduled' WHERE event_id=$1`, [eventId]);
  await db.query(`DELETE FROM event_picks WHERE league_id=$1`, [leagueId]);
  await db.query(`DELETE FROM perfect_card_bonuses WHERE league_id=$1`, [leagueId]);
  await db.query(`DELETE FROM matchup_scores WHERE matchup_id IN (SELECT id FROM matchups WHERE league_id=$1)`, [leagueId]);
  await db.query(`UPDATE matchups SET home_score=0, away_score=0, winner_id=NULL WHERE league_id=$1`, [leagueId]);
  await db.query(`UPDATE league_members SET wins=0, losses=0, ties=0, streak=0, total_points=0 WHERE league_id=$1`, [leagueId]);
}

async function scoreFight(f: any, winnerId: string, outcome: string) {
  const { rows: [fr] } = await db.query(`
    INSERT INTO fight_results (fight_id, winner_id, winner_side, outcome, ending_round, ending_time_seconds, performance_of_night, fight_of_night)
    VALUES ($1,$2,$3,$4,3,0,false,false)
    ON CONFLICT (fight_id) DO UPDATE SET winner_id=$2, winner_side=$3, outcome=$4, ending_round=3
    RETURNING id
  `, [f.id, winnerId, winnerId === f.red_fighter_id ? 'red' : 'blue', outcome]);
  await db.query(`UPDATE fights SET status='completed' WHERE id=$1`, [f.id]);
  await processFightResult(fr.id);
}

async function report(leagueId: string, label: string) {
  const m = (await db.query(`
    SELECT ht.team_name as home, m.home_score, at2.team_name as away, m.away_score,
      ht.total_points as home_season, at2.total_points as away_season,
      ht.wins as hw, ht.losses as hl, at2.wins as aw, at2.losses as al
    FROM matchups m
    JOIN league_members ht ON ht.id=m.home_team_id
    JOIN league_members at2 ON at2.id=m.away_team_id
    WHERE m.league_id=$1
  `, [leagueId])).rows[0];
  const picks = (await db.query(`
    SELECT lm.team_name, SUM(CASE WHEN ep.is_correct THEN 1 ELSE 0 END) as correct
    FROM event_picks ep JOIN league_members lm ON lm.id=ep.member_id
    WHERE ep.league_id=$1 GROUP BY lm.team_name ORDER BY lm.team_name
  `, [leagueId])).rows;
  console.log(`\n--- ${label} ---`);
  picks.forEach((p:any) => console.log(`  Correct: ${p.team_name} ${p.correct}/6`));
  console.log(`  Matchup: ${m.home} ${m.home_score} vs ${m.away} ${m.away_score}`);
  console.log(`  Season:  ${m.home} ${m.home_season} | ${m.away} ${m.away_season}`);
  console.log(`  Records: ${m.home} ${m.hw}W-${m.hl}L | ${m.away} ${m.aw}W-${m.al}L`);
}

async function run() {
  const leagueId = (await db.query(`SELECT id FROM leagues WHERE name='Testy Leagy'`)).rows[0].id;
  const eventId = (await db.query(`SELECT id FROM ufc_events WHERE name ILIKE '%Song%Figueiredo%'`)).rows[0].id;
  const { rows: members } = await db.query(
    `SELECT id, team_name FROM league_members WHERE league_id=$1 ORDER BY team_name`, [leagueId]
  );
  const [m1, m2] = members;
  const { rows: top6 } = await db.query(`
    SELECT id, red_fighter_id, blue_fighter_id FROM fights WHERE event_id=$1
    ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC, id DESC LIMIT 6
  `, [eventId]);

  // ── Scenario 1: 4/6 vs 3/6 ──────────────────────────────────────────────
  await reset(leagueId, eventId);
  // m1 picks red for all 6 (DEC), m2 picks blue for all 6 (DEC)
  for (const f of top6) {
    await db.query(`INSERT INTO event_picks (league_id,member_id,fight_id,picked_fighter_id,picked_method) VALUES ($1,$2,$3,$4,'decision') ON CONFLICT (league_id,member_id,fight_id) DO UPDATE SET picked_fighter_id=$4,picked_method='decision'`, [leagueId, m1.id, f.id, f.red_fighter_id]);
    await db.query(`INSERT INTO event_picks (league_id,member_id,fight_id,picked_fighter_id,picked_method) VALUES ($1,$2,$3,$4,'decision') ON CONFLICT (league_id,member_id,fight_id) DO UPDATE SET picked_fighter_id=$4,picked_method='decision'`, [leagueId, m2.id, f.id, f.blue_fighter_id]);
  }
  // red wins fights 0-3, blue wins fights 4-5 → m1: 4/6, m2: 2/6
  for (let i = 0; i < 4; i++) await scoreFight(top6[i], top6[i].red_fighter_id, 'ko_tko');
  for (let i = 4; i < 6; i++) await scoreFight(top6[i], top6[i].blue_fighter_id, 'decision_unanimous');
  await finalizeMatchupResults(leagueId, eventId);
  // m1: 4 correct × 100 = 400 + 100 milestone = 500 matchup
  // m2: 2 correct × 100 = 200, no milestone
  await report(leagueId, 'Scenario 1: m1=4/6 (500 matchup), m2=2/6 (200 matchup)');

  // ── Scenario 2: 5/6 vs 5/6 (tie on picks, check roster bonus decides) ───
  await reset(leagueId, eventId);
  for (const f of top6) {
    await db.query(`INSERT INTO event_picks (league_id,member_id,fight_id,picked_fighter_id,picked_method) VALUES ($1,$2,$3,$4,'decision') ON CONFLICT (league_id,member_id,fight_id) DO UPDATE SET picked_fighter_id=$4,picked_method='decision'`, [leagueId, m1.id, f.id, f.red_fighter_id]);
    await db.query(`INSERT INTO event_picks (league_id,member_id,fight_id,picked_fighter_id,picked_method) VALUES ($1,$2,$3,$4,'decision') ON CONFLICT (league_id,member_id,fight_id) DO UPDATE SET picked_fighter_id=$4,picked_method='decision'`, [leagueId, m2.id, f.id, f.red_fighter_id]);
  }
  // Both picked red. Red wins 5, blue wins fight[5] → both 5/6
  for (let i = 0; i < 5; i++) await scoreFight(top6[i], top6[i].red_fighter_id, 'decision_unanimous');
  await scoreFight(top6[5], top6[5].blue_fighter_id, 'decision_unanimous');
  // Give m1's roster the winner of fight[0] so m1 gets a +50 roster tiebreaker
  const { rows: [m1Roster] } = await db.query(`SELECT id FROM rosters WHERE league_member_id=$1`, [m1.id]);
  await db.query(`INSERT INTO roster_fighters (roster_id, fighter_id, slot_type) VALUES ($1,$2,'starter') ON CONFLICT (roster_id, fighter_id) DO NOTHING`, [m1Roster.id, top6[0].red_fighter_id]);
  await finalizeMatchupResults(leagueId, eventId);
  // Both: 5 correct × 100 = 500 + 200 milestone = 700 pick pts
  // m1 also: +50 roster bonus → 750 total. m1 wins.
  await report(leagueId, 'Scenario 2: both 5/6 tied on picks, m1 has roster winner (+50 tiebreaker)');

  process.exit(0);
}
run().catch(e => { console.error(e.message, e.stack); process.exit(1); });
