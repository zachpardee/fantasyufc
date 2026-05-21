import { calculateFightScore } from '@fantasy-ufc/shared';
import type { FightResult } from '@fantasy-ufc/shared';
import { db } from '../config/database';

export async function processFightResult(fightResultId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [fightResult] } = await client.query<{
      id: string; fight_id: string; winner_id: string; outcome: string;
      ending_round: number; ending_time_seconds: number;
      winner_sig_strikes_landed: number; winner_sig_strikes_attempted: number;
      winner_total_strikes_landed: number; winner_takedowns_landed: number;
      winner_takedowns_attempted: number; winner_submission_attempts: number;
      winner_knockdowns: number;
      loser_sig_strikes_landed: number; loser_sig_strikes_attempted: number;
      loser_total_strikes_landed: number; loser_takedowns_landed: number;
      loser_takedowns_attempted: number; loser_submission_attempts: number;
      loser_knockdowns: number;
      performance_of_night: boolean; fight_of_night: boolean;
      is_title_fight: boolean; event_id: string;
    }>(`
      SELECT fr.*, f.is_title_fight, f.event_id
      FROM fight_results fr
      JOIN fights f ON f.id = fr.fight_id
      WHERE fr.id = $1
    `, [fightResultId]);

    if (!fightResult) throw new Error(`Fight result ${fightResultId} not found`);

    const result: FightResult = {
      id: fightResult.id,
      fightId: fightResult.fight_id,
      winnerId: fightResult.winner_id,
      outcome: fightResult.outcome as FightResult['outcome'],
      endingRound: fightResult.ending_round,
      endingTimeSeconds: fightResult.ending_time_seconds,
      performanceOfNight: fightResult.performance_of_night,
      fightOfNight: fightResult.fight_of_night,
      winnerStats: {
        sigStrikesLanded: fightResult.winner_sig_strikes_landed,
        sigStrikesAttempted: fightResult.winner_sig_strikes_attempted,
        totalStrikesLanded: fightResult.winner_total_strikes_landed,
        takedownsLanded: fightResult.winner_takedowns_landed,
        takedownsAttempted: fightResult.winner_takedowns_attempted,
        submissionAttempts: fightResult.winner_submission_attempts,
        knockdowns: fightResult.winner_knockdowns,
      },
      loserStats: {
        sigStrikesLanded: fightResult.loser_sig_strikes_landed,
        sigStrikesAttempted: fightResult.loser_sig_strikes_attempted,
        totalStrikesLanded: fightResult.loser_total_strikes_landed,
        takedownsLanded: fightResult.loser_takedowns_landed,
        takedownsAttempted: fightResult.loser_takedowns_attempted,
        submissionAttempts: fightResult.loser_submission_attempts,
        knockdowns: fightResult.loser_knockdowns,
      },
      recordedAt: new Date().toISOString(),
    };

    // Find all matchups for this event across all leagues
    const { rows: matchupFighters } = await client.query<{
      matchup_id: string; roster_fighter_id: string; fighter_id: string;
      is_starter: boolean; league_id: string;
      pts_win: string; pts_ko_tko: string; pts_submission: string;
      pts_decision: string; pts_draw: string; pts_no_contest: string;
      pts_finish_rd1: string; pts_finish_rd2: string; pts_finish_rd3: string;
      pts_finish_rd4: string; pts_finish_rd5: string; pts_knockdown: string;
      pts_sig_strike_landed: string; pts_sig_strike_attempted: string;
      pts_total_strike_landed: string; pts_takedown_landed: string;
      pts_takedown_attempted: string; pts_submission_attempt: string;
      pts_performance_of_night: string; pts_fight_of_night: string;
      pts_loss: string; pts_ko_loss_penalty: string; title_fight_multiplier: string;
    }>(`
      SELECT
        m.id as matchup_id,
        rf.id as roster_fighter_id,
        rf.fighter_id,
        rf.slot_type = 'starter' as is_starter,
        m.league_id,
        ss.*
      FROM matchups m
      JOIN league_members lm ON lm.id IN (m.home_team_id, m.away_team_id)
      JOIN rosters r ON r.league_member_id = lm.id
      JOIN roster_fighters rf ON rf.roster_id = r.id
        AND rf.fighter_id IN ($1, $2)
      JOIN scoring_settings ss ON ss.league_id = m.league_id
      WHERE m.event_id = $3
    `, [
      /* red fighter */ await getFighterId(client, fightResult.fight_id, 'red'),
      /* blue fighter */ await getFighterId(client, fightResult.fight_id, 'blue'),
      fightResult.event_id,
    ]);

    // Always collect matchup IDs for this event — picks scoring applies regardless of roster
    const { rows: eventMatchups } = await client.query<{ id: string }>(
      `SELECT id FROM matchups WHERE event_id = $1`, [fightResult.event_id],
    );
    const processedMatchupIds = new Set<string>(eventMatchups.map((m) => m.id));

    for (const row of matchupFighters) {
      const settings = rowToScoringSettings(row);
      const breakdown = calculateFightScore(
        result,
        row.fighter_id,
        settings,
        fightResult.is_title_fight,
        row.matchup_id,
      );

      await client.query(`
        INSERT INTO matchup_scores (
          matchup_id, roster_fighter_id, fight_id, fighter_id,
          pts_win, pts_finish, pts_round_bonus, pts_sig_strikes,
          pts_total_strikes, pts_knockdowns, pts_takedowns, pts_submissions,
          pts_bonuses, title_multiplier, total_points, is_starter, scored_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
        ON CONFLICT (matchup_id, fighter_id) DO UPDATE SET
          pts_win=$5, pts_finish=$6, pts_round_bonus=$7, pts_sig_strikes=$8,
          pts_total_strikes=$9, pts_knockdowns=$10, pts_takedowns=$11,
          pts_submissions=$12, pts_bonuses=$13, title_multiplier=$14,
          total_points=$15, scored_at=NOW()
      `, [
        row.matchup_id, row.roster_fighter_id, fightResult.fight_id, row.fighter_id,
        breakdown.ptsWin, breakdown.ptsFinish, breakdown.ptsRoundBonus,
        breakdown.ptsSigStrikes, breakdown.ptsTotalStrikes, breakdown.ptsKnockdowns,
        breakdown.ptsTakedowns, breakdown.ptsSubmissions, breakdown.ptsBonuses,
        breakdown.titleMultiplier, breakdown.totalPoints,
      ]);

      processedMatchupIds.add(row.matchup_id);
    }

    // Score event picks:
    //   correct winner                         = 100 pts
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
              WHEN picked_fighter_id = $1 THEN 100 + CASE WHEN $3 THEN 100 ELSE 0 END
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

    // Award 250-pt season bonus to every league member who has the winner on their roster
    if (fightResult.winner_id) {
      const ROSTER_WIN_BONUS = 250;
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
        const inserted = await client.query(`
          INSERT INTO roster_win_bonuses
            (league_id, member_id, fighter_id, fight_result_id, points_awarded)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (league_id, member_id, fight_result_id) DO NOTHING
          RETURNING id
        `, [owner.league_id, owner.member_id, fightResult.winner_id, fightResultId, ROSTER_WIN_BONUS]);

        if (inserted.rowCount) {
          await client.query(
            `UPDATE league_members SET total_points = total_points + $1 WHERE id = $2`,
            [ROSTER_WIN_BONUS, owner.member_id],
          );
        }
      }
    }

    // Matchup score = correct picks only (100 pts each)
    for (const matchupId of processedMatchupIds) {
      await client.query(`
        UPDATE matchups SET
          home_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0)
            FROM event_picks ep
            WHERE ep.league_id = matchups.league_id
              AND ep.member_id = matchups.home_team_id
              AND ep.fight_id IN (SELECT id FROM fights WHERE event_id = $2)
          ),
          away_score = (
            SELECT COALESCE(SUM(ep.points_earned), 0)
            FROM event_picks ep
            WHERE ep.league_id = matchups.league_id
              AND ep.member_id = matchups.away_team_id
              AND ep.fight_id IN (SELECT id FROM fights WHERE event_id = $2)
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

async function getFighterId(client: import('pg').PoolClient, fightId: string, side: 'red' | 'blue') {
  const col = side === 'red' ? 'red_fighter_id' : 'blue_fighter_id';
  const { rows: [row] } = await client.query<{ fighter_id: string }>(
    `SELECT ${col} as fighter_id FROM fights WHERE id = $1`, [fightId],
  );
  return row.fighter_id;
}

function rowToScoringSettings(row: Record<string, unknown>) {
  const s = row as Record<string, string>; // numeric columns come back as strings from pg
  return {
    id: '',
    leagueId: s.league_id,
    ptsWin: +s.pts_win,
    ptsKoTko: +s.pts_ko_tko,
    ptsSubmission: +s.pts_submission,
    ptsDecision: +s.pts_decision,
    ptsDraw: +s.pts_draw,
    ptsNoContest: +s.pts_no_contest,
    ptsFinishRd1: +s.pts_finish_rd1,
    ptsFinishRd2: +s.pts_finish_rd2,
    ptsFinishRd3: +s.pts_finish_rd3,
    ptsFinishRd4: +s.pts_finish_rd4,
    ptsFinishRd5: +s.pts_finish_rd5,
    ptsKnockdown: +s.pts_knockdown,
    ptsSigStrikeLanded: +s.pts_sig_strike_landed,
    ptsSigStrikeAttempted: +s.pts_sig_strike_attempted,
    ptsTotalStrikeLanded: +s.pts_total_strike_landed,
    ptsTakedownLanded: +s.pts_takedown_landed,
    ptsTakedownAttempted: +s.pts_takedown_attempted,
    ptsSubmissionAttempt: +s.pts_submission_attempt,
    ptsPerformanceOfNight: +s.pts_performance_of_night,
    ptsFightOfNight: +s.pts_fight_of_night,
    ptsLoss: +s.pts_loss,
    ptsKoLossPenalty: +s.pts_ko_loss_penalty,
    titleFightMultiplier: +s.title_fight_multiplier,
    scorePrelims: true,
    scoreEarlyPrelims: false,
  };
}
