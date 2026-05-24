import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { sendNotification } from '../services/notification.service';
import { z } from 'zod';

export const tradesRouter = Router({ mergeParams: true });

type TradeWindow = { open: boolean; deadline: string | null; reason: string | null };

async function getTradeWindow(leagueId: string): Promise<TradeWindow> {
  const { rows: [league] } = await db.query(
    `SELECT status, trade_deadline_days FROM leagues WHERE id = $1`, [leagueId],
  );
  if (!league) return { open: false, deadline: null, reason: 'League not found' };
  if (league.status === 'playoffs') return { open: false, deadline: null, reason: 'Playoffs have started' };
  if (league.status === 'completed') return { open: false, deadline: null, reason: 'Season is over' };
  if (league.status !== 'active') return { open: false, deadline: null, reason: 'Trades not available yet' };

  const { rows: [nextEvent] } = await db.query(`
    SELECT e.scheduled_at
    FROM league_events le
    JOIN ufc_events e ON e.id = le.event_id
    WHERE le.league_id = $1 AND e.scheduled_at > NOW()
    ORDER BY e.scheduled_at ASC
    LIMIT 1
  `, [leagueId]);

  if (!nextEvent) return { open: true, deadline: null, reason: null };

  const deadline = new Date(nextEvent.scheduled_at);
  deadline.setDate(deadline.getDate() - league.trade_deadline_days);

  if (new Date() >= deadline) {
    return { open: false, deadline: deadline.toISOString(), reason: 'Trade deadline has passed' };
  }
  return { open: true, deadline: deadline.toISOString(), reason: null };
}

tradesRouter.get('/deadline', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');
    res.json(await getTradeWindow(req.params.leagueId));
  } catch (err) { next(err); }
});

tradesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: trades } = await db.query(`
      SELECT t.*, pt.team_name as proposing_team_name, rt.team_name as receiving_team_name
      FROM trades t
      JOIN league_members pt ON pt.id = t.proposing_team_id
      JOIN league_members rt ON rt.id = t.receiving_team_id
      WHERE t.league_id = $1
        AND (t.proposing_team_id = $2 OR t.receiving_team_id = $2)
      ORDER BY t.proposed_at DESC
      LIMIT 50
    `, [req.params.leagueId, member.id]);

    // Attach fighter items to each trade
    const tradeIds = trades.map((t) => t.id);
    let itemsByTrade: Record<string, any[]> = {};
    if (tradeIds.length) {
      const { rows: items } = await db.query(`
        SELECT ti.*, f.first_name, f.last_name, ti.from_team_id, ti.to_team_id
        FROM trade_items ti
        JOIN fighters f ON f.id = ti.fighter_id
        WHERE ti.trade_id = ANY($1)
      `, [tradeIds]);
      for (const item of items) {
        if (!itemsByTrade[item.trade_id]) itemsByTrade[item.trade_id] = [];
        itemsByTrade[item.trade_id].push(item);
      }
    }

    res.json(trades.map((t) => ({ ...t, items: itemsByTrade[t.id] ?? [] })));
  } catch (err) { next(err); }
});

tradesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      receivingTeamId: z.string().uuid(),
      message: z.string().max(500).optional(),
      offering: z.array(z.string().uuid()).min(1),
      requesting: z.array(z.string().uuid()).min(1),
    }).parse(req.body);

    const { rows: [myMember] } = await db.query(
      `SELECT id, user_id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!myMember) throw new AppError(403, 'Not a member of this league');
    if (myMember.id === body.receivingTeamId) throw new AppError(400, 'Cannot trade with yourself');

    const window = await getTradeWindow(req.params.leagueId);
    if (!window.open) throw new AppError(400, window.reason ?? 'Trade deadline has passed');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [trade] } = await client.query(`
        INSERT INTO trades (league_id, proposing_team_id, receiving_team_id, message, expires_at)
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '3 days')
        RETURNING *
      `, [req.params.leagueId, myMember.id, body.receivingTeamId, body.message ?? null]);

      for (const fighterId of body.offering) {
        await client.query(
          `INSERT INTO trade_items (trade_id, from_team_id, to_team_id, fighter_id) VALUES ($1,$2,$3,$4)`,
          [trade.id, myMember.id, body.receivingTeamId, fighterId],
        );
      }
      for (const fighterId of body.requesting) {
        await client.query(
          `INSERT INTO trade_items (trade_id, from_team_id, to_team_id, fighter_id) VALUES ($1,$2,$3,$4)`,
          [trade.id, body.receivingTeamId, myMember.id, fighterId],
        );
      }

      await client.query('COMMIT');

      const { rows: [receiver] } = await db.query(
        `SELECT user_id FROM league_members WHERE id = $1`, [body.receivingTeamId],
      );
      await sendNotification(receiver.user_id, 'trade_offer', 'New Trade Offer', 'You have a new trade offer', { leagueId: req.params.leagueId, tradeId: trade.id });

      res.status(201).json(trade);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

tradesRouter.post('/:tradeId/accept', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [trade] } = await client.query(
        `SELECT t.*, lm.user_id as receiving_user_id
         FROM trades t JOIN league_members lm ON lm.id = t.receiving_team_id
         WHERE t.id = $1 AND t.league_id = $2 AND t.status = 'pending'`,
        [req.params.tradeId, req.params.leagueId],
      );
      if (!trade) throw new AppError(404, 'Trade not found or not pending');
      if (trade.receiving_user_id !== req.user!.id) throw new AppError(403, 'Not the receiving team');

      const window = await getTradeWindow(req.params.leagueId);
      if (!window.open) throw new AppError(400, window.reason ?? 'Trade deadline has passed');

      const { rows: items } = await client.query(
        `SELECT * FROM trade_items WHERE trade_id = $1`, [trade.id],
      );

      for (const item of items) {
        const { rows: [fromRoster] } = await client.query(
          `SELECT r.id FROM rosters r JOIN league_members lm ON lm.id = r.league_member_id WHERE lm.id = $1`,
          [item.from_team_id],
        );
        const { rows: [toRoster] } = await client.query(
          `SELECT r.id FROM rosters r JOIN league_members lm ON lm.id = r.league_member_id WHERE lm.id = $1`,
          [item.to_team_id],
        );
        await client.query(
          `UPDATE roster_fighters SET roster_id = $1, acquired_via = 'trade', acquired_at = NOW() WHERE roster_id = $2 AND fighter_id = $3`,
          [toRoster.id, fromRoster.id, item.fighter_id],
        );
        await client.query(
          `INSERT INTO fighter_transactions (league_id, fighter_id, from_team_id, to_team_id, transaction_type, related_id) VALUES ($1,$2,$3,$4,'trade',$5)`,
          [req.params.leagueId, item.fighter_id, item.from_team_id, item.to_team_id, trade.id],
        );
      }

      await client.query(
        `UPDATE trades SET status = 'accepted', responded_at = NOW(), processed_at = NOW() WHERE id = $1`,
        [trade.id],
      );
      await client.query('COMMIT');

      const { rows: [proposer] } = await db.query(
        `SELECT user_id FROM league_members WHERE id = $1`, [trade.proposing_team_id],
      );
      await sendNotification(proposer.user_id, 'trade_accepted', 'Trade Accepted', 'Your trade offer was accepted', { leagueId: req.params.leagueId, tradeId: trade.id });

      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

tradesRouter.post('/:tradeId/reject', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [trade] } = await db.query(
      `SELECT t.*, lm.user_id as receiving_user_id
       FROM trades t JOIN league_members lm ON lm.id = t.receiving_team_id
       WHERE t.id = $1 AND t.league_id = $2 AND t.status = 'pending'`,
      [req.params.tradeId, req.params.leagueId],
    );
    if (!trade) throw new AppError(404, 'Trade not found');
    if (trade.receiving_user_id !== req.user!.id) throw new AppError(403, 'Not the receiving team');

    await db.query(
      `UPDATE trades SET status = 'rejected', responded_at = NOW() WHERE id = $1`, [trade.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

tradesRouter.delete('/:tradeId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [trade] } = await db.query(
      `SELECT t.*, lm.user_id as proposing_user_id
       FROM trades t JOIN league_members lm ON lm.id = t.proposing_team_id
       WHERE t.id = $1 AND t.league_id = $2 AND t.status = 'pending'`,
      [req.params.tradeId, req.params.leagueId],
    );
    if (!trade) throw new AppError(404, 'Trade not found');
    if (trade.proposing_user_id !== req.user!.id) throw new AppError(403, 'Not the proposing team');

    await db.query(
      `UPDATE trades SET status = 'cancelled' WHERE id = $1`, [trade.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});
