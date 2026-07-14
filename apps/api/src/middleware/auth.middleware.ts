import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { db } from '../config/database';

export interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

// Touch user_profiles.last_seen_at at most once an hour per user. The in-memory
// map skips the DB write on the hot path; the SQL guard keeps it correct across
// restarts/instances. Fire-and-forget — activity tracking must never fail a request.
const lastTouched = new Map<string, number>();
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function touchLastSeen(userId: string) {
  const now = Date.now();
  const prev = lastTouched.get(userId);
  if (prev && now - prev < TOUCH_INTERVAL_MS) return;
  lastTouched.set(userId, now);
  db.query(
    `UPDATE user_profiles SET last_seen_at = now()
     WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 hour')`,
    [userId],
  ).catch(() => {});
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = { id: data.user.id, email: data.user.email };
  touchLastSeen(data.user.id);
  next();
}
