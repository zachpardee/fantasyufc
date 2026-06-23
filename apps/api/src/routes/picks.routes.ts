import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { lingerWindowSql } from '../utils/currentEvent';
import { z } from 'zod';

export const picksRouter = Router({ mergeParams: true });

function isEventLocked(event: {
  status: string;
  prelims_at: string | null;
  scheduled_at: string;
}): boolean {
  if (event.status === 'live' || event.status === 'completed') return true;
  const startMs = new Date(event.prelims_at ?? event.scheduled_at).getTime();
  return Date.now() >= startMs - 10 * 60 * 1000;
}

// The next/current scoring event for this league
picksRouter.get('/current-event', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    // Priority: 1) live, 2) a recently completed event still in its review window (so users
    // can review results through Monday after a Saturday event), 3) next scheduled.
    const {
      rows: [event],
    } = await db.query(
      `
      SELECT e.*, COUNT(f.id)::int AS fight_count,
        CASE
          WHEN e.status = 'live' THEN 0
          WHEN e.status = 'completed' AND ${lingerWindowSql('e')} THEN 1
          WHEN e.status = 'scheduled' THEN 2
          ELSE 3
        END AS priority
      FROM ufc_events e
      JOIN league_events le ON le.event_id = e.id
      LEFT JOIN fights f ON f.event_id = e.id
      WHERE le.league_id = $1 AND le.is_scoring = true
        AND (
          e.status IN ('scheduled', 'live')
          OR (e.status = 'completed' AND ${lingerWindowSql('e')})
        )
      GROUP BY e.id
      ORDER BY priority ASC,
        CASE WHEN e.status = 'completed' THEN e.scheduled_at END DESC,
        e.scheduled_at ASC
      LIMIT 1
    `,
      [req.params.leagueId],
    );
    res.json(event ?? null);
  } catch (err) {
    next(err);
  }
});

// Fights for a specific event, with picks overlaid.
// Pass ?memberId=<league_member_id> to view another member's picks (any league member can view).
picksRouter.get('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [member],
    } = await db.query(
      `SELECT id, picks_public FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    // Allow viewing another member's picks (for matchup page) — verify they're in this league
    const viewingOpponent = !!(req.query.memberId && req.query.memberId !== member.id);
    let targetMemberId = member.id;
    let targetPicksPublic = false;
    if (viewingOpponent) {
      const {
        rows: [targetMember],
      } = await db.query(
        `SELECT id, picks_public FROM league_members WHERE league_id = $1 AND id = $2`,
        [req.params.leagueId, req.query.memberId],
      );
      if (!targetMember) throw new AppError(404, 'Member not found in this league');
      targetMemberId = targetMember.id;
      targetPicksPublic = targetMember.picks_public ?? false;
    }

    const {
      rows: [event],
    } = await db.query(
      `SELECT status, name, scheduled_at, prelims_at FROM ufc_events WHERE id = $1`,
      [req.params.eventId],
    );
    const eventLive = event?.status === 'live' || event?.status === 'completed';
    // Opponent picks hidden until event goes live, unless the opponent made picks public
    const revealOpponent = !viewingOpponent || eventLive || targetPicksPublic;

    const { rows: fights } = await db.query(
      `
      SELECT
        f.id, f.is_title_fight, f.is_main_event, f.is_co_main,
        f.card_segment, f.scheduled_rounds, f.bout_order, f.status,
        f.red_fighter_odds, f.blue_fighter_odds,
        f.red_fighter_id, rf.first_name AS red_first_name, rf.last_name AS red_last_name,
        rf.nickname AS red_nickname, rf.image_url AS red_image_url,
        rf.ranking AS red_ranking, rf.is_champion AS red_is_champion,
        rf.nationality AS red_nationality,
        f.blue_fighter_id, bf.first_name AS blue_first_name, bf.last_name AS blue_last_name,
        bf.nickname AS blue_nickname, bf.image_url AS blue_image_url,
        bf.ranking AS blue_ranking, bf.is_champion AS blue_is_champion,
        bf.nationality AS blue_nationality,
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
    `,
      [req.params.leagueId, revealOpponent ? targetMemberId : null, req.params.eventId],
    );

    const locked = event ? isEventLocked(event) : false;

    res.json({
      fights,
      locked,
      eventStatus: event?.status,
      eventName: event?.name,
      scheduledAt: event?.scheduled_at,
      picksPublic: member.picks_public ?? false,
    });
  } catch (err) {
    next(err);
  }
});

// Submit or update picks — locked once event goes live
picksRouter.post('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { picks } = z
      .object({
        picks: z.array(
          z.object({
            fightId: z.string().uuid(),
            pickedFighterId: z.string().uuid(),
            pickedMethod: z.enum([
              'ko_tko',
              'submission',
              'decision',
              'decision_unanimous',
              'decision_split',
              'decision_majority',
              'disqualification',
            ]),
          }),
        ),
      })
      .parse(req.body);

    const {
      rows: [member],
    } = await db.query(`SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!member) throw new AppError(403, 'Not a member of this league');

    const {
      rows: [event],
    } = await db.query(`SELECT status, scheduled_at, prelims_at FROM ufc_events WHERE id = $1`, [
      req.params.eventId,
    ]);
    if (!event) throw new AppError(404, 'Event not found');
    if (isEventLocked(event)) throw new AppError(400, 'Picks are locked — event starts soon');

    // Only the top-10 fights are pickable
    const { rows: eligibleFights } = await db.query(
      `
      SELECT id FROM fights WHERE event_id = $1
      ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC, id DESC
      LIMIT 6
    `,
      [req.params.eventId],
    );
    const eligibleIds = new Set(eligibleFights.map((f) => f.id));
    if (picks.some((p) => !eligibleIds.has(p.fightId))) {
      throw new AppError(400, 'Pick includes a fight not in the top 10 for this event');
    }

    for (const pick of picks) {
      await db.query(
        `
        INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (league_id, member_id, fight_id) DO UPDATE SET
          picked_fighter_id = EXCLUDED.picked_fighter_id,
          picked_method = EXCLUDED.picked_method,
          submitted_at = NOW()
      `,
        [
          req.params.leagueId,
          member.id,
          pick.fightId,
          pick.pickedFighterId,
          pick.pickedMethod ?? null,
        ],
      );
    }

    res.json({ ok: true, count: picks.length });
  } catch (err) {
    next(err);
  }
});

// Get a member's event champion pick (with fighter info + result)
// Pass ?memberId=<league_member_id> to view another member's pick
picksRouter.get('/:eventId/champion', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [member],
    } = await db.query(`SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!member) throw new AppError(403, 'Not a member of this league');

    const viewingOpponent = !!(req.query.memberId && req.query.memberId !== member.id);
    let targetMemberId = member.id;
    if (viewingOpponent) {
      const {
        rows: [targetMember],
      } = await db.query(`SELECT id FROM league_members WHERE league_id = $1 AND id = $2`, [
        req.params.leagueId,
        req.query.memberId,
      ]);
      if (!targetMember) throw new AppError(404, 'Member not found in this league');
      targetMemberId = targetMember.id;
    }

    if (viewingOpponent) {
      const {
        rows: [event],
      } = await db.query(`SELECT status FROM ufc_events WHERE id = $1`, [req.params.eventId]);
      if (event?.status !== 'live' && event?.status !== 'completed') return res.json(null);
    }

    const {
      rows: [pick],
    } = await db.query(
      `
      SELECT ecp.fighter_id, ecp.fight_id, ecp.points_earned,
             f.first_name, f.last_name, f.image_url,
             fr.winner_id AS result_winner_id
      FROM event_champion_picks ecp
      JOIN fighters f ON f.id = ecp.fighter_id
      LEFT JOIN fight_results fr ON fr.fight_id = ecp.fight_id
      WHERE ecp.league_id = $1 AND ecp.member_id = $2 AND ecp.event_id = $3
    `,
      [req.params.leagueId, targetMemberId, req.params.eventId],
    );

    res.json(pick ?? null);
  } catch (err) {
    next(err);
  }
});

// Set event champion pick — locked once event goes live
picksRouter.put('/:eventId/champion', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { fighterId } = z.object({ fighterId: z.string().uuid() }).parse(req.body);

    const {
      rows: [member],
    } = await db.query(`SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!member) throw new AppError(403, 'Not a member of this league');

    const {
      rows: [event],
    } = await db.query(`SELECT status, scheduled_at, prelims_at FROM ufc_events WHERE id = $1`, [
      req.params.eventId,
    ]);
    if (!event) throw new AppError(404, 'Event not found');
    if (isEventLocked(event))
      throw new AppError(400, 'Champion pick is locked — event starts soon');

    // Fighter must be in one of the top-10 fights for this event
    const {
      rows: [fight],
    } = await db.query(
      `
      SELECT id FROM fights
      WHERE event_id = $1 AND (red_fighter_id = $2 OR blue_fighter_id = $2)
        AND id IN (
          SELECT id FROM fights WHERE event_id = $1
          ORDER BY is_main_event DESC, is_co_main DESC, bout_order DESC, id DESC
          LIMIT 6
        )
    `,
      [req.params.eventId, fighterId],
    );
    if (!fight) throw new AppError(400, 'Fighter is not in the top-10 fights for this event');

    await db.query(
      `
      INSERT INTO event_champion_picks (league_id, member_id, event_id, fighter_id, fight_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (league_id, member_id, event_id) DO UPDATE SET
        fighter_id = EXCLUDED.fighter_id,
        fight_id = EXCLUDED.fight_id,
        points_earned = 0,
        submitted_at = NOW()
    `,
      [req.params.leagueId, member.id, req.params.eventId, fighterId, fight.id],
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// All members' picks for an event — for the comparison view
picksRouter.get('/:eventId/all', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [member],
    } = await db.query(`SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!member) throw new AppError(403, 'Not a member of this league');

    const {
      rows: [event],
    } = await db.query(`SELECT id, name, status, scheduled_at FROM ufc_events WHERE id = $1`, [
      req.params.eventId,
    ]);
    if (!event) throw new AppError(404, 'Event not found');
    const eventLive = event.status === 'live' || event.status === 'completed';

    const { rows: members } = await db.query(
      `SELECT id, team_name FROM league_members WHERE league_id = $1 AND is_active = true ORDER BY total_points DESC`,
      [req.params.leagueId],
    );

    const { rows: fights } = await db.query(
      `
      SELECT
        f.id, f.is_title_fight, f.card_segment, f.scheduled_rounds, f.bout_order,
        f.red_fighter_id, rf.first_name AS red_first_name, rf.last_name AS red_last_name,
        rf.image_url AS red_image_url, rf.ranking AS red_ranking, rf.is_champion AS red_is_champion,
        f.blue_fighter_id, bf.first_name AS blue_first_name, bf.last_name AS blue_last_name,
        bf.image_url AS blue_image_url, bf.ranking AS blue_ranking, bf.is_champion AS blue_is_champion,
        wc.name AS weight_class_name,
        fr.winner_id AS result_winner_id, fr.outcome AS result_outcome
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      LEFT JOIN fight_results fr ON fr.fight_id = f.id
      WHERE f.event_id = $1
      ORDER BY f.is_main_event DESC, f.is_co_main DESC, f.bout_order DESC, f.id DESC
      LIMIT 6
    `,
      [req.params.eventId],
    );

    // Only reveal picks once event is live
    const pickMap: Record<string, Record<string, any>> = {};
    if (eventLive) {
      const { rows: allPicks } = await db.query(
        `
        SELECT ep.fight_id, ep.member_id, ep.picked_fighter_id, ep.picked_method, ep.is_correct, ep.points_earned
        FROM event_picks ep
        WHERE ep.league_id = $1 AND ep.fight_id = ANY($2::uuid[])
      `,
        [req.params.leagueId, fights.map((f) => f.id)],
      );

      for (const p of allPicks) {
        if (!pickMap[p.fight_id]) pickMap[p.fight_id] = {};
        pickMap[p.fight_id][p.member_id] = p;
      }
    }

    const fightsWithPicks = fights.map((f) => ({ ...f, picks: pickMap[f.id] ?? {} }));

    const championMap: Record<string, any> = {};
    if (eventLive) {
      const { rows: championPicks } = await db.query(
        `
        SELECT ecp.member_id, ecp.fighter_id, ecp.points_earned,
               f.first_name, f.last_name,
               fr.winner_id AS result_winner_id
        FROM event_champion_picks ecp
        JOIN fighters f ON f.id = ecp.fighter_id
        LEFT JOIN fight_results fr ON fr.fight_id = ecp.fight_id
        WHERE ecp.league_id = $1 AND ecp.event_id = $2
      `,
        [req.params.leagueId, req.params.eventId],
      );
      for (const cp of championPicks) championMap[cp.member_id] = cp;
    }

    res.json({ event, members, fights: fightsWithPicks, championPicks: championMap });
  } catch (err) {
    next(err);
  }
});
