import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { z } from 'zod';

export const messagesRouter = Router({ mergeParams: true });

messagesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows } = await db.query(`
      SELECT lm.id, lm.body, lm.created_at,
        mem.team_name, up.username,
        mem.id AS member_id,
        mem.avatar_color
      FROM league_messages lm
      JOIN league_members mem ON mem.id = lm.member_id
      JOIN user_profiles up ON up.id = mem.user_id
      WHERE lm.league_id = $1
      ORDER BY lm.created_at DESC
      LIMIT 50
    `, [req.params.leagueId]);

    res.json(rows.reverse());
  } catch (err) { next(err); }
});

messagesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { body: msgBody } = z.object({
      body: z.string().min(1).max(1000).transform((s) => s.trim()),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2 AND is_active = true`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [msg] } = await db.query(`
      INSERT INTO league_messages (league_id, member_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, body, created_at, member_id
    `, [req.params.leagueId, member.id, msgBody]);

    const { rows: [full] } = await db.query(`
      SELECT lm.id, lm.body, lm.created_at,
        mem.team_name, up.username,
        mem.id AS member_id,
        mem.avatar_color
      FROM league_messages lm
      JOIN league_members mem ON mem.id = lm.member_id
      JOIN user_profiles up ON up.id = mem.user_id
      WHERE lm.id = $1
    `, [msg.id]);

    res.status(201).json(full);
  } catch (err) { next(err); }
});

messagesRouter.delete('/:messageId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [msg] } = await db.query(
      `SELECT id, member_id FROM league_messages WHERE id = $1 AND league_id = $2`,
      [req.params.messageId, req.params.leagueId],
    );
    if (!msg) throw new AppError(404, 'Message not found');
    if (msg.member_id !== member.id) throw new AppError(403, 'Can only delete your own messages');

    await db.query(`DELETE FROM league_messages WHERE id = $1`, [msg.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
