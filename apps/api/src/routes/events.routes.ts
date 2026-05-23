import { Router } from 'express';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { processFightResult } from '../services/scoring.service';
import { z } from 'zod';

function requireAdmin(req: AuthRequest, _res: any, next: any) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').filter(Boolean);
  if (!adminIds.includes(req.user!.id)) return next(new AppError(403, 'Admin only'));
  next();
}

export const eventsRouter = Router();

eventsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT e.*, COUNT(f.id) as fight_count
      FROM ufc_events e
      LEFT JOIN fights f ON f.event_id = e.id
      GROUP BY e.id
      ORDER BY e.scheduled_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

eventsRouter.get('/:eventId', async (req, res, next) => {
  try {
    const { rows: [event] } = await db.query(
      `SELECT * FROM ufc_events WHERE id = $1`, [req.params.eventId],
    );
    if (!event) throw new AppError(404, 'Event not found');
    res.json(event);
  } catch (err) { next(err); }
});

eventsRouter.get('/:eventId/fights', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT f.*,
        rf.first_name as red_first_name, rf.last_name as red_last_name,
        rf.nickname as red_nickname, rf.image_url as red_image_url,
        bf.first_name as blue_first_name, bf.last_name as blue_last_name,
        bf.nickname as blue_nickname, bf.image_url as blue_image_url,
        wc.name as weight_class_name
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      WHERE f.event_id = $1
      ORDER BY f.bout_order ASC
    `, [req.params.eventId]);
    res.json(rows);
  } catch (err) { next(err); }
});

eventsRouter.get('/:eventId/results', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT fr.*, f.red_fighter_id, f.blue_fighter_id, f.is_title_fight, f.card_segment
      FROM fight_results fr
      JOIN fights f ON f.id = fr.fight_id
      WHERE f.event_id = $1
    `, [req.params.eventId]);
    res.json(rows);
  } catch (err) { next(err); }
});

eventsRouter.post('/admin/:eventId/results', requireAuth, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      fightId: z.string().uuid(),
      winnerId: z.string().uuid().optional(),
      winnerSide: z.enum(['red', 'blue']).optional(),
      outcome: z.enum(['ko_tko','submission','decision_unanimous','decision_split','decision_majority','no_contest','disqualification','draw']),
      endingRound: z.number().int().min(1).max(5),
      endingTimeSeconds: z.number().int().min(0).max(300),
      winnerStats: z.object({
        sigStrikesLanded: z.number().optional(),
        sigStrikesAttempted: z.number().optional(),
        totalStrikesLanded: z.number().optional(),
        takedownsLanded: z.number().optional(),
        takedownsAttempted: z.number().optional(),
        submissionAttempts: z.number().optional(),
        knockdowns: z.number().optional(),
      }).optional(),
      loserStats: z.object({
        sigStrikesLanded: z.number().optional(),
        sigStrikesAttempted: z.number().optional(),
        totalStrikesLanded: z.number().optional(),
        takedownsLanded: z.number().optional(),
        takedownsAttempted: z.number().optional(),
        submissionAttempts: z.number().optional(),
        knockdowns: z.number().optional(),
      }).optional(),
      performanceOfNight: z.boolean().default(false),
      fightOfNight: z.boolean().default(false),
    }).parse(req.body);

    const { rows: [fr] } = await db.query(`
      INSERT INTO fight_results (
        fight_id, winner_id, winner_side, outcome, ending_round, ending_time_seconds,
        winner_sig_strikes_landed, winner_sig_strikes_attempted, winner_total_strikes_landed,
        winner_takedowns_landed, winner_takedowns_attempted, winner_submission_attempts, winner_knockdowns,
        loser_sig_strikes_landed, loser_sig_strikes_attempted, loser_total_strikes_landed,
        loser_takedowns_landed, loser_takedowns_attempted, loser_submission_attempts, loser_knockdowns,
        performance_of_night, fight_of_night
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (fight_id) DO UPDATE SET
        winner_id=$2, outcome=$4, ending_round=$5, performance_of_night=$21, fight_of_night=$22
      RETURNING id
    `, [
      body.fightId, body.winnerId ?? null, body.winnerSide ?? null, body.outcome,
      body.endingRound, body.endingTimeSeconds,
      body.winnerStats?.sigStrikesLanded, body.winnerStats?.sigStrikesAttempted,
      body.winnerStats?.totalStrikesLanded, body.winnerStats?.takedownsLanded,
      body.winnerStats?.takedownsAttempted, body.winnerStats?.submissionAttempts,
      body.winnerStats?.knockdowns,
      body.loserStats?.sigStrikesLanded, body.loserStats?.sigStrikesAttempted,
      body.loserStats?.totalStrikesLanded, body.loserStats?.takedownsLanded,
      body.loserStats?.takedownsAttempted, body.loserStats?.submissionAttempts,
      body.loserStats?.knockdowns,
      body.performanceOfNight, body.fightOfNight,
    ]);

    await db.query(`UPDATE fights SET status = 'completed' WHERE id = $1`, [body.fightId]);
    await processFightResult(fr.id);

    res.status(201).json({ ok: true, fightResultId: fr.id });
  } catch (err) { next(err); }
});
