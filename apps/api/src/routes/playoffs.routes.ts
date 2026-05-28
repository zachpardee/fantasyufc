import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { refreshStakingMatchupScores } from '../services/scoring.service';

export const playoffsRouter = Router({ mergeParams: true });

async function getBracket(leagueId: string) {
  const { rows: [leagueRow] } = await db.query(
    `SELECT league_format FROM leagues WHERE id = $1`, [leagueId],
  );
  const isStaking = leagueRow?.league_format === 'staking';

  const { rows: semis } = await db.query(`
    SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
           m.home_seed, m.away_seed, m.winner_id, m.playoff_round,
           ht.team_name AS home_team_name, at2.team_name AS away_team_name,
           e.name AS event_name, e.status AS event_status, e.scheduled_at
    FROM matchups m
    JOIN league_members ht ON ht.id = m.home_team_id
    JOIN league_members at2 ON at2.id = m.away_team_id
    JOIN ufc_events e ON e.id = m.event_id
    WHERE m.league_id = $1 AND m.playoff_round = 'semis'
    ORDER BY m.home_seed ASC
  `, [leagueId]);

  const { rows: finals } = await db.query(`
    SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
           m.home_seed, m.away_seed, m.winner_id, m.playoff_round,
           ht.team_name AS home_team_name, at2.team_name AS away_team_name,
           e.name AS event_name, e.status AS event_status, e.scheduled_at
    FROM matchups m
    JOIN league_members ht ON ht.id = m.home_team_id
    JOIN league_members at2 ON at2.id = m.away_team_id
    JOIN ufc_events e ON e.id = m.event_id
    WHERE m.league_id = $1 AND m.playoff_round = 'finals'
    LIMIT 1
  `, [leagueId]);

  const sortCol = isStaking ? 'lm.staking_balance' : 'lm.total_points';
  const { rows: seeds } = await db.query(`
    SELECT lm.id, lm.team_name, lm.wins, lm.losses, lm.total_points, lm.staking_balance
    FROM league_members lm
    WHERE lm.league_id = $1 AND lm.is_active = true
    ORDER BY ${sortCol} DESC, lm.wins DESC
    LIMIT 4
  `, [leagueId]);

  let phase: 'none' | 'semis' | 'finals' | 'complete' = 'none';
  if (semis.length > 0) phase = 'semis';
  if (finals.length > 0) phase = 'finals';
  if (finals.length > 0 && finals[0].winner_id) phase = 'complete';

  return { phase, seeds, semisMatchups: semis, finalsMatchup: finals[0] ?? null, isStaking };
}

playoffsRouter.get('/bracket', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [member] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!member) throw new AppError(403, 'Not a member of this league');
    res.json(await getBracket(req.params.leagueId));
  } catch (err) { next(err); }
});

playoffsRouter.post('/start', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT id, commissioner_id, status FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (!league) throw new AppError(404, 'League not found');
    if (league.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    if (league.status !== 'active') throw new AppError(400, 'League must be active to start playoffs');

    const { semisEventId, memberIds } = req.body;
    if (!semisEventId) throw new AppError(400, 'semisEventId required');

    // Check event exists
    const { rows: [event] } = await db.query(`SELECT id FROM ufc_events WHERE id = $1`, [semisEventId]);
    if (!event) throw new AppError(404, 'Event not found');

    // Check no semis already exist
    const { rows: existing } = await db.query(
      `SELECT id FROM matchups WHERE league_id = $1 AND playoff_round = 'semis'`,
      [req.params.leagueId],
    );
    if (existing.length > 0) throw new AppError(400, 'Playoffs already started');

    const { rows: [startLeague] } = await db.query(
      `SELECT league_format FROM leagues WHERE id = $1`, [req.params.leagueId],
    );
    const isStartStaking = startLeague?.league_format === 'staking';
    const startSortCol = isStartStaking ? 'staking_balance' : 'total_points';

    // Seed top 4 by total_points (or staking_balance) DESC, tiebreak by wins — or use custom order from commissioner
    let topTeams: any[];
    if (Array.isArray(memberIds) && memberIds.length >= 2) {
      const { rows: allMembers } = await db.query(
        `SELECT id, team_name, wins, losses, total_points, staking_balance FROM league_members WHERE league_id = $1 AND is_active = true`,
        [req.params.leagueId],
      );
      const memberMap = new Map(allMembers.map((m: any) => [m.id, m]));
      topTeams = memberIds.slice(0, 4).map((id: string) => memberMap.get(id)).filter(Boolean);
      if (topTeams.length < 2) throw new AppError(400, 'Invalid memberIds — need at least 2 valid members');
    } else {
      const { rows } = await db.query(`
        SELECT id, team_name, wins, losses, total_points, staking_balance
        FROM league_members
        WHERE league_id = $1 AND is_active = true
        ORDER BY ${startSortCol} DESC, wins DESC
        LIMIT 4
      `, [req.params.leagueId]);
      topTeams = rows;
    }

    if (topTeams.length < 2) throw new AppError(400, 'Need at least 2 teams for playoffs');

    const [s1, s2, s3, s4] = topTeams;

    // 4+ teams: standard semis (1v4, 2v3) then finals
    // <4 teams: skip semis, go straight to finals (1v2)
    const fullBracket = topTeams.length >= 4;
    const round = fullBracket ? 'semis' : 'finals';
    const matchupPairs: [any, any, number, number][] = fullBracket
      ? [[s1, s4, 1, 4], [s2, s3, 2, 3]]
      : [[s1, s2, 1, 2]];

    for (const [home, away, hs, as_] of matchupPairs) {
      await db.query(`
        INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, is_playoffs, playoff_round, home_seed, away_seed)
        VALUES ($1, $2, $3, $4, true, $5, $6, $7)
      `, [req.params.leagueId, semisEventId, home.id, away.id, round, hs, as_]);
    }

    await db.query(`UPDATE leagues SET status = 'playoffs' WHERE id = $1`, [req.params.leagueId]);

    // Initialize staking playoff matchup scores (members may have already placed bets)
    if (isStartStaking) {
      refreshStakingMatchupScores(req.params.leagueId, semisEventId).catch(() => {});
    }

    res.json(await getBracket(req.params.leagueId));
  } catch (err) { next(err); }
});

// Commissioner: cancel playoffs and revert league to active
playoffsRouter.delete('/cancel', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT id, commissioner_id, status FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (!league) throw new AppError(404, 'League not found');
    if (league.commissioner_id !== req.user!.id) throw new AppError(403, 'Commissioner only');
    if (league.status !== 'playoffs') throw new AppError(400, 'League is not in playoffs');

    await db.query(
      `DELETE FROM matchups WHERE league_id = $1 AND is_playoffs = true`,
      [req.params.leagueId],
    );
    await db.query(`UPDATE leagues SET status = 'active' WHERE id = $1`, [req.params.leagueId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

playoffsRouter.post('/advance', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { rows: [league] } = await db.query(
      `SELECT id, status FROM leagues WHERE id = $1`,
      [req.params.leagueId],
    );
    if (!league) throw new AppError(404, 'League not found');
    const { rows: [membership] } = await db.query(
      `SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [req.params.leagueId, req.user!.id],
    );
    if (!membership) throw new AppError(403, 'Not a member of this league');
    if (league.status !== 'playoffs') throw new AppError(400, 'Playoffs must be started first');

    let { finalsEventId } = req.body;
    if (!finalsEventId) {
      const { rows: [leagueRow] } = await db.query(
        `SELECT playoff_finals_event_id FROM leagues WHERE id = $1`, [req.params.leagueId],
      );
      finalsEventId = leagueRow?.playoff_finals_event_id;
    }
    if (!finalsEventId) throw new AppError(400, 'finalsEventId required');

    // Check finals doesn't already exist
    const { rows: existingFinals } = await db.query(
      `SELECT id FROM matchups WHERE league_id = $1 AND playoff_round = 'finals'`,
      [req.params.leagueId],
    );
    if (existingFinals.length > 0) throw new AppError(400, 'Finals already created');

    // Get semis matchups
    const { rows: semis } = await db.query(`
      SELECT id, home_team_id, away_team_id, home_score, away_score, home_seed, away_seed
      FROM matchups WHERE league_id = $1 AND playoff_round = 'semis'
      ORDER BY home_seed ASC
    `, [req.params.leagueId]);

    if (semis.length < 1) throw new AppError(400, 'No semis matchups found');

    const { rows: [advLeague] } = await db.query(
      `SELECT league_format FROM leagues WHERE id = $1`, [req.params.leagueId],
    );
    const isAdvStaking = advLeague?.league_format === 'staking';

    // Get season score for tiebreaking (staking_balance for staking leagues, total_points otherwise)
    const { rows: seasonPts } = await db.query(
      `SELECT id, total_points, staking_balance FROM league_members WHERE league_id = $1`,
      [req.params.leagueId],
    );
    const pts = new Map(seasonPts.map((r: any) => [r.id, +(isAdvStaking ? r.staking_balance : r.total_points)]));

    // Determine winner: higher matchup score; tie broken by season points
    function winner(m: any) {
      const hs = +m.home_score, as_ = +m.away_score;
      if (hs !== as_) return hs > as_ ? { id: m.home_team_id, seed: m.home_seed } : { id: m.away_team_id, seed: m.away_seed };
      return (pts.get(m.home_team_id) ?? 0) >= (pts.get(m.away_team_id) ?? 0)
        ? { id: m.home_team_id, seed: m.home_seed }
        : { id: m.away_team_id, seed: m.away_seed };
    }

    const w1 = winner(semis[0]);
    const w2 = semis[1] ? winner(semis[1]) : null;

    if (!w2) throw new AppError(400, 'Need two semis matchups to create finals');

    // Higher seed (lower number) is home team in finals
    const [finalsHome, finalsAway] = w1.seed <= w2.seed ? [w1, w2] : [w2, w1];

    await db.query(`
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, is_playoffs, playoff_round, home_seed, away_seed)
      VALUES ($1, $2, $3, $4, true, 'finals', $5, $6)
    `, [req.params.leagueId, finalsEventId, finalsHome.id, finalsAway.id, finalsHome.seed, finalsAway.seed]);

    // Initialize staking finals matchup score (members may have already placed bets)
    if (isAdvStaking) {
      refreshStakingMatchupScores(req.params.leagueId, finalsEventId).catch(() => {});
    }

    res.json(await getBracket(req.params.leagueId));
  } catch (err) { next(err); }
});
