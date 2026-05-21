import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { z } from 'zod';

export const picksRouter = Router({ mergeParams: true });

// The next/current scoring event for this league
picksRouter.get('/current-event', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [event] } = await db.query(`
      SELECT e.*, COUNT(f.id)::int AS fight_count
      FROM ufc_events e
      JOIN league_events le ON le.event_id = e.id
      LEFT JOIN fights f ON f.event_id = e.id
      WHERE le.league_id = $1 AND le.is_scoring = true
        AND e.status IN ('scheduled', 'live')
      GROUP BY e.id
      ORDER BY e.scheduled_at ASC
      LIMIT 1
    `, [req.params.leagueId]);
    res.json(event ?? null);
  } catch (err) { next(err); }
});

// Fights for a specific event, with picks overlaid.
// Pass ?memberId=<league_member_id> to view another member's picks (any league member can view).
picksRouter.get('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    // Allow viewing another member's picks (for matchup page)
    const targetMemberId = (req.query.memberId as string) || member.id;

    const { rows: fights } = await db.query(`
      SELECT
        f.id, f.is_title_fight, f.is_main_event, f.is_co_main,
        f.card_segment, f.scheduled_rounds, f.bout_order, f.status,
        f.red_fighter_odds, f.blue_fighter_odds,
        f.red_fighter_id, rf.first_name AS red_first_name, rf.last_name AS red_last_name,
        rf.nickname AS red_nickname, rf.image_url AS red_image_url,
        rf.ranking AS red_ranking, rf.is_champion AS red_is_champion,
        f.blue_fighter_id, bf.first_name AS blue_first_name, bf.last_name AS blue_last_name,
        bf.nickname AS blue_nickname, bf.image_url AS blue_image_url,
        bf.ranking AS blue_ranking, bf.is_champion AS blue_is_champion,
        wc.name AS weight_class_name,
        ep.picked_fighter_id, ep.picked_method, ep.is_correct, ep.points_earned,
        fr.winner_id AS result_winner_id, fr.outcome AS result_outcome,
        fr.ending_round AS result_ending_round
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      LEFT JOIN event_picks ep
        ON ep.fight_id = f.id
        AND ep.league_id = $1 AND ep.member_id = $2
      LEFT JOIN fight_results fr ON fr.fight_id = f.id
      WHERE f.event_id = $3
      ORDER BY f.is_main_event DESC, f.is_co_main DESC, f.bout_order DESC, f.id DESC
      LIMIT 6
    `, [req.params.leagueId, targetMemberId, req.params.eventId]);

    const { rows: [event] } = await db.query(
      `SELECT status, name, scheduled_at FROM ufc_events WHERE id = $1`, [req.params.eventId],
    );
    const locked = event?.status === 'live' || event?.status === 'completed';

    res.json({ fights, locked, eventStatus: event?.status, eventName: event?.name, scheduledAt: event?.scheduled_at });
  } catch (err) { next(err); }
});

// Submit or update picks — locked once event goes live
picksRouter.post('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { picks } = z.object({
      picks: z.array(z.object({
        fightId: z.string().uuid(),
        pickedFighterId: z.string().uuid(),
        pickedMethod: z.enum(['ko_tko', 'submission', 'decision', 'disqualification']),
      })),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [event] } = await db.query(
      `SELECT status FROM ufc_events WHERE id = $1`, [req.params.eventId],
    );
    if (!event) throw new AppError(404, 'Event not found');
    if (event.status === 'live' || event.status === 'completed') {
      throw new AppError(400, 'Picks are locked — event has already started');
    }

    // Only the top-6 fights are pickable
    const { rows: eligibleFights } = await db.query(`
      SELECT id FROM fights WHERE event_id = $1
      ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC, id DESC
      LIMIT 6
    `, [req.params.eventId]);
    const eligibleIds = new Set(eligibleFights.map((f) => f.id));
    if (picks.some((p) => !eligibleIds.has(p.fightId))) {
      throw new AppError(400, 'Pick includes a fight not in the top 6 for this event');
    }

    for (const pick of picks) {
      await db.query(`
        INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (league_id, member_id, fight_id) DO UPDATE SET
          picked_fighter_id = EXCLUDED.picked_fighter_id,
          picked_method = EXCLUDED.picked_method,
          submitted_at = NOW()
      `, [req.params.leagueId, member.id, pick.fightId, pick.pickedFighterId, pick.pickedMethod ?? null]);
    }

    res.json({ ok: true, count: picks.length });
  } catch (err) { next(err); }
});
