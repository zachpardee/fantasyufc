import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { supabaseAdmin } from '../config/supabase';

export function snakePickTeamPosition(overallPick: number, teamCount: number): number {
  const round = Math.ceil(overallPick / teamCount);
  const pickInRound = overallPick - (round - 1) * teamCount;
  return round % 2 === 1 ? pickInRound : teamCount + 1 - pickInRound;
}

export async function startDraft(leagueId: string, commissionerId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [league] } = await client.query(
      `SELECT * FROM leagues WHERE id = $1 AND commissioner_id = $2`,
      [leagueId, commissionerId],
    );
    if (!league) throw new AppError(403, 'Not the commissioner of this league');
    if (league.status !== 'setup') throw new AppError(400, 'League is not in setup phase');

    const { rows: members } = await client.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND is_active = true ORDER BY RANDOM()`,
      [leagueId],
    );
    if (members.length < 2) throw new AppError(400, 'Need at least 2 members to start draft');

    const { rows: [session] } = await client.query(`
      INSERT INTO draft_sessions (league_id, draft_type, status, total_rounds, pick_time_seconds, current_team_id)
      VALUES ($1, $2, 'active', $3, $4, $5)
      RETURNING *
    `, [leagueId, league.draft_type, league.roster_size, league.draft_pick_time_seconds, members[0].id]);

    for (let i = 0; i < members.length; i++) {
      await client.query(
        `INSERT INTO draft_order (draft_session_id, league_member_id, position) VALUES ($1, $2, $3)`,
        [session.id, members[i].id, i + 1],
      );
    }

    const deadline = new Date(Date.now() + league.draft_pick_time_seconds * 1000).toISOString();
    await client.query(
      `UPDATE draft_sessions SET current_pick_deadline = $1, started_at = NOW() WHERE id = $2`,
      [deadline, session.id],
    );

    await client.query(`UPDATE leagues SET status = 'drafting' WHERE id = $1`, [leagueId]);

    await client.query('COMMIT');

    await supabaseAdmin.channel(`draft:${leagueId}`).send({
      type: 'broadcast',
      event: 'draft_started',
      payload: { sessionId: session.id, currentTeamId: members[0].id },
    });

    return session;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function submitPick(leagueId: string, userId: string, fighterId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [session] } = await client.query(
      `SELECT ds.*, lm.id as member_id
       FROM draft_sessions ds
       JOIN league_members lm ON lm.league_id = ds.league_id AND lm.user_id = $2
       WHERE ds.league_id = $1 AND ds.status = 'active'`,
      [leagueId, userId],
    );
    if (!session) throw new AppError(400, 'No active draft for this league');
    if (session.current_team_id !== session.member_id) throw new AppError(403, 'Not your turn to pick');

    const { rows: [alreadyPicked] } = await client.query(
      `SELECT id FROM draft_picks WHERE draft_session_id = $1 AND fighter_id = $2`,
      [session.id, fighterId],
    );
    if (alreadyPicked) throw new AppError(400, 'Fighter already drafted');

    const overallPick = session.current_pick;
    const round = Math.ceil(overallPick / session.total_rounds);
    const pickInRound = overallPick - (round - 1) * (session.total_rounds);

    const durationSeconds = session.current_pick_deadline
      ? Math.floor((new Date(session.current_pick_deadline).getTime() - Date.now()) / 1000)
      : null;

    const { rows: [pick] } = await client.query(`
      INSERT INTO draft_picks (draft_session_id, league_member_id, fighter_id, overall_pick, round_number, pick_in_round, status, picked_at, pick_duration_seconds)
      VALUES ($1, $2, $3, $4, $5, $6, 'picked', NOW(), $7)
      RETURNING *
    `, [session.id, session.member_id, fighterId, overallPick, round, pickInRound, durationSeconds]);

    const { rows: [roster] } = await client.query(
      `SELECT id FROM rosters WHERE league_member_id = $1`,
      [session.member_id],
    );
    await client.query(
      `INSERT INTO roster_fighters (roster_id, fighter_id, slot_type, acquired_via) VALUES ($1, $2, 'starter', 'draft')`,
      [roster.id, fighterId],
    );

    const nextPick = overallPick + 1;
    const totalPicks = session.total_rounds * (await getMemberCount(client, leagueId));

    if (nextPick > totalPicks) {
      await client.query(
        `UPDATE draft_sessions SET status = 'completed', current_pick = $1, completed_at = NOW() WHERE id = $2`,
        [nextPick, session.id],
      );
      await client.query(`UPDATE leagues SET status = 'active' WHERE id = $1`, [leagueId]);
    } else {
      const nextTeamId = await getNextTeamId(client, session.id, nextPick, await getMemberCount(client, leagueId));
      const nextDeadline = new Date(Date.now() + session.pick_time_seconds * 1000).toISOString();
      await client.query(
        `UPDATE draft_sessions SET current_pick = $1, current_team_id = $2, current_pick_deadline = $3 WHERE id = $4`,
        [nextPick, nextTeamId, nextDeadline, session.id],
      );
    }

    await client.query('COMMIT');

    await supabaseAdmin.channel(`draft:${leagueId}`).send({
      type: 'broadcast',
      event: 'pick_made',
      payload: { pick, nextTeamId: session.current_team_id },
    });

    return pick;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getMemberCount(client: import('pg').PoolClient, leagueId: string) {
  const { rows: [row] } = await client.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM league_members WHERE league_id = $1 AND is_active = true`,
    [leagueId],
  );
  return parseInt(row.count);
}

async function getNextTeamId(client: import('pg').PoolClient, sessionId: string, nextPick: number, memberCount: number) {
  const position = snakePickTeamPosition(nextPick, memberCount);
  const { rows: [row] } = await client.query<{ league_member_id: string }>(
    `SELECT league_member_id FROM draft_order WHERE draft_session_id = $1 AND position = $2`,
    [sessionId, position],
  );
  return row.league_member_id;
}
