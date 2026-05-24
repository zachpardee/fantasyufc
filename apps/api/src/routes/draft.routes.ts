import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { startDraft, submitPick } from '../services/draft.service';
import { z } from 'zod';

export const draftRouter = Router({ mergeParams: true });

draftRouter.post('/start', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const session = await startDraft(req.params.leagueId, req.user!.id);
    res.status(201).json(session);
  } catch (err) { next(err); }
});

draftRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [session] } = await db.query(
      `SELECT * FROM draft_sessions WHERE league_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.leagueId],
    );
    if (!session) throw new AppError(404, 'No draft found for this league');

    const [{ rows: picks }, { rows: order }] = await Promise.all([
      db.query(`
        SELECT dp.*, f.first_name, f.last_name, f.nickname, f.image_url,
               lm.team_name, up.username
        FROM draft_picks dp
        LEFT JOIN fighters f ON f.id = dp.fighter_id
        JOIN league_members lm ON lm.id = dp.league_member_id
        JOIN user_profiles up ON up.id = lm.user_id
        WHERE dp.draft_session_id = $1
        ORDER BY dp.overall_pick ASC
      `, [session.id]),
      db.query(`
        SELECT dord.*, lm.team_name, up.username
        FROM draft_order dord
        JOIN league_members lm ON lm.id = dord.league_member_id
        JOIN user_profiles up ON up.id = lm.user_id
        WHERE dord.draft_session_id = $1
        ORDER BY dord.position ASC
      `, [session.id]),
    ]);

    res.json({ session, picks, order });
  } catch (err) { next(err); }
});

draftRouter.post('/pick', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { fighterId } = z.object({ fighterId: z.string().uuid() }).parse(req.body);
    const pick = await submitPick(req.params.leagueId, req.user!.id, fighterId);
    res.status(201).json(pick);
  } catch (err) { next(err); }
});

draftRouter.get('/available', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [session] } = await db.query(
      `SELECT id FROM draft_sessions WHERE league_id = $1 AND status IN ('pending', 'active', 'paused')`,
      [req.params.leagueId],
    );
    if (!session) throw new AppError(404, 'No active draft');

    const { rows } = await db.query(`
      SELECT f.*, wc.name as weight_class_name, wc.slug as weight_class_slug
      FROM fighters f
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      WHERE f.status = 'active'
        AND f.id NOT IN (
          SELECT dp.fighter_id FROM draft_picks dp
          WHERE dp.draft_session_id = $1 AND dp.fighter_id IS NOT NULL
        )
      ORDER BY f.ranking ASC NULLS LAST, f.average_fantasy_points DESC NULLS LAST
    `, [session.id]);

    res.json(rows);
  } catch (err) { next(err); }
});

draftRouter.post('/pause', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT commissioner_id FROM leagues WHERE id = $1`, [req.params.leagueId],
    );
    if (league?.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    await db.query(
      `UPDATE draft_sessions SET status = 'paused' WHERE league_id = $1 AND status = 'active'`,
      [req.params.leagueId],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

draftRouter.post('/resume', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT commissioner_id, draft_pick_time_seconds FROM leagues WHERE id = $1`, [req.params.leagueId],
    );
    if (league?.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    const deadline = new Date(Date.now() + league.draft_pick_time_seconds * 1000).toISOString();
    await db.query(
      `UPDATE draft_sessions SET status = 'active', current_pick_deadline = $2 WHERE league_id = $1 AND status = 'paused'`,
      [req.params.leagueId, deadline],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});
