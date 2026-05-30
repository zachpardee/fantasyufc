import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { refreshStakingMatchupScores } from '../services/scoring.service';
import { z } from 'zod';

export const stakingRouter = Router({ mergeParams: true });

function isEventLocked(event: { status: string; prelims_at: string | null; scheduled_at: string }): boolean {
  if (event.status === 'live' || event.status === 'completed') return true;
  const startMs = new Date(event.prelims_at ?? event.scheduled_at).getTime();
  return Date.now() >= startMs - 10 * 60 * 1000;
}

function toDecimalOdds(american: number): number {
  return american >= 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function calcPotentialPayout(stake: number, decimalOdds: number): number {
  return Math.round(stake * decimalOdds * 100) / 100;
}

// GET /leagues/:leagueId/staking/:eventId — bets + weekly budget state for requesting member
stakingRouter.get('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, eventId } = req.params;
    const memberId = req.query.memberId as string | undefined;

    const { rows: [me] } = await db.query(
      `SELECT lm.id, lm.staking_balance, l.weekly_budget
       FROM league_members lm JOIN leagues l ON l.id = lm.league_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [leagueId, req.user!.id],
    );
    if (!me) throw new AppError(403, 'Not a member of this league');

    const viewingOpponent = !!(memberId && memberId !== me.id);
    const targetMemberId = memberId ?? me.id;

    // Gate opponent bets until event is live
    const { rows: [event] } = await db.query(
      `SELECT status FROM ufc_events WHERE id = $1`, [eventId],
    );
    const eventLive = event?.status === 'live' || event?.status === 'completed';
    const revealOpponent = !viewingOpponent || eventLive;

    const { rows: singles } = await db.query(`
      SELECT ss.*,
        f.red_fighter_id, f.blue_fighter_id, f.is_main_event, f.bout_order,
        rf.first_name as fighter_first_name, rf.last_name as fighter_last_name,
        rf.image_url as fighter_image_url
      FROM staking_singles ss
      JOIN fights f ON f.id = ss.fight_id
      JOIN fighters rf ON rf.id = ss.fighter_id
      WHERE ss.league_id = $1 AND ss.event_id = $2 AND ss.member_id = $3
      ORDER BY f.is_main_event DESC, f.bout_order DESC
    `, [leagueId, eventId, revealOpponent ? targetMemberId : null]);

    // Fetch all parlays for this event/member (multiple allowed — e.g. settled + new pending)
    const { rows: parlayRows } = await db.query(`
      SELECT sp.* FROM staking_parlays sp
      WHERE sp.league_id = $1 AND sp.event_id = $2 AND sp.member_id = $3
      ORDER BY sp.created_at ASC
    `, [leagueId, eventId, revealOpponent ? targetMemberId : null]);

    // Fetch all legs for all parlays in one query
    let allLegRows: any[] = [];
    if (parlayRows.length > 0) {
      const { rows } = await db.query(`
        SELECT spl.*, spl.parlay_id,
          f.red_fighter_id, f.blue_fighter_id, f.is_main_event, f.bout_order,
          rf.first_name as fighter_first_name, rf.last_name as fighter_last_name
        FROM staking_parlay_legs spl
        JOIN fights f ON f.id = spl.fight_id
        JOIN fighters rf ON rf.id = spl.fighter_id
        WHERE spl.parlay_id = ANY($1::uuid[])
        ORDER BY f.is_main_event DESC, f.bout_order DESC
      `, [parlayRows.map((p: any) => p.id)]);
      allLegRows = rows;
    }

    // Parlays with embedded legs (for matchup display)
    const parlaysWithLegs = parlayRows.map((p: any) => ({
      ...p,
      legs: allLegRows.filter((l: any) => l.parlay_id === p.id),
    }));

    // Backward compat: parlay = pending parlay, parlayLegs = its legs
    const parlay = parlayRows.find((p: any) => p.status === 'pending') ?? null;
    const parlayLegs = parlay ? allLegRows.filter((l: any) => l.parlay_id === parlay.id) : [];

    const weeklyBudget = parseFloat(me.weekly_budget ?? 100);

    // How much of this week's budget has been committed
    const pendingParlayStake = parlayRows
      .filter((p: any) => p.status === 'pending')
      .reduce((sum: number, p: any) => sum + parseFloat(p.stake), 0);
    const usedThisWeek =
      singles.filter((s: any) => s.status === 'pending').reduce((sum: number, s: any) => sum + parseFloat(s.stake), 0)
      + pendingParlayStake;

    const { rows: fights } = await db.query(`
      SELECT f.id, f.red_fighter_id, f.blue_fighter_id,
             f.is_main_event, f.bout_order, f.card_segment,
             f.red_fighter_odds, f.blue_fighter_odds,
             wc.name AS weight_class_name,
             rf.first_name AS red_first_name, rf.last_name AS red_last_name, rf.image_url AS red_image_url,
             rf.record_wins AS red_record_wins, rf.record_losses AS red_record_losses, rf.record_draws AS red_record_draws,
             bf.first_name AS blue_first_name, bf.last_name AS blue_last_name, bf.image_url AS blue_image_url,
             bf.record_wins AS blue_record_wins, bf.record_losses AS blue_record_losses, bf.record_draws AS blue_record_draws,
             fres.winner_id AS result_winner_id, fres.outcome AS result_outcome
      FROM fights f
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      LEFT JOIN fight_results fres ON fres.fight_id = f.id
      WHERE f.event_id = $1 AND f.card_segment IN ('main', 'prelims')
      ORDER BY f.is_main_event DESC, f.bout_order DESC
      LIMIT 6
    `, [eventId]);

    res.json({
      fights,
      singles,
      parlay: parlay ?? null,
      parlayLegs,
      parlays: parlaysWithLegs,
      weeklyBudget,
      usedThisWeek,
      availableThisWeek: Math.max(0, weeklyBudget - usedThisWeek),
      seasonBankroll: parseFloat(me.staking_balance),
    });
  } catch (err) { next(err); }
});

// PUT /leagues/:leagueId/staking/:eventId/singles — replace all single bets for event
stakingRouter.put('/:eventId/singles', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, eventId } = req.params;

    const body = z.object({
      bets: z.array(z.object({
        fightId: z.string().uuid(),
        fighterId: z.string().uuid(),
        stake: z.number().positive().max(100000),
      })),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT lm.id, l.league_format, l.weekly_budget
       FROM league_members lm JOIN leagues l ON l.id = lm.league_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');
    if (member.league_format !== 'staking') throw new AppError(400, 'Not a staking league');

    const { rows: [event] } = await db.query(
      `SELECT status, scheduled_at, prelims_at FROM ufc_events WHERE id = $1`, [eventId],
    );
    if (!event) throw new AppError(404, 'Event not found');
    if (isEventLocked(event)) throw new AppError(400, 'Betting is closed for this event');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: fights } = await client.query(`
        SELECT id, red_fighter_id, blue_fighter_id, red_fighter_odds, blue_fighter_odds
        FROM fights
        WHERE event_id = $1 AND card_segment IN ('main', 'prelims')
        ORDER BY is_main_event DESC, bout_order DESC
        LIMIT 6
      `, [eventId]);

      const fightMap = new Map(fights.map((f: any) => [f.id, f]));

      for (const bet of body.bets) {
        const fight = fightMap.get(bet.fightId);
        if (!fight) throw new AppError(400, `Fight ${bet.fightId} not valid for this event`);
        const isRed = fight.red_fighter_id === bet.fighterId;
        const isBlue = fight.blue_fighter_id === bet.fighterId;
        if (!isRed && !isBlue) throw new AppError(400, `Fighter not in fight ${bet.fightId}`);
        const odds = isRed ? fight.red_fighter_odds : fight.blue_fighter_odds;
        if (odds == null) throw new AppError(400, `No odds for fight ${bet.fightId}`);
      }

      // Budget check: existing pending + new bets + pending parlay
      const { rows: [existingParlay] } = await client.query(
        `SELECT stake FROM staking_parlays WHERE league_id=$1 AND event_id=$2 AND member_id=$3 AND status='pending'`,
        [leagueId, eventId, member.id],
      );
      const { rows: [existingSinglesAgg] } = await client.query(
        `SELECT COALESCE(SUM(stake), 0) AS total FROM staking_singles WHERE league_id=$1 AND event_id=$2 AND member_id=$3 AND status='pending'`,
        [leagueId, eventId, member.id],
      );
      const parlayStake = existingParlay ? parseFloat(existingParlay.stake) : 0;
      const existingSinglesTotal = parseFloat(existingSinglesAgg.total);
      const weeklyBudget = parseFloat(member.weekly_budget ?? 100);
      const newSinglesTotal = body.bets.reduce((s, b) => s + b.stake, 0);
      const totalCommitted = existingSinglesTotal + newSinglesTotal + parlayStake;

      if (totalCommitted > weeklyBudget + 0.001) {
        const remaining = Math.max(0, weeklyBudget - existingSinglesTotal - parlayStake);
        throw new AppError(400, `Exceeds weekly budget. $${remaining.toFixed(2)} remaining.`);
      }

      // Always insert as a new row — duplicates are allowed
      for (const bet of body.bets) {
        const fight = fightMap.get(bet.fightId)!;
        const isRed = fight.red_fighter_id === bet.fighterId;
        const odds = isRed ? fight.red_fighter_odds : fight.blue_fighter_odds;
        const decOdds = toDecimalOdds(odds);
        const potentialPayout = calcPotentialPayout(bet.stake, decOdds);
        await client.query(`
          INSERT INTO staking_singles (league_id, event_id, member_id, fight_id, fighter_id, odds, stake, potential_payout)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [leagueId, eventId, member.id, bet.fightId, bet.fighterId, odds, bet.stake, potentialPayout]);
      }

      await client.query('COMMIT');
      res.json({ ok: true });
      refreshStakingMatchupScores(leagueId, eventId).catch(() => {});
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// PUT /leagues/:leagueId/staking/:eventId/parlay — replace parlay for event
stakingRouter.put('/:eventId/parlay', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, eventId } = req.params;

    const body = z.object({
      stake: z.number().positive().max(100000),
      legs: z.array(z.object({
        fightId: z.string().uuid(),
        fighterId: z.string().uuid(),
      })).min(2).max(6),
    }).parse(req.body);

    const { rows: [member] } = await db.query(
      `SELECT lm.id, l.league_format, l.weekly_budget
       FROM league_members lm JOIN leagues l ON l.id = lm.league_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');
    if (member.league_format !== 'staking') throw new AppError(400, 'Not a staking league');

    const { rows: [event] } = await db.query(
      `SELECT status, scheduled_at, prelims_at FROM ufc_events WHERE id = $1`, [eventId],
    );
    if (!event) throw new AppError(404, 'Event not found');
    if (isEventLocked(event)) throw new AppError(400, 'Betting is closed for this event');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: fights } = await client.query(`
        SELECT id, red_fighter_id, blue_fighter_id, red_fighter_odds, blue_fighter_odds
        FROM fights WHERE event_id = $1 AND card_segment IN ('main', 'prelims')
        ORDER BY is_main_event DESC, bout_order DESC LIMIT 10
      `, [eventId]);
      const fightMap = new Map(fights.map((f: any) => [f.id, f]));

      let combinedDecOdds = 1;
      const legDetails: { fightId: string; fighterId: string; odds: number; decOdds: number }[] = [];
      for (const leg of body.legs) {
        const fight = fightMap.get(leg.fightId);
        if (!fight) throw new AppError(400, `Fight ${leg.fightId} not valid for this event`);
        const isRed = fight.red_fighter_id === leg.fighterId;
        if (!isRed && fight.blue_fighter_id !== leg.fighterId)
          throw new AppError(400, `Fighter not in fight ${leg.fightId}`);
        const odds = isRed ? fight.red_fighter_odds : fight.blue_fighter_odds;
        if (odds == null) throw new AppError(400, `No odds for fight ${leg.fightId}`);
        const dec = toDecimalOdds(odds);
        combinedDecOdds *= dec;
        legDetails.push({ fightId: leg.fightId, fighterId: leg.fighterId, odds, decOdds: dec });
      }

      // Singles stake counts against this week's budget
      const { rows: existingSingles } = await client.query(
        `SELECT stake FROM staking_singles WHERE league_id=$1 AND event_id=$2 AND member_id=$3 AND status='pending'`,
        [leagueId, eventId, member.id],
      );
      const singlesStake = existingSingles.reduce((s: number, r: any) => s + parseFloat(r.stake), 0);

      const weeklyBudget = parseFloat(member.weekly_budget ?? 100);
      const totalCommitted = body.stake + singlesStake;

      if (totalCommitted > weeklyBudget + 0.001) {
        throw new AppError(400, `Exceeds weekly budget of $${weeklyBudget}. Already allocated $${singlesStake.toFixed(2)} to singles.`);
      }

      // Remove old parlay (no balance refund — budget is per-event)
      const { rows: [existingParlay] } = await client.query(
        `SELECT id FROM staking_parlays WHERE league_id=$1 AND event_id=$2 AND member_id=$3 AND status='pending'`,
        [leagueId, eventId, member.id],
      );
      if (existingParlay) {
        await client.query(`DELETE FROM staking_parlays WHERE id = $1`, [existingParlay.id]);
      }

      const potentialPayout = calcPotentialPayout(body.stake, combinedDecOdds);
      const { rows: [parlay] } = await client.query(`
        INSERT INTO staking_parlays (league_id, event_id, member_id, stake, decimal_odds, potential_payout)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
      `, [leagueId, eventId, member.id, body.stake,
          Math.round(combinedDecOdds * 10000) / 10000, potentialPayout]);

      for (const leg of legDetails) {
        await client.query(`
          INSERT INTO staking_parlay_legs (parlay_id, fight_id, fighter_id, odds, decimal_odds)
          VALUES ($1,$2,$3,$4,$5)
        `, [parlay.id, leg.fightId, leg.fighterId, leg.odds,
            Math.round(leg.decOdds * 10000) / 10000]);
      }

      await client.query('COMMIT');

      const { rows: legs } = await db.query(
        `SELECT spl.*, fi.first_name as fighter_first_name, fi.last_name as fighter_last_name
         FROM staking_parlay_legs spl JOIN fighters fi ON fi.id = spl.fighter_id
         WHERE spl.parlay_id = $1`, [parlay.id],
      );
      res.json({ parlay, legs });
      refreshStakingMatchupScores(leagueId, eventId).catch(() => {});
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// DELETE /leagues/:leagueId/staking/:eventId/parlay
stakingRouter.delete('/:eventId/parlay', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, eventId } = req.params;

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [parlay] } = await db.query(
      `SELECT id FROM staking_parlays WHERE league_id=$1 AND event_id=$2 AND member_id=$3 AND status='pending'`,
      [leagueId, eventId, member.id],
    );
    if (!parlay) throw new AppError(404, 'No pending parlay to remove');

    const { rows: [event] } = await db.query(`SELECT status FROM ufc_events WHERE id = $1`, [eventId]);
    if (!event || event.status !== 'scheduled') throw new AppError(400, 'Betting is closed');

    await db.query(`DELETE FROM staking_parlays WHERE id = $1`, [parlay.id]);
    res.json({ ok: true });
    refreshStakingMatchupScores(leagueId, eventId).catch(() => {});
  } catch (err) { next(err); }
});

// DELETE /leagues/:leagueId/staking/:eventId/singles/:betId
stakingRouter.delete('/:eventId/singles/:betId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, eventId, betId } = req.params;

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [event] } = await db.query(`SELECT status FROM ufc_events WHERE id = $1`, [eventId]);
    if (!event || event.status !== 'scheduled') throw new AppError(400, 'Betting is closed');

    const { rows: [single] } = await db.query(
      `SELECT id FROM staking_singles WHERE id=$1 AND league_id=$2 AND event_id=$3 AND member_id=$4 AND status='pending'`,
      [betId, leagueId, eventId, member.id],
    );
    if (!single) throw new AppError(404, 'Bet not found');

    await db.query(`DELETE FROM staking_singles WHERE id = $1`, [single.id]);
    res.json({ ok: true });
    refreshStakingMatchupScores(leagueId, eventId).catch(() => {});
  } catch (err) { next(err); }
});

// DELETE /leagues/:leagueId/staking/:eventId/parlays/:parlayId
stakingRouter.delete('/:eventId/parlays/:parlayId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, eventId, parlayId } = req.params;

    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [event] } = await db.query(`SELECT status FROM ufc_events WHERE id = $1`, [eventId]);
    if (!event || event.status !== 'scheduled') throw new AppError(400, 'Betting is closed');

    const { rows: [parlay] } = await db.query(
      `SELECT id FROM staking_parlays WHERE id=$1 AND league_id=$2 AND event_id=$3 AND member_id=$4 AND status='pending'`,
      [parlayId, leagueId, eventId, member.id],
    );
    if (!parlay) throw new AppError(404, 'Parlay not found');

    await db.query(`DELETE FROM staking_parlays WHERE id = $1`, [parlay.id]);
    res.json({ ok: true });
    refreshStakingMatchupScores(leagueId, eventId).catch(() => {});
  } catch (err) { next(err); }
});
