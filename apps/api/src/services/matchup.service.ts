import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { redis } from '../config/redis';
import { sendNotification } from './notification.service';

/**
 * Generates round-robin matchup schedule for a league across its events.
 *
 * Circle method (Berger table):
 * - Fix team at position 0, rotate the rest clockwise each round.
 * - For N even: N-1 rounds, N/2 matchups per round.
 * - For N odd: add a bye slot, same algorithm, teams paired with bye get no matchup.
 * - If events > rounds in the cycle, repeat the schedule.
 */
/**
 * Returns an array of round indices (length = numEvents) such that each of the
 * numRounds rounds appears either floor or ceil times — never more than 1 apart.
 * Successive full cycles alternate direction (forward/backward) so the pairs
 * that receive the "extra" game rotate rather than always being the same ones.
 */
export function buildBalancedRoundSequence(numEvents: number, numRounds: number): number[] {
  if (numRounds === 0) return [];
  const seq: number[] = [];
  for (let i = 0; i < numEvents; i++) {
    const cycle = Math.floor(i / numRounds);
    const pos = i % numRounds;
    // Alternate direction each cycle so the extra game rotates to different pairs
    const roundIdx = cycle % 2 === 0 ? pos : numRounds - 1 - pos;
    seq.push(roundIdx);
  }
  return seq;
}

export function buildRoundRobinSchedule(teamIds: string[]): Array<Array<[string, string]>> {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push('BYE');

  const n = teams.length;
  const rounds: Array<Array<[string, string]>> = [];

  const rotatable = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const current = [teams[0], ...rotatable];
    const roundMatchups: Array<[string, string]> = [];

    for (let i = 0; i < n / 2; i++) {
      const home = current[i];
      const away = current[n - 1 - i];
      if (home !== 'BYE' && away !== 'BYE') {
        roundMatchups.push([home, away]);
      }
    }
    rounds.push(roundMatchups);

    // Rotate: move last element to front of rotatable (circle method)
    rotatable.unshift(rotatable.pop()!);
  }

  return rounds;
}

export async function generateMatchupsForLeague(leagueId: string) {
  const { rows: members } = await db.query(
    `
    SELECT id FROM league_members
    WHERE league_id = $1 AND is_active = true
    ORDER BY draft_position ASC NULLS LAST, joined_at ASC
  `,
    [leagueId],
  );

  if (members.length < 2) throw new AppError(400, 'Need at least 2 members to generate matchups');

  const { rows: events } = await db.query(
    `
    SELECT le.event_id, e.scheduled_at
    FROM league_events le
    JOIN ufc_events e ON e.id = le.event_id
    WHERE le.league_id = $1 AND le.is_scoring = true
      AND e.status != 'cancelled'
    ORDER BY e.scheduled_at ASC
  `,
    [leagueId],
  );

  if (!events.length) throw new AppError(400, 'No scoring events scheduled for this league');

  const teamIds = members.map((m) => m.id);
  const schedule = buildRoundRobinSchedule(teamIds);

  // Delete future (scheduled) non-playoff matchups so we can regenerate a balanced schedule.
  // We intentionally preserve live/completed matchups and all playoff matchups.
  await db.query(
    `
    DELETE FROM matchups m
    USING ufc_events e
    WHERE m.league_id = $1
      AND m.is_playoffs = false
      AND m.winner_id IS NULL
      AND m.event_id = e.id
      AND e.status = 'scheduled'
  `,
    [leagueId],
  );

  // Staking matchups start at the weekly budget (money-on-hand) instead of 0,
  // so the scoreboard reads $100 before any bets are placed.
  const {
    rows: [lgFmt],
  } = await db.query(
    `SELECT league_format, COALESCE(weekly_budget, 100) AS budget FROM leagues WHERE id = $1`,
    [leagueId],
  );
  const initialScore = lgFmt?.league_format === 'staking' ? parseFloat(lgFmt.budget ?? 100) : 0;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Build an optimal sequence of round indices across all events so every pair
    // plays each other as evenly as possible (max difference of 1 game).
    const n = schedule.length;
    const roundSequence = buildBalancedRoundSequence(events.length, n);

    // Pre-load which events already have matchups (live/completed — not touched by DELETE above)
    const { rows: existingCounts } = await client.query(
      `
      SELECT event_id FROM matchups
      WHERE league_id = $1 AND is_playoffs = false
      GROUP BY event_id
    `,
      [leagueId],
    );
    const eventsWithMatchups = new Set(existingCounts.map((r: any) => r.event_id));

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      // Skip events that already have matchups (live/completed — preserve as-is)
      if (eventsWithMatchups.has(event.event_id)) continue;

      const round = schedule[roundSequence[i]];
      for (const [homeId, awayId] of round) {
        await client.query(
          `
          INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, home_score, away_score)
          VALUES ($1, $2, $3, $4, $5, $5)
        `,
          [leagueId, event.event_id, homeId, awayId, initialScore],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Staking matchup scores represent event P&L (starts at 0, can go negative)

  return { events: events.length, rounds: schedule.length, teams: teamIds.length };
}

export async function finalizeMatchupResults(leagueId: string, eventId: string) {
  const { rows: matchups } = await db.query(
    `
    SELECT id, home_team_id, away_team_id, home_score, away_score, is_playoffs, playoff_round
    FROM matchups
    WHERE league_id = $1 AND event_id = $2 AND winner_id IS NULL
  `,
    [leagueId, eventId],
  );

  const {
    rows: [league],
  } = await db.query(`SELECT league_format FROM leagues WHERE id = $1`, [leagueId]);
  const isStaking = league?.league_format === 'staking';

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (const m of matchups) {
      const homeScore = parseFloat(m.home_score);
      const awayScore = parseFloat(m.away_score);

      let winnerId: string | null = null;
      let isTie = false;
      if (homeScore > awayScore) winnerId = m.home_team_id;
      else if (awayScore > homeScore) winnerId = m.away_team_id;
      else isTie = true;

      await client.query(`UPDATE matchups SET winner_id = $1 WHERE id = $2`, [winnerId, m.id]);

      const MATCHUP_WIN_BONUS = 25;
      const MATCHUP_TIE_BONUS = 10;

      if (isTie) {
        if (isStaking) {
          await client.query(`UPDATE league_members SET ties = ties + 1 WHERE id IN ($1, $2)`, [
            m.home_team_id,
            m.away_team_id,
          ]);
        } else {
          await client.query(
            `UPDATE league_members SET ties = ties + 1, total_points = total_points + $2 + $3 WHERE id = $1`,
            [m.home_team_id, homeScore, MATCHUP_TIE_BONUS],
          );
          await client.query(
            `UPDATE league_members SET ties = ties + 1, total_points = total_points + $2 + $3 WHERE id = $1`,
            [m.away_team_id, awayScore, MATCHUP_TIE_BONUS],
          );
        }
      } else {
        const winnerScore = winnerId === m.home_team_id ? homeScore : awayScore;
        const loserId = winnerId === m.home_team_id ? m.away_team_id : m.home_team_id;
        const loserScore = winnerId === m.home_team_id ? awayScore : homeScore;

        if (isStaking) {
          await client.query(
            `
            UPDATE league_members
            SET wins = wins + 1,
                streak = CASE WHEN streak >= 0 THEN streak + 1 ELSE 1 END
            WHERE id = $1
          `,
            [winnerId],
          );
          await client.query(
            `
            UPDATE league_members
            SET losses = losses + 1,
                streak = CASE WHEN streak <= 0 THEN streak - 1 ELSE -1 END
            WHERE id = $1
          `,
            [loserId],
          );
        } else {
          await client.query(
            `
            UPDATE league_members
            SET wins = wins + 1,
                streak = CASE WHEN streak >= 0 THEN streak + 1 ELSE 1 END,
                total_points = total_points + $2 + $3
            WHERE id = $1
          `,
            [winnerId, winnerScore, MATCHUP_WIN_BONUS],
          );

          await client.query(
            `
            UPDATE league_members
            SET losses = losses + 1,
                streak = CASE WHEN streak <= 0 THEN streak - 1 ELSE -1 END,
                total_points = total_points + $2
            WHERE id = $1
          `,
            [loserId, loserScore],
          );
        }

        // Transfer BMF belt to the winner if the loser currently holds it
        await client.query(
          `
          UPDATE leagues SET bmf_belt_holder_id = $1
          WHERE id = $2 AND bmf_belt_holder_id = $3
        `,
          [winnerId, leagueId, loserId],
        );
      }
    }

    // If a finals playoff matchup was just resolved, crown champion and complete league
    const finalsM = matchups.find((m) => m.is_playoffs && m.playoff_round === 'finals');
    if (finalsM) {
      const hs = parseFloat(finalsM.home_score),
        as_ = parseFloat(finalsM.away_score);
      const championId = hs >= as_ ? finalsM.home_team_id : finalsM.away_team_id;
      await client.query(`UPDATE league_members SET is_champion = false WHERE league_id = $1`, [
        leagueId,
      ]);
      await client.query(`UPDATE league_members SET is_champion = true WHERE id = $1`, [
        championId,
      ]);
      await client.query(
        `UPDATE leagues SET status = 'completed'::league_status, completed_at = NOW() WHERE id = $1`,
        [leagueId],
      );
    }

    await client.query('COMMIT');
    await redis.del(`standings:${leagueId}`);

    // Notify both teams in each finalized matchup
    for (const m of matchups) {
      const {
        rows: [matchupRow],
      } = await db.query(
        `
        SELECT m.home_score, m.away_score, m.winner_id,
               hm.user_id AS home_user, hm.team_name AS home_team,
               am.user_id AS away_user, am.team_name AS away_team
        FROM matchups m
        JOIN league_members hm ON hm.id = m.home_team_id
        JOIN league_members am ON am.id = m.away_team_id
        WHERE m.id = $1
      `,
        [m.id],
      );
      if (!matchupRow) continue;

      const fmtScore = (n: number) =>
        isStaking
          ? (n < 0 ? '-$' : '$') +
            (Math.abs(n) % 1 < 0.005 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(2))
          : n.toFixed(0);
      const homeScore = fmtScore(parseFloat(matchupRow.home_score));
      const awayScore = fmtScore(parseFloat(matchupRow.away_score));
      const homeWon = matchupRow.winner_id === m.home_team_id;
      const awayWon = matchupRow.winner_id === m.away_team_id;

      await sendNotification(
        matchupRow.home_user,
        'matchup_result',
        homeWon ? 'You won!' : awayWon ? 'You lost' : 'Matchup ended in a tie',
        `${matchupRow.home_team} ${homeScore} – ${awayScore} ${matchupRow.away_team}`,
        { leagueId },
      ).catch(() => {});

      await sendNotification(
        matchupRow.away_user,
        'matchup_result',
        awayWon ? 'You won!' : homeWon ? 'You lost' : 'Matchup ended in a tie',
        `${matchupRow.away_team} ${awayScore} – ${homeScore} ${matchupRow.home_team}`,
        { leagueId },
      ).catch(() => {});
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
