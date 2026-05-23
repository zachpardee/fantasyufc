import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { generateMatchupsForLeague } from '../services/matchup.service';
import { seasonWindow } from '../jobs/autoSchedule.job';
import { z } from 'zod';

export const scheduleRouter = Router({ mergeParams: true });

// Last 3 completed UFC events (for display context — regardless of league schedule)
scheduleRouter.get('/recent-past', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT e.id, e.name, e.short_name, e.scheduled_at, e.status,
             e.venue, e.location,
             COUNT(f.id)::int AS fight_count
      FROM ufc_events e
      LEFT JOIN fights f ON f.event_id = e.id
      WHERE e.status = 'completed' AND e.is_scoring_event = true
      GROUP BY e.id
      ORDER BY e.scheduled_at DESC
      LIMIT 3
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// List UFC events available to add to a league's schedule
scheduleRouter.get('/available', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT e.id, e.name, e.short_name, e.scheduled_at, e.status,
             e.venue, e.location,
             COUNT(f.id) as fight_count,
             EXISTS(
               SELECT 1 FROM league_events le
               WHERE le.league_id = $1 AND le.event_id = e.id
             ) as is_added
      FROM ufc_events e
      LEFT JOIN fights f ON f.event_id = e.id
      WHERE e.status != 'cancelled' AND e.is_scoring_event = true
        AND e.scheduled_at > NOW() - INTERVAL '7 days'
      GROUP BY e.id
      ORDER BY e.scheduled_at ASC
      LIMIT 30
    `, [req.params.leagueId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Get events currently on this league's schedule
scheduleRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT e.id, e.name, e.short_name, e.scheduled_at, e.status,
             e.venue, e.location, le.is_scoring,
             COUNT(f.id) as fight_count,
             COUNT(m.id) as matchup_count
      FROM league_events le
      JOIN ufc_events e ON e.id = le.event_id
      LEFT JOIN fights f ON f.event_id = e.id
      LEFT JOIN matchups m ON m.event_id = e.id AND m.league_id = $1
      WHERE le.league_id = $1
      GROUP BY e.id, le.is_scoring
      ORDER BY e.scheduled_at ASC
    `, [req.params.leagueId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Add an event to a league's schedule and (re)generate matchups
scheduleRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { eventId, isScoring = true } = z.object({
      eventId: z.string().uuid(),
      isScoring: z.boolean().default(true),
    }).parse(req.body);

    // Only commissioner can modify schedule
    const { rows: [league] } = await db.query(
      `SELECT commissioner_id, status, season_year FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (!league) throw new AppError(404, 'League not found');
    if (league.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    if (league.status === 'completed') throw new AppError(400, 'Season is over');

    // Verify the event exists
    const { rows: [event] } = await db.query(
      `SELECT id, name, scheduled_at FROM ufc_events WHERE id = $1 AND status != 'cancelled'`,
      [eventId],
    );
    if (!event) throw new AppError(404, 'Event not found or cancelled');

    // Enforce season window: Jan 1 – Jun 30
    const { start, end } = seasonWindow(league.season_year);
    const eventDate = new Date(event.scheduled_at);
    if (eventDate < start || eventDate > end) {
      throw new AppError(400, `Events must fall within the season window (Jan 1 – Jun 30 ${league.season_year})`);
    }

    await db.query(`
      INSERT INTO league_events (league_id, event_id, is_scoring)
      VALUES ($1, $2, $3)
      ON CONFLICT (league_id, event_id) DO UPDATE SET is_scoring = EXCLUDED.is_scoring
    `, [req.params.leagueId, eventId, isScoring]);

    // Only generate matchups if the league has members with draft positions (post-draft)
    if (league.status === 'active') {
      const result = await generateMatchupsForLeague(req.params.leagueId);
      res.status(201).json({ ok: true, event, matchupsGenerated: result });
    } else {
      res.status(201).json({ ok: true, event, matchupsGenerated: null, note: 'Matchups will generate after draft completes' });
    }
  } catch (err) { next(err); }
});

// Remove an event from a league's schedule
scheduleRouter.delete('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT commissioner_id FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (league?.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');

    // Don't allow removing events that already have scores
    const { rows: [hasScores] } = await db.query(`
      SELECT 1 FROM matchups m
      WHERE m.league_id = $1 AND m.event_id = $2
        AND (m.home_score > 0 OR m.away_score > 0)
      LIMIT 1
    `, [req.params.leagueId, req.params.eventId]);

    if (hasScores) throw new AppError(400, 'Cannot remove an event that already has scoring activity');

    await db.query(
      `DELETE FROM league_events WHERE league_id = $1 AND event_id = $2`,
      [req.params.leagueId, req.params.eventId],
    );

    // Regenerate matchup schedule without this event
    const { rows: [{ status }] } = await db.query(`SELECT status FROM leagues WHERE id = $1`, [req.params.leagueId]);
    if (status === 'active') {
      await generateMatchupsForLeague(req.params.leagueId).catch(() => {}); // Best-effort
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Manually trigger matchup regeneration (commissioner)
scheduleRouter.post('/regenerate-matchups', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT commissioner_id, status FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (league?.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    if (league.status !== 'active') throw new AppError(400, 'League must be active to generate matchups');

    const result = await generateMatchupsForLeague(req.params.leagueId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});
