import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { redis, CACHE_TTL } from '../config/redis';

export const matchupsRouter = Router({ mergeParams: true });

matchupsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows } = await db.query(`
      SELECT m.*,
        e.name as event_name, e.scheduled_at, e.status as event_status,
        ht.team_name as home_team_name, at2.team_name as away_team_name,
        hup.username as home_username, aup.username as away_username
      FROM matchups m
      JOIN ufc_events e ON e.id = m.event_id
      JOIN league_members ht ON ht.id = m.home_team_id
      JOIN league_members at2 ON at2.id = m.away_team_id
      JOIN user_profiles hup ON hup.id = ht.user_id
      JOIN user_profiles aup ON aup.id = at2.user_id
      WHERE m.league_id = $1
      ORDER BY e.scheduled_at DESC
    `, [req.params.leagueId]);
    res.json(rows);
  } catch (err) { next(err); }
});

matchupsRouter.get('/current', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    // Prefer an active (scheduled/live) matchup; fall back to most recent completed
    let { rows: [matchup] } = await db.query(`
      SELECT m.*,
        e.name as event_name, e.scheduled_at, e.status as event_status,
        ht.team_name as home_team_name, at2.team_name as away_team_name
      FROM matchups m
      JOIN ufc_events e ON e.id = m.event_id
      JOIN league_members ht ON ht.id = m.home_team_id
      JOIN league_members at2 ON at2.id = m.away_team_id
      WHERE m.league_id = $1
        AND (m.home_team_id = $2 OR m.away_team_id = $2)
        AND e.status IN ('scheduled', 'live')
      ORDER BY e.scheduled_at ASC
      LIMIT 1
    `, [req.params.leagueId, member.id]);

    if (!matchup) {
      const { rows: [recent] } = await db.query(`
        SELECT m.*,
          e.name as event_name, e.scheduled_at, e.status as event_status,
          ht.team_name as home_team_name, at2.team_name as away_team_name
        FROM matchups m
        JOIN ufc_events e ON e.id = m.event_id
        JOIN league_members ht ON ht.id = m.home_team_id
        JOIN league_members at2 ON at2.id = m.away_team_id
        WHERE m.league_id = $1
          AND (m.home_team_id = $2 OR m.away_team_id = $2)
        ORDER BY e.scheduled_at DESC
        LIMIT 1
      `, [req.params.leagueId, member.id]);
      matchup = recent ?? null;
    }

    if (!matchup) { res.json(null); return; }
    res.json(matchup);
  } catch (err) { next(err); }
});

// /standings must be before /:matchupId to avoid Express matching 'standings' as a param
matchupsRouter.get('/standings', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const cacheKey = `standings:${req.params.leagueId}`;
    const cached = await redis.get(cacheKey);
    if (cached) { res.json(JSON.parse(cached)); return; }

    const { rows } = await db.query(`
      SELECT lm.*, up.username, up.display_name, up.avatar_url
      FROM league_members lm
      JOIN user_profiles up ON up.id = lm.user_id
      WHERE lm.league_id = $1 AND lm.is_active = true
      ORDER BY lm.total_points DESC, lm.wins DESC
    `, [req.params.leagueId]);

    await redis.setex(cacheKey, CACHE_TTL.STANDINGS, JSON.stringify(rows));
    res.json(rows);
  } catch (err) { next(err); }
});

matchupsRouter.get('/:matchupId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows: [matchup] } = await db.query(`
      SELECT m.*, e.name as event_name, e.scheduled_at, e.status as event_status,
        e.venue, e.location,
        ht.team_name as home_team_name, at2.team_name as away_team_name,
        (
          SELECT COALESCE(SUM(CASE WHEN m2.home_team_id = ht.id THEN m2.home_score
                                   WHEN m2.away_team_id = ht.id THEN m2.away_score
                                   ELSE 0 END), 0)
          FROM matchups m2
          WHERE m2.league_id = m.league_id
            AND (m2.home_team_id = ht.id OR m2.away_team_id = ht.id)
            AND (m2.home_score > 0 OR m2.away_score > 0)
        ) AS home_season_points,
        (
          SELECT COALESCE(SUM(CASE WHEN m2.home_team_id = at2.id THEN m2.home_score
                                   WHEN m2.away_team_id = at2.id THEN m2.away_score
                                   ELSE 0 END), 0)
          FROM matchups m2
          WHERE m2.league_id = m.league_id
            AND (m2.home_team_id = at2.id OR m2.away_team_id = at2.id)
            AND (m2.home_score > 0 OR m2.away_score > 0)
        ) AS away_season_points
      FROM matchups m
      JOIN ufc_events e ON e.id = m.event_id
      JOIN league_members ht ON ht.id = m.home_team_id
      JOIN league_members at2 ON at2.id = m.away_team_id
      WHERE m.id = $1 AND m.league_id = $2
    `, [req.params.matchupId, req.params.leagueId]);
    if (!matchup) throw new AppError(404, 'Matchup not found');

    // Per-fighter scores for both teams
    const { rows: scores } = await db.query(`
      SELECT ms.fighter_id, ms.is_starter, ms.total_points,
             ms.pts_win, ms.pts_finish, ms.pts_round_bonus,
             ms.pts_sig_strikes, ms.pts_knockdowns, ms.pts_takedowns,
             ms.pts_submissions, ms.pts_bonuses, ms.title_multiplier,
             f.first_name, f.last_name, f.ranking, f.is_champion,
             wc.name AS weight_class_name,
             lm.id AS team_id
      FROM matchup_scores ms
      JOIN fighters f ON f.id = ms.fighter_id
      JOIN weight_classes wc ON wc.id = f.weight_class_id
      JOIN roster_fighters rf ON rf.id = ms.roster_fighter_id
      JOIN rosters r ON r.id = rf.roster_id
      JOIN league_members lm ON lm.id = r.league_member_id
      WHERE ms.matchup_id = $1
      ORDER BY ms.total_points DESC
    `, [req.params.matchupId]);

    res.json({ ...matchup, scores });
  } catch (err) { next(err); }
});
