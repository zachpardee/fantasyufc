import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { z } from 'zod';

export const waiversRouter = Router({ mergeParams: true });

// List your team's waiver claims (pending + recent history)
waiversRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows } = await db.query(`
      SELECT
        wc.id, wc.status, wc.priority, wc.submitted_at, wc.processed_at, wc.denial_reason,
        f.id as fighter_id, f.first_name || ' ' || f.last_name AS fighter_name,
        f.weight_class, f.status as fighter_status,
        df.id as drop_fighter_id, df.first_name || ' ' || df.last_name AS drop_fighter_name
      FROM waiver_claims wc
      JOIN fighters f ON f.id = wc.fighter_id
      LEFT JOIN fighters df ON df.id = wc.drop_fighter_id
      WHERE wc.league_id = $1 AND wc.claiming_team_id = $2
      ORDER BY
        CASE wc.status WHEN 'pending' THEN 0 ELSE 1 END,
        wc.priority ASC,
        wc.submitted_at DESC
      LIMIT 50
    `, [req.params.leagueId, member.id]);

    res.json(rows);
  } catch (err) { next(err); }
});

// Submit a new waiver claim
waiversRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      fighterId: z.string().uuid(),
      dropFighterId: z.string().uuid().optional(),
      priority: z.number().int().min(1).optional(),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT lm.id, lm.waiver_priority, l.status, l.roster_size, l.waiver_order_type
       FROM league_members lm
       JOIN leagues l ON l.id = lm.league_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');
    if (member.status !== 'active') throw new AppError(400, 'League is not active');

    // Fighter must exist
    const { rows: [fighter] } = await db.query(
      `SELECT id, first_name, last_name FROM fighters WHERE id = $1`,
      [body.fighterId],
    );
    if (!fighter) throw new AppError(404, 'Fighter not found');

    // Fighter must be a free agent in this league
    const { rows: [onRoster] } = await db.query(`
      SELECT rf.id FROM roster_fighters rf
      JOIN rosters r ON r.id = rf.roster_id
      JOIN league_members lm ON lm.id = r.league_member_id
      WHERE lm.league_id = $1 AND rf.fighter_id = $2
    `, [req.params.leagueId, body.fighterId]);
    if (onRoster) throw new AppError(400, 'Fighter is already on a roster');

    // No duplicate pending claim for this fighter by this team
    const { rows: [dupe] } = await db.query(`
      SELECT id FROM waiver_claims
      WHERE league_id = $1 AND claiming_team_id = $2 AND fighter_id = $3 AND status = 'pending'
    `, [req.params.leagueId, member.id, body.fighterId]);
    if (dupe) throw new AppError(400, 'You already have a pending claim for this fighter');

    // Validate drop fighter is on this team if provided
    if (body.dropFighterId) {
      const { rows: [onTeam] } = await db.query(`
        SELECT rf.id FROM roster_fighters rf
        JOIN rosters r ON r.id = rf.roster_id
        WHERE r.league_member_id = $1 AND rf.fighter_id = $2
      `, [member.id, body.dropFighterId]);
      if (!onTeam) throw new AppError(400, 'Drop fighter is not on your roster');
    }

    // Determine priority: use provided value or append to end of team's existing claims
    let priority = body.priority;
    if (priority === undefined) {
      const { rows: [{ max_priority }] } = await db.query<{ max_priority: string | null }>(`
        SELECT MAX(priority) as max_priority FROM waiver_claims
        WHERE league_id = $1 AND claiming_team_id = $2 AND status = 'pending'
      `, [req.params.leagueId, member.id]);
      priority = max_priority ? parseInt(max_priority) + 1 : 1;
    }

    const { rows: [claim] } = await db.query(`
      INSERT INTO waiver_claims
        (league_id, claiming_team_id, fighter_id, drop_fighter_id, priority, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, priority, submitted_at
    `, [req.params.leagueId, member.id, body.fighterId, body.dropFighterId ?? null, priority]);

    res.status(201).json({
      id: claim.id,
      fighterId: body.fighterId,
      fighterName: `${fighter.first_name} ${fighter.last_name}`,
      priority: claim.priority,
      submittedAt: claim.submitted_at,
    });
  } catch (err) { next(err); }
});

// Update priority order of pending claims
waiversRouter.patch('/reorder', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { claimIds } = z.object({
      claimIds: z.array(z.string().uuid()).min(1),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    // Verify all claims belong to this team and are pending
    const { rows: claims } = await db.query(`
      SELECT id FROM waiver_claims
      WHERE id = ANY($1::uuid[]) AND claiming_team_id = $2 AND status = 'pending'
    `, [claimIds, member.id]);

    if (claims.length !== claimIds.length) {
      throw new AppError(400, 'One or more claims not found or not pending');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < claimIds.length; i++) {
        await client.query(
          `UPDATE waiver_claims SET priority = $1 WHERE id = $2`,
          [i + 1, claimIds[i]],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Cancel a pending waiver claim
waiversRouter.delete('/:claimId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [claim] } = await db.query(
      `DELETE FROM waiver_claims
       WHERE id = $1 AND claiming_team_id = $2 AND status = 'pending'
       RETURNING id`,
      [req.params.claimId, member.id],
    );
    if (!claim) throw new AppError(404, 'Pending claim not found');

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// View the full league waiver priority order
waiversRouter.get('/order', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows } = await db.query(`
      SELECT
        lm.id as team_id, lm.team_name, lm.waiver_priority,
        lm.wins, lm.losses, lm.ties,
        COUNT(wc.id) FILTER (WHERE wc.status = 'pending') as pending_claims
      FROM league_members lm
      LEFT JOIN waiver_claims wc ON wc.claiming_team_id = lm.id AND wc.league_id = $1
      WHERE lm.league_id = $1 AND lm.is_active = true
      GROUP BY lm.id
      ORDER BY lm.waiver_priority ASC
    `, [req.params.leagueId]);

    res.json(rows);
  } catch (err) { next(err); }
});
