import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { DEFAULT_SCORING_SETTINGS, currentOrNextSeason } from '@fantasy-ufc/shared';
import { generateMatchupsForLeague } from '../services/matchup.service';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { redis } from '../config/redis';

export const leaguesRouter = Router();

leaguesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(3).max(100),
        teamName: z.string().min(1).max(100).default('My Team'),
        description: z.string().max(500).optional(),
        maxTeams: z.number().int().min(2).max(12).default(10),
        isPublic: z.boolean().default(false),
        seasonLengthMonths: z.union([z.literal(4), z.literal(6)]).default(4),
        leagueFormat: z.enum(['pickem', 'staking']).default('pickem'),
        weeklyBudget: z.union([z.literal(100), z.literal(500)]).optional(),
      })
      .parse(req.body);

    if (body.leagueFormat === 'staking' && !body.weeklyBudget) {
      body.weeklyBudget = 100;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const inviteCode = randomBytes(4).toString('hex').toUpperCase();

      const {
        rows: [league],
      } = await client.query(
        `
        INSERT INTO leagues (name, description, commissioner_id, invite_code, max_teams,
          is_public, season_length_months, league_format, weekly_budget)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `,
        [
          body.name,
          body.description ?? null,
          req.user!.id,
          inviteCode,
          body.maxTeams,
          body.isPublic,
          body.seasonLengthMonths,
          body.leagueFormat,
          body.weeklyBudget ?? null,
        ],
      );

      const d = DEFAULT_SCORING_SETTINGS;
      const {
        rows: [ss],
      } = await client.query(
        `
        INSERT INTO scoring_settings (league_id, pts_win, pts_ko_tko, pts_submission, pts_decision)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id
      `,
        [league.id, d.ptsWin, d.ptsKoTko, d.ptsSubmission, d.ptsDecision],
      );

      await client.query(`UPDATE leagues SET scoring_settings_id = $1 WHERE id = $2`, [
        ss.id,
        league.id,
      ]);

      const initialBalance = 0;
      const {
        rows: [member],
      } = await client.query(
        `
        INSERT INTO league_members (league_id, user_id, team_name, staking_balance)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [league.id, req.user!.id, body.teamName, initialBalance],
      );

      await client.query(`INSERT INTO rosters (league_member_id) VALUES ($1)`, [member.id]);

      await client.query('COMMIT');
      res.status(201).json({ ...league, scoringSettingsId: ss.id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

leaguesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(
      `
      SELECT l.*, COUNT(lm2.id) as member_count
      FROM leagues l
      JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = $1
      LEFT JOIN league_members lm2 ON lm2.league_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `,
      [req.user!.id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.get('/:leagueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [membership],
    } = await db.query(`SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!membership) throw new AppError(403, 'Not a member of this league');

    const {
      rows: [league],
    } = await db.query(
      `
      SELECT l.*, COUNT(lm.id) as member_count
      FROM leagues l
      LEFT JOIN league_members lm ON lm.league_id = l.id
      WHERE l.id = $1
      GROUP BY l.id
    `,
      [req.params.leagueId],
    );
    if (!league) throw new AppError(404, 'League not found');
    res.json(league);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.post('/join', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { inviteCode, teamName } = z
      .object({
        inviteCode: z.string().min(1),
        teamName: z.string().min(1).max(100),
      })
      .parse(req.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const {
        rows: [league],
      } = await client.query(`SELECT * FROM leagues WHERE invite_code = $1`, [inviteCode]);
      if (!league) throw new AppError(404, 'Invalid invite code');
      if (league.status !== 'setup')
        throw new AppError(
          400,
          league.status === 'completed'
            ? 'League season is over'
            : 'League draft has already started',
        );

      const {
        rows: [existing],
      } = await client.query(
        `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
        [league.id, req.user!.id],
      );
      if (existing) throw new AppError(409, 'Already in this league');

      const {
        rows: [{ count }],
      } = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM league_members WHERE league_id = $1 AND is_active = true`,
        [league.id],
      );
      if (parseInt(count) >= league.max_teams) throw new AppError(400, 'League is full');

      const initialBalance = 0;
      const {
        rows: [member],
      } = await client.query(
        `
        INSERT INTO league_members (league_id, user_id, team_name, waiver_priority, staking_balance)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `,
        [league.id, req.user!.id, teamName, parseInt(count) + 1, initialBalance],
      );

      await client.query(`INSERT INTO rosters (league_member_id) VALUES ($1)`, [member.id]);

      await client.query('COMMIT');
      res.status(201).json(member);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

leaguesRouter.get('/:leagueId/members', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(
      `
      SELECT lm.*, up.display_name, up.avatar_url
      FROM league_members lm
      JOIN user_profiles up ON up.id = lm.user_id
      WHERE lm.league_id = $1
      ORDER BY lm.wins DESC, lm.total_points DESC
    `,
      [req.params.leagueId],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.patch('/:leagueId/members/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        teamName: z.string().min(1).max(100).optional(),
        avatarColor: z.string().max(20).optional(),
        picksPublic: z.boolean().optional(),
      })
      .parse(req.body);

    const sets: string[] = [];
    const vals: any[] = [];
    if (body.teamName !== undefined) {
      sets.push(`team_name = $${vals.push(body.teamName)}`);
    }
    if (body.avatarColor !== undefined) {
      sets.push(`avatar_color = $${vals.push(body.avatarColor)}`);
    }
    if (body.picksPublic !== undefined) {
      sets.push(`picks_public = $${vals.push(body.picksPublic)}`);
    }
    if (!sets.length) return res.json({});

    vals.push(req.params.leagueId, req.user!.id);
    const {
      rows: [member],
    } = await db.query(
      `UPDATE league_members SET ${sets.join(', ')}
       WHERE league_id = $${vals.length - 1} AND user_id = $${vals.length}
       RETURNING *`,
      vals,
    );
    if (!member) throw new AppError(404, 'Not a member of this league');
    res.json(member);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.delete('/:leagueId/members/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [member],
    } = await db.query(
      `SELECT id, user_id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(404, 'Not a member of this league');

    const {
      rows: [league],
    } = await db.query(`SELECT commissioner_id FROM leagues WHERE id = $1`, [req.params.leagueId]);
    if (league.commissioner_id === req.user!.id) {
      throw new AppError(400, 'Commissioner cannot leave the league');
    }

    await db.query(`DELETE FROM league_members WHERE id = $1`, [member.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

leaguesRouter.patch('/:leagueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        maxTeams: z.number().int().min(2).max(12).optional(),
        rosterSize: z.number().int().min(5).max(20).optional(),
        starterSlots: z.number().int().min(1).max(10).optional(),
        draftPickTimeSeconds: z.number().int().min(30).max(300).optional(),
      })
      .parse(req.body);

    const {
      rows: [league],
    } = await db.query(`SELECT id FROM leagues WHERE id = $1 AND commissioner_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!league) throw new AppError(403, 'Not the commissioner of this league');

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (body.name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(body.name);
    }
    if (body.maxTeams !== undefined) {
      sets.push(`max_teams = $${i++}`);
      vals.push(body.maxTeams);
    }
    if (body.rosterSize !== undefined) {
      sets.push(`roster_size = $${i++}`);
      vals.push(body.rosterSize);
    }
    if (body.starterSlots !== undefined) {
      sets.push(`starter_slots = $${i++}`);
      vals.push(body.starterSlots);
    }
    if (body.draftPickTimeSeconds !== undefined) {
      sets.push(`draft_pick_time_seconds = $${i++}`);
      vals.push(body.draftPickTimeSeconds);
    }
    if (sets.length === 0) throw new AppError(400, 'No fields to update');

    vals.push(req.params.leagueId);
    const {
      rows: [updated],
    } = await db.query(`UPDATE leagues SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.delete('/:leagueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [league],
    } = await db.query(`SELECT id FROM leagues WHERE id = $1 AND commissioner_id = $2`, [
      req.params.leagueId,
      req.user!.id,
    ]);
    if (!league) throw new AppError(403, 'Not the commissioner of this league');
    await db.query(`DELETE FROM leagues WHERE id = $1`, [req.params.leagueId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

leaguesRouter.post('/:leagueId/activate', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [league],
    } = await db.query(
      `SELECT id, commissioner_id, status, season_length_months FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (!league) throw new AppError(404, 'League not found');
    if (league.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    if (league.status !== 'setup') throw new AppError(400, 'League must be in setup to activate');

    const { rows: activeMembers } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND is_active = true`,
      [req.params.leagueId],
    );
    if (activeMembers.length < 2)
      throw new AppError(400, 'Need at least 2 members to start the season');
    if (activeMembers.length % 2 !== 0)
      throw new AppError(
        400,
        `Need an even number of members for head-to-head scheduling (currently ${activeMembers.length})`,
      );

    // Static season calendar: the league joins the current season if enough
    // of it remains, otherwise the next one (Winter / Summer / Fall).
    const now = new Date();
    const season = currentOrNextSeason(now);
    const seasonEndsAt = season.regularEndsAt;
    const regStart = now > season.startsAt ? now : season.startsAt;

    const { rows: regularEvents } = await db.query(
      `
      SELECT id FROM ufc_events
      WHERE scheduled_at >= $1 AND scheduled_at <= $2 AND status != 'cancelled'
      ORDER BY scheduled_at ASC
    `,
      [regStart.toISOString(), seasonEndsAt.toISOString()],
    );

    if (regularEvents.length === 0) {
      throw new AppError(
        400,
        `No UFC events are announced yet for the ${season.label} season (starts ${season.startsAt.toISOString().slice(0, 10)}). Try again closer to the season.`,
      );
    }

    // Playoffs: semis = the event right before the finals; finals = the PPV
    // nearest the season's anchor date. UFC announces events ~2 months out,
    // so these may not exist yet — eventSync assigns them later when they do.
    let semisEventId: string | null = null;
    let finalsEventId: string | null = null;
    const { rows: postSeason } = await db.query<{ id: string; name: string; scheduled_at: string }>(
      `
      SELECT id, name, scheduled_at FROM ufc_events
      WHERE scheduled_at > $1 AND scheduled_at <= $2 AND status != 'cancelled'
      ORDER BY scheduled_at ASC
    `,
      [seasonEndsAt.toISOString(), new Date(seasonEndsAt.getTime() + 45 * 86400_000).toISOString()],
    );

    if (postSeason.length >= 2) {
      const ppvs = postSeason.filter((e, i) => i >= 1 && !/^UFC Fight Night/i.test(e.name));
      const finals = ppvs.length
        ? ppvs.reduce((a, b) =>
            Math.abs(new Date(a.scheduled_at).getTime() - season.finalsTarget.getTime()) <=
            Math.abs(new Date(b.scheduled_at).getTime() - season.finalsTarget.getTime())
              ? a
              : b,
          )
        : postSeason[1];
      const finalsIdx = postSeason.findIndex((e) => e.id === finals.id);
      semisEventId = postSeason[finalsIdx - 1].id;
      finalsEventId = finals.id;
    }

    // Add all events to league schedule (regular season + any known playoff events)
    const allEventIds = [
      ...regularEvents.map((e: any) => e.id),
      semisEventId,
      finalsEventId,
    ].filter((id): id is string => id != null);
    for (const eventId of allEventIds) {
      await db.query(
        `INSERT INTO league_events (league_id, event_id, is_scoring) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
        [req.params.leagueId, eventId],
      );
    }

    // Generate round-robin matchups for regular season
    await generateMatchupsForLeague(req.params.leagueId);

    // For staking leagues, initialize matchup scores to weekly_budget (no bets placed yet)
    await db.query(
      `
      UPDATE matchups m
      SET home_score = l.weekly_budget,
          away_score = l.weekly_budget
      FROM leagues l
      WHERE m.league_id = l.id
        AND m.league_id = $1
        AND l.league_format = 'staking'
        AND m.home_score = 0
        AND m.away_score = 0
        AND m.winner_id IS NULL
    `,
      [req.params.leagueId],
    );

    // Activate and store playoff event IDs (may be null until UFC announces them)
    await db.query(
      `
      UPDATE leagues SET
        status = 'active',
        season_ends_at = $1,
        season_year = $2,
        playoff_semis_event_id = $3,
        playoff_finals_event_id = $4,
        bmf_belt_holder_id = (SELECT id FROM league_members WHERE league_id = $5 ORDER BY joined_at DESC LIMIT 1)
      WHERE id = $5
    `,
      [seasonEndsAt.toISOString(), season.year, semisEventId, finalsEventId, req.params.leagueId],
    );

    const {
      rows: [updated],
    } = await db.query(`SELECT * FROM leagues WHERE id = $1`, [req.params.leagueId]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.post('/:leagueId/new-season', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      rows: [league],
    } = await db.query(`SELECT id, commissioner_id, status FROM leagues WHERE id = $1`, [
      req.params.leagueId,
    ]);
    if (!league) throw new AppError(404, 'League not found');
    if (league.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    if (league.status !== 'completed')
      throw new AppError(400, 'League must be completed to start a new season');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
        UPDATE league_members SET
          wins = 0, losses = 0, ties = 0, total_points = 0,
          streak = 0, is_champion = false, draft_position = NULL,
          staking_balance = 0
        WHERE league_id = $1
      `,
        [req.params.leagueId],
      );

      await client.query(`DELETE FROM matchups WHERE league_id = $1`, [req.params.leagueId]);
      await client.query(`DELETE FROM league_events WHERE league_id = $1`, [req.params.leagueId]);
      await client.query(`DELETE FROM event_picks WHERE league_id = $1`, [req.params.leagueId]);
      await client.query(`DELETE FROM event_champion_picks WHERE league_id = $1`, [
        req.params.leagueId,
      ]);
      await client.query(`DELETE FROM perfect_card_bonuses WHERE league_id = $1`, [
        req.params.leagueId,
      ]);
      await client.query(`DELETE FROM roster_win_bonuses WHERE league_id = $1`, [
        req.params.leagueId,
      ]);
      await client.query(
        `
        DELETE FROM rosters
        WHERE league_member_id IN (SELECT id FROM league_members WHERE league_id = $1)
      `,
        [req.params.leagueId],
      );
      await client.query(`DELETE FROM draft_sessions WHERE league_id = $1`, [req.params.leagueId]);
      await client.query(`DELETE FROM staking_singles WHERE league_id = $1`, [req.params.leagueId]);
      await client.query(`DELETE FROM staking_parlays WHERE league_id = $1`, [req.params.leagueId]);

      await client.query(
        `
        UPDATE leagues SET
          status = 'setup',
          season_year = season_year + 1,
          bmf_belt_holder_id = NULL,
          completed_at = NULL,
          season_ends_at = NULL,
          playoff_semis_event_id = NULL,
          playoff_finals_event_id = NULL
        WHERE id = $1
      `,
        [req.params.leagueId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await redis.del(`standings:${req.params.leagueId}`);

    const {
      rows: [updated],
    } = await db.query(`SELECT * FROM leagues WHERE id = $1`, [req.params.leagueId]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

leaguesRouter.get(
  '/:leagueId/scoring-settings',
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      const {
        rows: [ss],
      } = await db.query(`SELECT * FROM scoring_settings WHERE league_id = $1`, [
        req.params.leagueId,
      ]);
      if (!ss) throw new AppError(404, 'Scoring settings not found');
      res.json(ss);
    } catch (err) {
      next(err);
    }
  },
);
