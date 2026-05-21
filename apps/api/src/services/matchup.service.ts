import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';

/**
 * Generates round-robin matchup schedule for a league across its events.
 *
 * Circle method (Berger table):
 * - Fix team at position 0, rotate the rest clockwise each round.
 * - For N even: N-1 rounds, N/2 matchups per round.
 * - For N odd: add a bye slot, same algorithm, teams paired with bye get no matchup.
 * - If events > rounds in the cycle, repeat the schedule.
 */
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
  const { rows: members } = await db.query(`
    SELECT id FROM league_members
    WHERE league_id = $1 AND is_active = true
    ORDER BY draft_position ASC NULLS LAST, joined_at ASC
  `, [leagueId]);

  if (members.length < 2) throw new AppError(400, 'Need at least 2 members to generate matchups');

  const { rows: events } = await db.query(`
    SELECT le.event_id, e.scheduled_at
    FROM league_events le
    JOIN ufc_events e ON e.id = le.event_id
    WHERE le.league_id = $1 AND le.is_scoring = true
      AND e.status != 'cancelled'
    ORDER BY e.scheduled_at ASC
  `, [leagueId]);

  if (!events.length) throw new AppError(400, 'No scoring events scheduled for this league');

  const teamIds = members.map((m) => m.id);
  const schedule = buildRoundRobinSchedule(teamIds);

  // Delete any existing non-completed matchups for this league
  await db.query(`
    DELETE FROM matchups
    WHERE league_id = $1
      AND id NOT IN (
        SELECT id FROM matchups WHERE league_id = $1 AND winner_id IS NOT NULL
      )
  `, [leagueId]);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      // Cycle through schedule if more events than rounds
      const round = schedule[i % schedule.length];

      for (const [homeId, awayId] of round) {
        await client.query(`
          INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [leagueId, event.event_id, homeId, awayId]);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { events: events.length, rounds: schedule.length, teams: teamIds.length };
}

function milestoneBonus(correct: number): number {
  return correct >= 6 ? 300 : correct >= 5 ? 200 : correct >= 4 ? 100 : 0;
}

export async function finalizeMatchupResults(leagueId: string, eventId: string) {
  // After an event completes, determine winners and update W/L records
  const { rows: matchups } = await db.query(`
    SELECT id, home_team_id, away_team_id, home_score, away_score
    FROM matchups
    WHERE league_id = $1 AND event_id = $2 AND winner_id IS NULL
  `, [leagueId, eventId]);

  // Correct pick counts per member — drives milestone and perfect card bonuses
  const { rows: pickRows } = await db.query<{
    member_id: string; total_picks: string; correct_picks: string;
  }>(`
    SELECT ep.member_id,
      COUNT(*) AS total_picks,
      SUM(CASE WHEN ep.is_correct THEN 1 ELSE 0 END) AS correct_picks
    FROM event_picks ep
    JOIN fights f ON f.id = ep.fight_id AND f.status = 'completed'
    WHERE ep.league_id = $1 AND f.event_id = $2
    GROUP BY ep.member_id
  `, [leagueId, eventId]);

  const bonusByMember: Record<string, number> = {};
  for (const row of pickRows) {
    bonusByMember[row.member_id] = milestoneBonus(parseInt(row.correct_picks));
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    for (const m of matchups) {
      const homeBonus = bonusByMember[m.home_team_id] ?? 0;
      const awayBonus = bonusByMember[m.away_team_id] ?? 0;

      // Apply milestone bonus to matchup scores before deciding winner
      const homeScore = parseFloat(m.home_score) + homeBonus;
      const awayScore = parseFloat(m.away_score) + awayBonus;

      await client.query(
        `UPDATE matchups SET home_score = $1, away_score = $2 WHERE id = $3`,
        [homeScore, awayScore, m.id],
      );

      let winnerId: string | null = null;
      let isTie = false;
      if (homeScore > awayScore) {
        winnerId = m.home_team_id;
      } else if (awayScore > homeScore) {
        winnerId = m.away_team_id;
      } else {
        isTie = true;
      }

      await client.query(
        `UPDATE matchups SET winner_id = $1 WHERE id = $2`,
        [winnerId, m.id],
      );

      const MATCHUP_WIN_BONUS = 250;

      if (isTie) {
        await client.query(`
          UPDATE league_members SET ties = ties + 1, total_points = total_points + $2
          WHERE id = $1
        `, [m.home_team_id, homeScore]);
        await client.query(`
          UPDATE league_members SET ties = ties + 1, total_points = total_points + $2
          WHERE id = $1
        `, [m.away_team_id, awayScore]);
      } else {
        const winnerScore = winnerId === m.home_team_id ? homeScore : awayScore;
        await client.query(`
          UPDATE league_members
          SET wins = wins + 1,
              streak = CASE WHEN streak >= 0 THEN streak + 1 ELSE 1 END,
              total_points = total_points + $2 + $3
          WHERE id = $1
        `, [winnerId, winnerScore, MATCHUP_WIN_BONUS]);

        const loserId = winnerId === m.home_team_id ? m.away_team_id : m.home_team_id;
        const loserScore = winnerId === m.home_team_id ? awayScore : homeScore;
        await client.query(`
          UPDATE league_members
          SET losses = losses + 1,
              streak = CASE WHEN streak <= 0 THEN streak - 1 ELSE -1 END,
              total_points = total_points + $2
          WHERE id = $1
        `, [loserId, loserScore]);
      }
    }

    // Perfect card bonus: (n-3) × 100 pts → season total (not matchup score)
    for (const row of pickRows) {
      const picked = parseInt(row.total_picks);
      const correct = parseInt(row.correct_picks);
      if (picked >= 4 && picked === correct) {
        const bonus = (picked - 3) * 100;
        const { rowCount } = await client.query(`
          INSERT INTO perfect_card_bonuses
            (league_id, member_id, event_id, fights_correct, points_awarded)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (league_id, member_id, event_id) DO NOTHING
        `, [leagueId, row.member_id, eventId, picked, bonus]);

        if (rowCount) {
          await client.query(
            `UPDATE league_members SET total_points = total_points + $1 WHERE id = $2`,
            [bonus, row.member_id],
          );
          console.log(`[Scoring] Perfect card bonus: ${bonus} pts → member ${row.member_id} (${picked} fights)`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
