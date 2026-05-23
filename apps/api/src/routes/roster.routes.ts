import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { redis } from '../config/redis';
import { z } from 'zod';

export const rosterRouter = Router({ mergeParams: true });

rosterRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(404, 'Not a member of this league');

    const { rows } = await db.query(`
      SELECT rf.*, f.first_name, f.last_name, f.nickname, f.image_url,
             f.record_wins, f.record_losses, f.ranking, f.is_champion,
             f.average_fantasy_points, wc.name as weight_class_name, wc.slug as weight_class_slug,
             next_e.name as next_event_name, next_e.scheduled_at as next_event_date
      FROM roster_fighters rf
      JOIN rosters r ON r.id = rf.roster_id
      JOIN fighters f ON f.id = rf.fighter_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      LEFT JOIN LATERAL (
        SELECT e.name, e.scheduled_at
        FROM fights fi
        JOIN ufc_events e ON e.id = fi.event_id
        WHERE (fi.red_fighter_id = f.id OR fi.blue_fighter_id = f.id)
          AND e.status IN ('scheduled', 'live')
        ORDER BY e.scheduled_at ASC
        LIMIT 1
      ) next_e ON true
      WHERE r.league_member_id = $1
      ORDER BY rf.slot_type, rf.slot_position
    `, [member.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

rosterRouter.get('/:memberId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT rf.*, f.first_name, f.last_name, f.nickname, f.image_url,
             f.record_wins, f.record_losses, f.ranking, f.is_champion,
             f.average_fantasy_points, wc.name as weight_class_name, wc.slug as weight_class_slug,
             next_e.name as next_event_name, next_e.scheduled_at as next_event_date
      FROM roster_fighters rf
      JOIN rosters r ON r.id = rf.roster_id
      JOIN fighters f ON f.id = rf.fighter_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      LEFT JOIN LATERAL (
        SELECT e.name, e.scheduled_at
        FROM fights fi
        JOIN ufc_events e ON e.id = fi.event_id
        WHERE (fi.red_fighter_id = f.id OR fi.blue_fighter_id = f.id)
          AND e.status IN ('scheduled', 'live')
        ORDER BY e.scheduled_at ASC
        LIMIT 1
      ) next_e ON true
      WHERE r.league_member_id = $1
      ORDER BY rf.slot_type, rf.slot_position
    `, [req.params.memberId]);
    res.json(rows);
  } catch (err) { next(err); }
});

rosterRouter.post('/set-lineup', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { slots } = z.object({
      slots: z.array(z.object({
        fighterId: z.string().uuid(),
        slotType: z.enum(['starter', 'bench', 'ir']),
        slotPosition: z.number().int().min(0),
      })),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    // Check lineup lock (event in progress)
    const { rows: [liveEvent] } = await db.query(`
      SELECT e.id FROM ufc_events e
      JOIN league_events le ON le.event_id = e.id
      JOIN leagues l ON l.id = le.league_id
      WHERE l.id = $1 AND e.status = 'live'
      LIMIT 1
    `, [req.params.leagueId]);
    if (liveEvent) throw new AppError(400, 'Lineup is locked during live events');

    const { rows: [roster] } = await db.query(
      `SELECT id FROM rosters WHERE league_member_id = $1`, [member.id],
    );

    for (const slot of slots) {
      await db.query(`
        UPDATE roster_fighters SET slot_type = $1, slot_position = $2
        WHERE roster_id = $3 AND fighter_id = $4
      `, [slot.slotType, slot.slotPosition, roster.id, slot.fighterId]);
    }

    await redis.del(`free-agents:${req.params.leagueId}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
