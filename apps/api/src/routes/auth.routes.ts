import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { z } from 'zod';

export const authRouter = Router();

authRouter.post('/register', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { username, displayName, timezone } = z
      .object({
        // Legacy clients (pre-username-removal mobile builds) still send username;
        // accept it as a display-name fallback. New clients send displayName only.
        username: z.string().min(1).max(50).optional(),
        displayName: z.string().max(100).optional(),
        timezone: z.string().default('America/New_York'),
      })
      .parse(req.body);

    const name = (displayName ?? username)?.trim();
    if (!name) throw new AppError(400, 'Display name is required');

    const {
      rows: [profile],
    } = await db.query(
      `
      INSERT INTO user_profiles (id, display_name, timezone)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
      [req.user!.id, name, timezone],
    );

    res.status(201).json(profile);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [profile],
    } = await db.query(`SELECT * FROM user_profiles WHERE id = $1`, [req.user!.id]);
    if (!profile) throw new AppError(404, 'Profile not found');
    const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').filter(Boolean);
    res.json({ ...profile, is_admin: adminIds.includes(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        displayName: z.string().max(100).optional(),
        avatarUrl: z.union([z.string().url(), z.literal('')]).optional(),
        timezone: z.string().optional(),
        notificationPrefs: z
          .object({
            fightResults: z.boolean(),
            draftPicks: z.boolean(),
            eventStarting: z.boolean(),
          })
          .optional(),
      })
      .parse(req.body);

    const {
      rows: [profile],
    } = await db.query(
      `
      UPDATE user_profiles SET
        display_name = COALESCE($2, display_name),
        avatar_url = COALESCE($3, avatar_url),
        timezone = COALESCE($4, timezone),
        notification_prefs = COALESCE($5::jsonb, notification_prefs)
      WHERE id = $1
      RETURNING *
    `,
      [
        req.user!.id,
        body.displayName,
        body.avatarUrl,
        body.timezone,
        body.notificationPrefs ? JSON.stringify(body.notificationPrefs) : null,
      ],
    );

    res.json(profile);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/push-token', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    await db.query(
      `UPDATE user_profiles SET push_token = $1, push_token_updated_at = NOW() WHERE id = $2`,
      [token, req.user!.id],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
