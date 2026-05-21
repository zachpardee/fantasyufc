import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { syncEvents } from '../jobs/eventSync.job';
import { syncAllFighters } from '../jobs/fighterSync.job';
import { AppError } from '../middleware/error.middleware';
import { db } from '../config/database';

export const adminRouter = Router();

// In production, gate these with an admin role check against user_profiles
function requireAdmin(req: AuthRequest, res: any, next: any) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return next(new AppError(403, 'Admin only'));
  }
  next();
}

adminRouter.post('/sync/events', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    syncEvents().catch(console.error); // Fire and forget
    res.json({ ok: true, message: 'Event sync started' });
  } catch (err) { next(err); }
});

adminRouter.post('/sync/fighters', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    syncAllFighters().catch(console.error); // Fire and forget
    res.json({ ok: true, message: 'Fighter sync started (this takes several minutes)' });
  } catch (err) { next(err); }
});

adminRouter.get('/events', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, status, scheduled_at FROM ufc_events ORDER BY scheduled_at DESC LIMIT 20`,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

adminRouter.patch('/events/:eventId/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['scheduled','live','completed','cancelled'].includes(status)) {
      throw new AppError(400, 'Invalid status');
    }
    await db.query(`UPDATE ufc_events SET status = $1 WHERE id = $2`, [status, req.params.eventId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Manually add a fight result (commissioner tool + admin tool)
adminRouter.post('/fights/:fightId/result', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Delegated to events.routes handler — just a convenience alias
    res.redirect(307, `/api/v1/events/admin/${req.body.eventId}/results`);
  } catch (err) { next(err); }
});
