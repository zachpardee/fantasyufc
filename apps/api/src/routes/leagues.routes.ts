import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { DEFAULT_SCORING_SETTINGS } from '@fantasy-ufc/shared';
import { z } from 'zod';
import { randomBytes } from 'crypto';

export const leaguesRouter = Router();

leaguesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(3).max(100),
      teamName: z.string().min(1).max(100).default('My Team'),
      description: z.string().max(500).optional(),
      maxTeams: z.number().int().min(2).max(20).default(10),
      rosterSize: z.number().int().min(5).max(20).default(10),
      starterSlots: z.number().int().min(1).max(10).default(5),
      draftType: z.enum(['snake', 'auction']).default('snake'),
      isPublic: z.boolean().default(false),
      draftPickTimeSeconds: z.number().int().min(30).max(300).default(90),
    }).parse(req.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const inviteCode = randomBytes(4).toString('hex').toUpperCase();

      const { rows: [league] } = await client.query(`
        INSERT INTO leagues (name, description, commissioner_id, invite_code, max_teams,
          roster_size, starter_slots, bench_slots, draft_type, is_public,
          draft_pick_time_seconds)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `, [body.name, body.description ?? null, req.user!.id, inviteCode,
          body.maxTeams, body.rosterSize, body.starterSlots,
          body.rosterSize - body.starterSlots, body.draftType, body.isPublic,
          body.draftPickTimeSeconds]);

      const d = DEFAULT_SCORING_SETTINGS;
      const { rows: [ss] } = await client.query(`
        INSERT INTO scoring_settings (league_id, pts_win, pts_ko_tko, pts_submission, pts_decision,
          pts_draw, pts_no_contest, pts_finish_rd1, pts_finish_rd2, pts_finish_rd3, pts_finish_rd4,
          pts_finish_rd5, pts_knockdown, pts_sig_strike_landed, pts_sig_strike_attempted,
          pts_total_strike_landed, pts_takedown_landed, pts_takedown_attempted,
          pts_submission_attempt, pts_performance_of_night, pts_fight_of_night,
          pts_loss, pts_ko_loss_penalty, title_fight_multiplier)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        RETURNING id
      `, [
        league.id,
        d.ptsWin, d.ptsKoTko, d.ptsSubmission, d.ptsDecision,
        d.ptsDraw, d.ptsNoContest, d.ptsFinishRd1, d.ptsFinishRd2, d.ptsFinishRd3, d.ptsFinishRd4,
        d.ptsFinishRd5, d.ptsKnockdown, d.ptsSigStrikeLanded, d.ptsSigStrikeAttempted,
        d.ptsTotalStrikeLanded, d.ptsTakedownLanded, d.ptsTakedownAttempted,
        d.ptsSubmissionAttempt, d.ptsPerformanceOfNight, d.ptsFightOfNight,
        d.ptsLoss, d.ptsKoLossPenalty, d.titleFightMultiplier,
      ]);

      await client.query(
        `UPDATE leagues SET scoring_settings_id = $1 WHERE id = $2`,
        [ss.id, league.id],
      );

      const { rows: [member] } = await client.query(`
        INSERT INTO league_members (league_id, user_id, team_name)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [league.id, req.user!.id, body.teamName]);

      await client.query(
        `INSERT INTO rosters (league_member_id) VALUES ($1)`,
        [member.id],
      );

      await client.query('COMMIT');
      res.status(201).json({ ...league, scoringSettingsId: ss.id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

leaguesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT l.*, COUNT(lm2.id) as member_count
      FROM leagues l
      JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = $1
      LEFT JOIN league_members lm2 ON lm2.league_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `, [req.user!.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

leaguesRouter.get('/:leagueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [membership] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!membership) throw new AppError(403, 'Not a member of this league');

    const { rows: [league] } = await db.query(`
      SELECT l.*, COUNT(lm.id) as member_count
      FROM leagues l
      LEFT JOIN league_members lm ON lm.league_id = l.id
      WHERE l.id = $1
      GROUP BY l.id
    `, [req.params.leagueId]);
    if (!league) throw new AppError(404, 'League not found');
    res.json(league);
  } catch (err) { next(err); }
});

leaguesRouter.post('/join', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { inviteCode, teamName } = z.object({
      inviteCode: z.string().min(1),
      teamName: z.string().min(1).max(100),
    }).parse(req.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: [league] } = await client.query(
        `SELECT * FROM leagues WHERE invite_code = $1`, [inviteCode],
      );
      if (!league) throw new AppError(404, 'Invalid invite code');
      if (league.status !== 'setup') throw new AppError(400,
        league.status === 'completed' ? 'League season is over' : 'League draft has already started',
      );

      const { rows: [existing] } = await client.query(
        `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
        [league.id, req.user!.id],
      );
      if (existing) throw new AppError(409, 'Already in this league');

      const { rows: [{ count }] } = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM league_members WHERE league_id = $1 AND is_active = true`,
        [league.id],
      );
      if (parseInt(count) >= league.max_teams) throw new AppError(400, 'League is full');

      const { rows: [member] } = await client.query(`
        INSERT INTO league_members (league_id, user_id, team_name, waiver_priority)
        VALUES ($1, $2, $3, $4) RETURNING *
      `, [league.id, req.user!.id, teamName, parseInt(count) + 1]);

      await client.query(`INSERT INTO rosters (league_member_id) VALUES ($1)`, [member.id]);

      await client.query('COMMIT');
      res.status(201).json(member);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

leaguesRouter.get('/:leagueId/members', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT lm.*, up.username, up.display_name, up.avatar_url
      FROM league_members lm
      JOIN user_profiles up ON up.id = lm.user_id
      WHERE lm.league_id = $1
      ORDER BY lm.wins DESC, lm.total_points DESC
    `, [req.params.leagueId]);
    res.json(rows);
  } catch (err) { next(err); }
});

leaguesRouter.patch('/:leagueId/members/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { teamName } = z.object({ teamName: z.string().min(1).max(100) }).parse(req.body);
    const { rows: [member] } = await db.query(
      `UPDATE league_members SET team_name = $1
       WHERE league_id = $2 AND user_id = $3
       RETURNING *`,
      [teamName, req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(404, 'Not a member of this league');
    res.json(member);
  } catch (err) { next(err); }
});

leaguesRouter.patch('/:leagueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      maxTeams: z.number().int().min(2).max(20).optional(),
      rosterSize: z.number().int().min(5).max(20).optional(),
      starterSlots: z.number().int().min(1).max(10).optional(),
      tradeDeadlineDays: z.number().int().min(0).max(14).optional(),
      draftPickTimeSeconds: z.number().int().min(30).max(300).optional(),
    }).parse(req.body);

    const { rows: [league] } = await db.query(
      `SELECT id FROM leagues WHERE id = $1 AND commissioner_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!league) throw new AppError(403, 'Not the commissioner of this league');

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (body.name !== undefined)               { sets.push(`name = $${i++}`);                  vals.push(body.name); }
    if (body.maxTeams !== undefined)           { sets.push(`max_teams = $${i++}`);             vals.push(body.maxTeams); }
    if (body.rosterSize !== undefined)         { sets.push(`roster_size = $${i++}`);           vals.push(body.rosterSize); }
    if (body.starterSlots !== undefined)       { sets.push(`starter_slots = $${i++}`);         vals.push(body.starterSlots); }
    if (body.tradeDeadlineDays !== undefined)  { sets.push(`trade_deadline_days = $${i++}`);   vals.push(body.tradeDeadlineDays); }
    if (body.draftPickTimeSeconds !== undefined) { sets.push(`draft_pick_time_seconds = $${i++}`); vals.push(body.draftPickTimeSeconds); }
    if (sets.length === 0) throw new AppError(400, 'No fields to update');

    vals.push(req.params.leagueId);
    const { rows: [updated] } = await db.query(
      `UPDATE leagues SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals,
    );
    res.json(updated);
  } catch (err) { next(err); }
});

leaguesRouter.delete('/:leagueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT id FROM leagues WHERE id = $1 AND commissioner_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!league) throw new AppError(403, 'Not the commissioner of this league');
    await db.query(`DELETE FROM leagues WHERE id = $1`, [req.params.leagueId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

leaguesRouter.get('/:leagueId/scoring-settings', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [ss] } = await db.query(
      `SELECT * FROM scoring_settings WHERE league_id = $1`, [req.params.leagueId],
    );
    if (!ss) throw new AppError(404, 'Scoring settings not found');
    res.json(ss);
  } catch (err) { next(err); }
});
