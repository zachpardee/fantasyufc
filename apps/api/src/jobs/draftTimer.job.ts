import cron from 'node-cron';
import { db } from '../config/database';
import { supabaseAdmin } from '../config/supabase';
import { generateMatchupsForLeague } from '../services/matchup.service';

export function startDraftTimerJob() {
  // Check every 10 seconds for expired draft picks
  cron.schedule('*/10 * * * * *', async () => {
    try {
      const { rows: expiredSessions } = await db.query(`
        SELECT ds.id, ds.league_id, ds.current_pick, ds.total_rounds,
               ds.current_team_id, ds.pick_time_seconds
        FROM draft_sessions ds
        WHERE ds.status = 'active'
          AND ds.current_pick_deadline < NOW()
      `);

      for (const session of expiredSessions) {
        const client = await db.connect();
        try {
          await client.query('BEGIN');

          // Auto-pick best available fighter
          const { rows: [fighter] } = await client.query(`
            SELECT f.id FROM fighters f
            WHERE f.status = 'active'
              AND f.id NOT IN (
                SELECT dp.fighter_id FROM draft_picks dp
                WHERE dp.draft_session_id = $1 AND dp.fighter_id IS NOT NULL
              )
            ORDER BY f.ranking ASC NULLS LAST, f.average_fantasy_points DESC NULLS LAST
            LIMIT 1
          `, [session.id]);

          if (!fighter) {
            await client.query(
              `UPDATE draft_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
              [session.id],
            );
            await client.query(`UPDATE leagues SET status = 'active' WHERE id = $1`, [session.league_id]);
            await client.query('COMMIT');
            generateMatchupsForLeague(session.league_id).catch((err) =>
              console.error('[DraftTimer] Failed to generate matchups:', err),
            );
            continue;
          }

          const { rows: [{ count: memberCount }] } = await client.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM league_members WHERE league_id = $1 AND is_active = true`,
            [session.league_id],
          );
          const n = parseInt(memberCount);
          const overall = session.current_pick;
          const round = Math.ceil(overall / n);
          const pickInRound = overall - (round - 1) * n;

          const { rows: [roster] } = await client.query(
            `SELECT r.id FROM rosters r WHERE r.league_member_id = $1`, [session.current_team_id],
          );

          await client.query(`
            INSERT INTO draft_picks (draft_session_id, league_member_id, fighter_id, overall_pick, round_number, pick_in_round, status, auto_picked, picked_at)
            VALUES ($1,$2,$3,$4,$5,$6,'picked',true,NOW())
          `, [session.id, session.current_team_id, fighter.id, overall, round, pickInRound]);

          await client.query(
            `INSERT INTO roster_fighters (roster_id, fighter_id, slot_type, acquired_via) VALUES ($1,$2,'starter','draft')`,
            [roster.id, fighter.id],
          );

          const nextPick = overall + 1;
          const totalPicks = session.total_rounds * n;

          let autoPickCompleted = false;
          if (nextPick > totalPicks) {
            await client.query(
              `UPDATE draft_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
              [session.id],
            );
            await client.query(`UPDATE leagues SET status = 'active' WHERE id = $1`, [session.league_id]);
            autoPickCompleted = true;
          } else {
            // Compute next team using snake order
            const nextRound = Math.ceil(nextPick / n);
            const nextPickInRound = nextPick - (nextRound - 1) * n;
            const nextPosition = nextRound % 2 === 1 ? nextPickInRound : n + 1 - nextPickInRound;

            const { rows: [nextTeam] } = await client.query(
              `SELECT league_member_id FROM draft_order WHERE draft_session_id = $1 AND position = $2`,
              [session.id, nextPosition],
            );

            const deadline = new Date(Date.now() + session.pick_time_seconds * 1000).toISOString();
            await client.query(
              `UPDATE draft_sessions SET current_pick = $1, current_team_id = $2, current_pick_deadline = $3 WHERE id = $4`,
              [nextPick, nextTeam.league_member_id, deadline, session.id],
            );
          }

          await client.query('COMMIT');

          if (autoPickCompleted) {
            generateMatchupsForLeague(session.league_id).catch((err) =>
              console.error('[DraftTimer] Failed to generate matchups:', err),
            );
          }

          await supabaseAdmin.channel(`draft:${session.league_id}`).send({
            type: 'broadcast',
            event: 'auto_pick',
            payload: { fighterId: fighter.id, teamId: session.current_team_id, overallPick: overall },
          });
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('Draft timer job error:', err);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('Draft timer cron error:', err);
    }
  });
}
