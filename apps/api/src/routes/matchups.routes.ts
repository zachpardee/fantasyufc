import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { redis, CACHE_TTL } from '../config/redis';

export const matchupsRouter = Router({ mergeParams: true });

// All UFC events from season start (for chip strip — includes events with no matchup)
matchupsRouter.get('/season-events', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');

    const { rows } = await db.query(`
      SELECT DISTINCT e.id as event_id, e.name as event_name, e.scheduled_at, e.status as event_status
      FROM ufc_events e
      JOIN leagues l ON l.id = $1
      WHERE e.status != 'cancelled'
        AND (
          -- Events explicitly in this league's schedule
          EXISTS (SELECT 1 FROM league_events le WHERE le.event_id = e.id AND le.league_id = $1)
          -- Always include playoff events even if not yet in league_events
          OR e.id = l.playoff_semis_event_id
          OR e.id = l.playoff_finals_event_id
          OR (
            -- New regular-season events within the season window not yet enrolled (sync gap)
            l.status IN ('active', 'playoffs')
            AND e.scheduled_at < COALESCE(
              (SELECT e2.scheduled_at FROM ufc_events e2 WHERE e2.id = l.playoff_semis_event_id),
              l.season_ends_at
            )
            AND e.scheduled_at >= (
              -- Season start: 6 months before semis target for 6-month leagues,
              -- otherwise the earliest event already in league_events
              CASE WHEN l.season_length_months = 6 AND l.playoff_semis_event_id IS NOT NULL
                THEN (SELECT e2.scheduled_at FROM ufc_events e2 WHERE e2.id = l.playoff_semis_event_id)
                       - INTERVAL '6 months'
                WHEN l.season_length_months = 6 AND l.season_ends_at IS NOT NULL
                THEN l.season_ends_at - INTERVAL '6 months'
                ELSE (
                  SELECT MIN(e2.scheduled_at) FROM ufc_events e2
                  JOIN league_events le ON le.event_id = e2.id AND le.league_id = $1
                  WHERE e2.id != l.playoff_semis_event_id AND e2.id != l.playoff_finals_event_id
                )
              END
            )
          )
        )
      ORDER BY e.scheduled_at DESC
    `, [req.params.leagueId]);
    res.json(rows);
  } catch (err) { next(err); }
});

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

    // Priority: 1) live event, 2) most recently completed, 3) next scheduled
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
        AND e.status = 'live'
      ORDER BY e.scheduled_at ASC
      LIMIT 1
    `, [req.params.leagueId, member.id]);

    if (!matchup) {
      // Next scheduled matchup (upcoming event — preferred over completed for pick-making)
      const { rows: [upcoming] } = await db.query(`
        SELECT m.*,
          e.name as event_name, e.scheduled_at, e.status as event_status,
          ht.team_name as home_team_name, at2.team_name as away_team_name
        FROM matchups m
        JOIN ufc_events e ON e.id = m.event_id
        JOIN league_members ht ON ht.id = m.home_team_id
        JOIN league_members at2 ON at2.id = m.away_team_id
        WHERE m.league_id = $1
          AND (m.home_team_id = $2 OR m.away_team_id = $2)
          AND e.status = 'scheduled'
        ORDER BY e.scheduled_at ASC
        LIMIT 1
      `, [req.params.leagueId, member.id]);
      matchup = upcoming ?? null;
    }

    if (!matchup) {
      // Fall back to most recently completed matchup
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
          AND e.status = 'completed'
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

    res.json(matchup);
  } catch (err) { next(err); }
});
