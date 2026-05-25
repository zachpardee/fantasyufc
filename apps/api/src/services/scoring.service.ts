import { db } from '../config/database';

export async function processFightResult(fightResultId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [fightResult] } = await client.query<{
      id: string; fight_id: string; winner_id: string | null; outcome: string;
      event_id: string; card_segment: string;
      red_fighter_id: string; blue_fighter_id: string;
      red_fighter_odds: number | null; blue_fighter_odds: number | null;
    }>(`
      SELECT fr.id, fr.fight_id, fr.winner_id, fr.outcome, f.event_id, f.card_segment,
             f.red_fighter_id, f.blue_fighter_id, f.red_fighter_odds, f.blue_fighter_odds
      FROM fight_results fr
      JOIN fights f ON f.id = fr.fight_id
      WHERE fr.id = $1
    `, [fightResultId]);

    if (!fightResult) throw new Error(`Fight result ${fightResultId} not found`);

    // Get all leagues that have this event, with their scoring settings
    const { rows: leagueConfigs } = await client.query(`
      SELECT le.league_id,
             ss.pts_win, ss.pts_ko_tko, ss.pts_submission, ss.pts_decision,
             ss.score_prelims, ss.score_early_prelims
      FROM league_events le
      JOIN scoring_settings ss ON ss.league_id = le.league_id
      WHERE le.event_id = $1 AND le.is_scoring = true
    `, [fightResult.event_id]);

    // All matchups for this event — used to recalculate scores at the end
    const { rows: eventMatchups } = await client.query(
      `SELECT id, league_id FROM matchups WHERE event_id = $1`,
      [fightResult.event_id],
    );

    const winnerOdds = fightResult.winner_id
      ? (fightResult.red_fighter_id === fightResult.winner_id
          ? fightResult.red_fighter_odds
          : fightResult.blue_fighter_odds)
      : null;
    const isUnderdog = winnerOdds != null && winnerOdds >= 350;

    if (fightResult.winner_id && winnerOdds == null) {
      console.warn(`[Scoring] No odds on file for fight ${fightResult.fight_id} — underdog bonus skipped`);
    } else if (isUnderdog) {
      console.log(`[Scoring] Underdog bonus triggered for fight ${fightResult.fight_id} (odds: +${winnerOdds})`);
    }

    for (const lc of leagueConfigs) {
      // Respect card segment settings
      if (fightResult.card_segment === 'early_prelims' && !lc.score_early_prelims) continue;
      if (fightResult.card_segment === 'prelims' && !lc.score_prelims) continue;

      if (fightResult.winner_id) {
        const ptsWin: number = lc.pts_win;
        const ptsMethod: number =
          fightResult.outcome === 'ko_tko' ? lc.pts_ko_tko
          : fightResult.outcome === 'submission' ? lc.pts_submission
          : lc.pts_decision;
        const underdogBonus = isUnderdog ? 100 : 0;

        // Score picks for this league with its settings
        await client.query(`
          UPDATE event_picks
          SET is_correct = (picked_fighter_id = $1),
              points_earned = CASE
                WHEN picked_fighter_id = $1 AND (
                  (picked_method = 'ko_tko'          AND $2 = 'ko_tko') OR
                  (picked_method = 'submission'       AND $2 = 'submission') OR
                  (picked_method = 'decision'         AND $2 IN ('decision_unanimous','decision_split','decision_majority')) OR
                  (picked_method = 'disqualification' AND $2 = 'disqualification')
                ) THEN $5::numeric + $6::numeric
                WHEN picked_fighter_id = $1 THEN $4::numeric + $6::numeric
                ELSE 0
              END
          WHERE fight_id = $3 AND league_id = $7
        `, [
          fightResult.winner_id, fightResult.outcome,
          fightResult.fight_id,
          ptsWin, ptsMethod, underdogBonus,
          lc.league_id,
        ]);

        // Roster win bonus: +50 pts per drafted fighter who wins
        const { rows: rosterOwners } = await client.query(`
          SELECT lm.id AS member_id
          FROM roster_fighters rf
          JOIN rosters r ON r.id = rf.roster_id
          JOIN league_members lm ON lm.id = r.league_member_id
          WHERE rf.fighter_id = $1 AND lm.league_id = $2
        `, [fightResult.winner_id, lc.league_id]);

        for (const owner of rosterOwners) {
          await client.query(`
            INSERT INTO roster_win_bonuses
              (league_id, member_id, fighter_id, fight_result_id, points_awarded)
            VALUES ($1, $2, $3, $4, 50)
            ON CONFLICT (league_id, member_id, fight_result_id) DO NOTHING
          `, [lc.league_id, owner.member_id, fightResult.winner_id, fightResultId]);
        }
      } else {
        // Draw / NC — zero points, mark picks as incorrect
        await client.query(`
          UPDATE event_picks SET is_correct = false, points_earned = 0
          WHERE fight_id = $1 AND league_id = $2
        `, [fightResult.fight_id, lc.league_id]);
      }
    }

    // Recalculate matchup scores (picks + roster win bonuses) for all affected matchups
    for (const matchup of eventMatchups) {
      await client.query(`
        UPDATE matchups SET
          home_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0)
            FROM event_picks ep
            WHERE ep.league_id = $2
              AND ep.member_id = matchups.home_team_id
              AND ep.fight_id IN (SELECT id FROM fights WHERE event_id = $3)
          ) + (
            SELECT COALESCE(SUM(rwb.points_awarded), 0)
            FROM roster_win_bonuses rwb
            JOIN fight_results fr ON fr.id = rwb.fight_result_id
            JOIN fights fi ON fi.id = fr.fight_id
            WHERE rwb.league_id = $2
              AND rwb.member_id = matchups.home_team_id
              AND fi.event_id = $3
          ),
          away_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0)
            FROM event_picks ep
            WHERE ep.league_id = $2
              AND ep.member_id = matchups.away_team_id
              AND ep.fight_id IN (SELECT id FROM fights WHERE event_id = $3)
          ) + (
            SELECT COALESCE(SUM(rwb.points_awarded), 0)
            FROM roster_win_bonuses rwb
            JOIN fight_results fr ON fr.id = rwb.fight_result_id
            JOIN fights fi ON fi.id = fr.fight_id
            WHERE rwb.league_id = $2
              AND rwb.member_id = matchups.away_team_id
              AND fi.event_id = $3
          )
        WHERE id = $1
      `, [matchup.id, matchup.league_id, fightResult.event_id]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
