import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const params: unknown[] = [req.user!.id];
    let query = `SELECT * FROM notifications WHERE user_id = $1`;
    if (cursor) {
      params.push(cursor);
      query += ` AND created_at < $${params.length}`;
    }
    query += ` ORDER BY created_at DESC LIMIT 30`;
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

notificationsRouter.patch('/:id/read', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

notificationsRouter.post('/read-all', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user!.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});
