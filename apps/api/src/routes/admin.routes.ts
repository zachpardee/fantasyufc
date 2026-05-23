import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { syncEvents } from '../jobs/eventSync.job';
import { syncAllFighters } from '../jobs/fighterSync.job';
import { autoScheduleNextEvents } from '../jobs/autoSchedule.job';
import { AppError } from '../middleware/error.middleware';
import { db } from '../config/database';
import { fetchEventsByDate } from '../services/espn.adapter';

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

adminRouter.post('/schedule/auto', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    await autoScheduleNextEvents();
    res.json({ ok: true, message: 'Auto-schedule run complete' });
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

// Re-sync fight card for a specific event (bout_order, is_main_event, card_segment)
adminRouter.post('/events/:eventId/resync-fights', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows: [event] } = await db.query(
      `SELECT id, ufc_event_id, name, scheduled_at FROM ufc_events WHERE id = $1`,
      [req.params.eventId],
    );
    if (!event) throw new AppError(404, 'Event not found');

    const dateStr = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
    const espnEvents = await fetchEventsByDate(dateStr);
    const espnEvent = espnEvents.find(
      (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
    );
    if (!espnEvent) throw new AppError(404, 'Event not found in ESPN data for that date');

    let updated = 0;
    for (const fight of espnEvent.fights) {
      const result = await db.query(`
        UPDATE fights
        SET bout_order = $1, is_main_event = $2, is_co_main = $3, card_segment = $4,
            red_fighter_odds = COALESCE($5, red_fighter_odds),
            blue_fighter_odds = COALESCE($6, blue_fighter_odds)
        WHERE ufc_fight_id = $7
      `, [
        fight.boutOrder, fight.isMainEvent, fight.isCoMain, fight.cardSegment,
        fight.redOdds ?? null, fight.blueOdds ?? null,
        fight.espnFightId,
      ]);
      if (result.rowCount) updated++;
    }

    res.json({ ok: true, event: event.name, fightsUpdated: updated, totalFromEspn: espnEvent.fights.length });
  } catch (err) { next(err); }
});

// Add tonight's event to all active leagues that don't already have it
adminRouter.post('/events/:eventId/push-to-leagues', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows: [event] } = await db.query(
      `SELECT id, name FROM ufc_events WHERE id = $1 AND status != 'cancelled'`,
      [req.params.eventId],
    );
    if (!event) throw new AppError(404, 'Event not found');

    const { rows: leagues } = await db.query(`
      SELECT l.id FROM leagues l
      WHERE l.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM league_events le
          WHERE le.league_id = l.id AND le.event_id = $1
        )
    `, [event.id]);

    for (const league of leagues) {
      await db.query(`
        INSERT INTO league_events (league_id, event_id, is_scoring)
        VALUES ($1, $2, true)
        ON CONFLICT DO NOTHING
      `, [league.id, event.id]);
    }

    res.json({ ok: true, event: event.name, leaguesAdded: leagues.length });
  } catch (err) { next(err); }
});

// Manually add a fight result (commissioner tool + admin tool)
adminRouter.post('/fights/:fightId/result', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Delegated to events.routes handler — just a convenience alias
    res.redirect(307, `/api/v1/events/admin/${req.body.eventId}/results`);
  } catch (err) { next(err); }
});
