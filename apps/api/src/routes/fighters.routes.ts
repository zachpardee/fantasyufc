import { Router } from 'express';
import { db } from '../config/database';
import { redis, CACHE_TTL } from '../config/redis';
import { AppError } from '../middleware/error.middleware';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';

export const fightersRouter = Router();

fightersRouter.get('/', async (req, res, next) => {
  try {
    const { weightClass, status = 'active', search, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const cacheKey = `fighters:${weightClass ?? 'all'}:${status}:${search ?? ''}:${limit}:${offset}`;
    const cached = await redis.get(cacheKey);
    if (cached) { res.json(JSON.parse(cached)); return; }

    const params: unknown[] = [status];
    let query = `
      SELECT f.*, wc.name as weight_class_name, wc.slug as weight_class_slug
      FROM fighters f
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      WHERE f.status = $1
    `;

    if (weightClass) {
      params.push(weightClass);
      query += ` AND wc.slug = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (f.first_name || ' ' || f.last_name) ILIKE $${params.length}`;
    }

    query += ` ORDER BY f.ranking ASC NULLS LAST, f.average_fantasy_points DESC NULLS LAST`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await db.query(query, params);
    await redis.setex(cacheKey, CACHE_TTL.FIGHTERS_ALL, JSON.stringify(rows));
    res.json(rows);
  } catch (err) { next(err); }
});

fightersRouter.get('/:fighterId', async (req, res, next) => {
  try {
    const { rows: [fighter] } = await db.query(`
      SELECT f.*, wc.name as weight_class_name, wc.slug as weight_class_slug,
        (SELECT COUNT(*)::int FROM fight_results fr WHERE fr.winner_id = f.id AND fr.outcome = 'ko_tko') AS ko_tko_wins,
        (SELECT COUNT(*)::int FROM fight_results fr WHERE fr.winner_id = f.id AND fr.outcome = 'submission') AS submission_wins
      FROM fighters f
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      WHERE f.id = $1
    `, [req.params.fighterId]);
    if (!fighter) throw new AppError(404, 'Fighter not found');
    res.json(fighter);
  } catch (err) { next(err); }
});

fightersRouter.get('/:fighterId/history', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        f.id as fight_id, e.name as event_name, e.scheduled_at,
        f.is_title_fight, wc.name as weight_class_name,
        fr.outcome, fr.ending_round, fr.ending_time_seconds,
        fr.winner_id,
        fr.winner_id = $1 as is_win
      FROM fights f
      JOIN ufc_events e ON e.id = f.event_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      LEFT JOIN fight_results fr ON fr.fight_id = f.id
      WHERE f.red_fighter_id = $1 OR f.blue_fighter_id = $1
      ORDER BY e.scheduled_at DESC
      LIMIT 20
    `, [req.params.fighterId]);
    res.json(rows);
  } catch (err) { next(err); }
});

fightersRouter.get('/:fighterId/live-stats', async (req, res, next) => {
  try {
    const { rows: [fighter] } = await db.query(
      `SELECT ufc_fighter_id FROM fighters WHERE id = $1`,
      [req.params.fighterId],
    );
    if (!fighter?.ufc_fighter_id) { res.json({}); return; }

    const espnId = fighter.ufc_fighter_id;
    const baseUrl = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/athletes/${espnId}`;

    const [athleteRes, recordsRes] = await Promise.all([
      fetch(baseUrl),
      fetch(`${baseUrl}/records`),
    ]);

    const [athleteData, recordsData]: [any, any] = await Promise.all([
      athleteRes.ok ? athleteRes.json() : {},
      recordsRes.ok ? recordsRes.json() : {},
    ]);

    // Pull team and stance from athlete endpoint
    const team: string | null = athleteData?.association?.name ?? null;
    const stance: string | null = athleteData?.stance?.text ?? null;

    // Pull career stats from records endpoint
    // recordsData.items is an array of category objects; find the career totals
    const items: any[] = recordsData?.items ?? [];
    const career = items.find((it: any) => it.type === 'total') ?? items[0] ?? {};
    const stats: Record<string, number> = {};
    for (const stat of (career.stats ?? [])) {
      if (stat.name) stats[stat.name] = stat.value ?? 0;
    }

    res.json({
      team,
      stance,
      wins: stats.wins ?? null,
      losses: stats.losses ?? null,
      draws: stats.draws ?? null,
      koTkoWins: stats.tkos ?? null,
      koTkoLosses: stats.tkoLosses ?? null,
      submissionWins: stats.submissions ?? null,
      submissionLosses: stats.submissionLosses ?? null,
    });
  } catch (err) { next(err); }
});

fightersRouter.get('/leagues/:leagueId/free-agents', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const cacheKey = `free-agents:${req.params.leagueId}`;
    const cached = await redis.get(cacheKey);
    if (cached) { res.json(JSON.parse(cached)); return; }

    const { rows } = await db.query(`
      SELECT f.*, wc.name as weight_class_name
      FROM fighters f
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      WHERE f.status = 'active'
        AND f.id NOT IN (
          SELECT rf.fighter_id
          FROM roster_fighters rf
          JOIN rosters r ON r.id = rf.roster_id
          JOIN league_members lm ON lm.id = r.league_member_id
          WHERE lm.league_id = $1
        )
      ORDER BY f.ranking ASC NULLS LAST, f.average_fantasy_points DESC NULLS LAST
    `, [req.params.leagueId]);

    await redis.setex(cacheKey, CACHE_TTL.FREE_AGENTS, JSON.stringify(rows));
    res.json(rows);
  } catch (err) { next(err); }
});
