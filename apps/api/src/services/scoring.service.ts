import { db } from '../config/database';
import { redis } from '../config/redis';

function toDecimalOdds(american: number): number {
  return american >= 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export async function refreshStakingMatchupScores(leagueId: string, eventId: string) {
  const { rows: matchups } = await db.query(
    `SELECT id, home_team_id, away_team_id FROM matchups WHERE league_id = $1 AND event_id = $2`,
    [leagueId, eventId],
  );
  for (const m of matchups) {
    await db.query(`
      UPDATE matchups SET
        home_score = (
          SELECT COALESCE(l.weekly_budget, 100)
            - COALESCE((SELECT SUM(s.stake) FROM staking_singles s WHERE s.event_id=$2 AND s.member_id=$3), 0)
            - COALESCE((SELECT p.stake FROM staking_parlays p WHERE p.event_id=$2 AND p.member_id=$3 LIMIT 1), 0)
            + COALESCE((SELECT SUM(s.actual_payout) FROM staking_singles s WHERE s.event_id=$2 AND s.member_id=$3 AND s.status != 'pending'), 0)
            + COALESCE((SELECT p.actual_payout FROM staking_parlays p WHERE p.event_id=$2 AND p.member_id=$3 AND p.status != 'pending' LIMIT 1), 0)
          FROM leagues l WHERE l.id = $5
        ),
        away_score = (
          SELECT COALESCE(l.weekly_budget, 100)
            - COALESCE((SELECT SUM(s.stake) FROM staking_singles s WHERE s.event_id=$2 AND s.member_id=$4), 0)
            - COALESCE((SELECT p.stake FROM staking_parlays p WHERE p.event_id=$2 AND p.member_id=$4 LIMIT 1), 0)
            + COALESCE((SELECT SUM(s.actual_payout) FROM staking_singles s WHERE s.event_id=$2 AND s.member_id=$4 AND s.status != 'pending'), 0)
            + COALESCE((SELECT p.actual_payout FROM staking_parlays p WHERE p.event_id=$2 AND p.member_id=$4 AND p.status != 'pending' LIMIT 1), 0)
          FROM leagues l WHERE l.id = $5
        )
      WHERE id = $1
    `, [m.id, eventId, m.home_team_id, m.away_team_id, leagueId]);
  }
}

export async function processStakingFightResult(fightId: string, winnerId: string | null) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [fightRow] } = await client.query(
      `SELECT event_id FROM fights WHERE id = $1`, [fightId],
    );
    if (!fightRow) { await client.query('COMMIT'); return; }
    const eventId = fightRow.event_id;

    // Settle singles for this fight
    const { rows: singles } = await client.query(
      `SELECT ss.*, l.weekly_budget
       FROM staking_singles ss
       JOIN leagues l ON l.id = ss.league_id
       WHERE ss.fight_id = $1 AND ss.status = 'pending'`,
      [fightId],
    );

    for (const s of singles) {
      const won = winnerId && s.fighter_id === winnerId;
      const decOdds = toDecimalOdds(s.odds);
      const actualPayout = won ? Math.round(parseFloat(s.stake) * decOdds * 100) / 100 : 0;
      const profitLoss = actualPayout - parseFloat(s.stake);

      await client.query(`
        UPDATE staking_singles
        SET status = $1, actual_payout = $2, profit_loss = $3, updated_at = now()
        WHERE id = $4
      `, [won ? 'won' : 'lost', actualPayout, profitLoss, s.id]);

      // Credit net P&L to season bankroll (stake never deducted on placement)
      await client.query(
        `UPDATE league_members SET staking_balance = staking_balance + $1 WHERE id = $2`,
        [profitLoss, s.member_id],
      );
    }

    // Settle parlay legs for this fight
    const { rows: legs } = await client.query(
      `SELECT spl.*, sp.league_id FROM staking_parlay_legs spl
       JOIN staking_parlays sp ON sp.id = spl.parlay_id
       WHERE spl.fight_id = $1 AND spl.result = 'pending' AND sp.status = 'pending'`,
      [fightId],
    );

    for (const leg of legs) {
      const result = winnerId
        ? (leg.fighter_id === winnerId ? 'won' : 'lost')
        : 'lost';
      await client.query(
        `UPDATE staking_parlay_legs SET result = $1 WHERE id = $2`,
        [result, leg.id],
      );

      // If any leg lost, immediately mark parlay as lost and deduct stake from bankroll
      if (result === 'lost') {
        const { rows: [lostParlay] } = await client.query(
          `UPDATE staking_parlays SET status = 'lost', actual_payout = 0, profit_loss = -stake, updated_at = now()
           WHERE id = $1 AND status = 'pending' RETURNING member_id, stake`,
          [leg.parlay_id],
        );
        if (lostParlay) {
          await client.query(
            `UPDATE league_members SET staking_balance = staking_balance - $1 WHERE id = $2`,
            [parseFloat(lostParlay.stake), lostParlay.member_id],
          );
        }
      }
    }

    // Check parlays that may now be fully settled (all legs resolved, none lost)
    const { rows: pendingParlays } = await client.query(`
      SELECT sp.*
      FROM staking_parlays sp
      WHERE sp.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM staking_parlay_legs spl
          WHERE spl.parlay_id = sp.id AND spl.result = 'pending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM staking_parlay_legs spl
          WHERE spl.parlay_id = sp.id AND spl.result = 'lost'
        )
    `);

    for (const parlay of pendingParlays) {
      const actualPayout = Math.round(parseFloat(parlay.stake) * parseFloat(parlay.decimal_odds) * 100) / 100;
      const profitLoss = actualPayout - parseFloat(parlay.stake);
      await client.query(`
        UPDATE staking_parlays SET status = 'won', actual_payout = $1, profit_loss = $2, updated_at = now() WHERE id = $3
      `, [actualPayout, profitLoss, parlay.id]);
      await client.query(
        `UPDATE league_members SET staking_balance = staking_balance + $1 WHERE id = $2`,
        [profitLoss, parlay.member_id],
      );
    }

    // Recalculate staking matchup scores (sum of P&L for the event)
    const affectedLeagueIds = [...new Set([
      ...singles.map((s: any) => s.league_id),
      ...legs.map((l: any) => l.league_id),
    ])];

    await client.query('COMMIT');

    // Refresh matchup scores and invalidate standings cache for affected leagues
    await Promise.all(affectedLeagueIds.filter(Boolean).map((lid) =>
      Promise.all([
        refreshStakingMatchupScores(lid, eventId).catch(() => {}),
        redis.del(`standings:${lid}`).catch(() => {}),
      ]),
    ));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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
        const underdogBonus = isUnderdog ? 10 : 0;

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
                ) THEN $4::numeric + $5::numeric + $6::numeric
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

        // Score event champion picks for this fight
        await client.query(`
          UPDATE event_champion_picks
          SET points_earned = CASE WHEN fighter_id = $1 THEN 30 ELSE 0 END
          WHERE fight_id = $2 AND league_id = $3
        `, [fightResult.winner_id, fightResult.fight_id, lc.league_id]);

      } else {
        // Draw / NC — zero points, mark picks as incorrect
        await client.query(`
          UPDATE event_picks SET is_correct = false, points_earned = 0
          WHERE fight_id = $1 AND league_id = $2
        `, [fightResult.fight_id, lc.league_id]);

        await client.query(`
          UPDATE event_champion_picks SET points_earned = 0
          WHERE fight_id = $1 AND league_id = $2
        `, [fightResult.fight_id, lc.league_id]);
      }
    }

    // Recalculate matchup scores from picks (includes sweep bonus for 8/9/10 correct)
    for (const matchup of eventMatchups) {
      await client.query(`
        UPDATE matchups SET
          home_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0) +
              CASE (COUNT(CASE WHEN ep.is_correct = true THEN 1 END))::int
                WHEN 6 THEN 20 WHEN 5 THEN 10 WHEN 4 THEN 5 ELSE 0
              END +
              COALESCE((
                SELECT ecp.points_earned FROM event_champion_picks ecp
                WHERE ecp.league_id = $2 AND ecp.member_id = matchups.home_team_id AND ecp.event_id = $3
              ), 0)
            FROM event_picks ep
            WHERE ep.league_id = $2
              AND ep.member_id = matchups.home_team_id
              AND ep.fight_id IN (
                SELECT id FROM fights WHERE event_id = $3
                ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC, id DESC
                LIMIT 6
              )
          ),
          away_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0) +
              CASE (COUNT(CASE WHEN ep.is_correct = true THEN 1 END))::int
                WHEN 6 THEN 20 WHEN 5 THEN 10 WHEN 4 THEN 5 ELSE 0
              END +
              COALESCE((
                SELECT ecp.points_earned FROM event_champion_picks ecp
                WHERE ecp.league_id = $2 AND ecp.member_id = matchups.away_team_id AND ecp.event_id = $3
              ), 0)
            FROM event_picks ep
            WHERE ep.league_id = $2
              AND ep.member_id = matchups.away_team_id
              AND ep.fight_id IN (
                SELECT id FROM fights WHERE event_id = $3
                ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC, id DESC
                LIMIT 6
              )
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

  // Also process staking bets for this fight (runs in its own transaction)
  // Re-fetch fight/winner since fightResult is scoped to the try block above
  const { rows: [fr] } = await db.query(
    `SELECT fr.fight_id, fr.winner_id FROM fight_results fr WHERE fr.id = $1`, [fightResultId],
  );
  if (fr) await processStakingFightResult(fr.fight_id, fr.winner_id);
}
