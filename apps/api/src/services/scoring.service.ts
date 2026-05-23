import { db } from '../config/database';

export async function processFightResult(fightResultId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [fightResult] } = await client.query<{
      id: string; fight_id: string; winner_id: string; outcome: string;
      event_id: string;
    }>(`
      SELECT fr.id, fr.fight_id, fr.winner_id, fr.outcome, f.event_id
      FROM fight_results fr
      JOIN fights f ON f.id = fr.fight_id
      WHERE fr.id = $1
    `, [fightResultId]);

    if (!fightResult) throw new Error(`Fight result ${fightResultId} not found`);

    // Collect all matchup IDs for this event
    const { rows: eventMatchups } = await client.query<{ id: string }>(
      `SELECT id FROM matchups WHERE event_id = $1`, [fightResult.event_id],
    );
    const processedMatchupIds = new Set<string>(eventMatchups.map((m) => m.id));

    // Score event picks:
    //   correct winner                         = 200 pts
    //   correct winner + method                = 300 pts
    //   correct winner + underdog (≥ +350 odds)= +100 bonus on top
    if (fightResult.winner_id) {
      const { rows: [fight] } = await client.query<{
        red_fighter_id: string; blue_fighter_id: string;
        red_fighter_odds: number | null; blue_fighter_odds: number | null;
      }>(`SELECT red_fighter_id, blue_fighter_id, red_fighter_odds, blue_fighter_odds FROM fights WHERE id = $1`,
        [fightResult.fight_id]);

      const winnerOdds = fight.red_fighter_id === fightResult.winner_id
        ? fight.red_fighter_odds
        : fight.blue_fighter_odds;
      const isUnderdog = winnerOdds != null && winnerOdds >= 350;

      await client.query(`
        UPDATE event_picks
        SET is_correct = (picked_fighter_id = $1),
            points_earned = CASE
              WHEN picked_fighter_id = $1 AND (
                (picked_method = 'ko_tko'          AND $2 = 'ko_tko') OR
                (picked_method = 'submission'       AND $2 = 'submission') OR
                (picked_method = 'decision'         AND $2 IN ('decision_unanimous','decision_split','decision_majority')) OR
                (picked_method = 'disqualification' AND $2 = 'disqualification')
              ) THEN 300 + CASE WHEN $3 THEN 100 ELSE 0 END
              WHEN picked_fighter_id = $1 THEN 200 + CASE WHEN $3 THEN 100 ELSE 0 END
              ELSE 0
            END
        WHERE fight_id = $4
      `, [fightResult.winner_id, fightResult.outcome, isUnderdog, fightResult.fight_id]);
    } else {
      await client.query(`
        UPDATE event_picks SET is_correct = false, points_earned = 0
        WHERE fight_id = $1
      `, [fightResult.fight_id]);
    }

    // +50 matchup pts for every league member who has the winning fighter on their roster
    if (fightResult.winner_id) {
      const ROSTER_WIN_BONUS = 50;
      const { rows: rosterOwners } = await client.query(`
        SELECT lm.id AS member_id, lm.league_id
        FROM roster_fighters rf
        JOIN rosters r ON r.id = rf.roster_id
        JOIN league_members lm ON lm.id = r.league_member_id
        JOIN league_events le ON le.league_id = lm.league_id AND le.is_scoring = true
        JOIN fights fi ON fi.event_id = le.event_id AND fi.id = $2
        WHERE rf.fighter_id = $1
      `, [fightResult.winner_id, fightResult.fight_id]);

      for (const owner of rosterOwners) {
        await client.query(`
          INSERT INTO roster_win_bonuses
            (league_id, member_id, fighter_id, fight_result_id, points_awarded)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (league_id, member_id, fight_result_id) DO NOTHING
        `, [owner.league_id, owner.member_id, fightResult.winner_id, fightResultId, ROSTER_WIN_BONUS]);
      }
    }

    // Matchup score = pick points + roster win bonuses (50 pts per drafted winner this event)
    for (const matchupId of processedMatchupIds) {
      await client.query(`
        UPDATE matchups SET
          home_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0)
            FROM event_picks ep
            WHERE ep.league_id = matchups.league_id
              AND ep.member_id = matchups.home_team_id
              AND ep.fight_id IN (SELECT id FROM fights WHERE event_id = $2)
          ) + (
            SELECT COALESCE(SUM(rwb.points_awarded), 0)
            FROM roster_win_bonuses rwb
            JOIN fight_results fr ON fr.id = rwb.fight_result_id
            JOIN fights fi ON fi.id = fr.fight_id
            WHERE rwb.league_id = matchups.league_id
              AND rwb.member_id = matchups.home_team_id
              AND fi.event_id = $2
          ),
          away_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0)
            FROM event_picks ep
            WHERE ep.league_id = matchups.league_id
              AND ep.member_id = matchups.away_team_id
              AND ep.fight_id IN (SELECT id FROM fights WHERE event_id = $2)
          ) + (
            SELECT COALESCE(SUM(rwb.points_awarded), 0)
            FROM roster_win_bonuses rwb
            JOIN fight_results fr ON fr.id = rwb.fight_result_id
            JOIN fights fi ON fi.id = fr.fight_id
            WHERE rwb.league_id = matchups.league_id
              AND rwb.member_id = matchups.away_team_id
              AND fi.event_id = $2
          )
        WHERE id = $1
      `, [matchupId, fightResult.event_id]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

