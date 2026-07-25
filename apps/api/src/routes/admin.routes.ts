import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware';
import { syncEvents, syncEventsByDate } from '../jobs/eventSync.job';
import { syncAllFighters } from '../jobs/fighterSync.job';
import { autoScheduleNextEvents } from '../jobs/autoSchedule.job';
import { AppError } from '../middleware/error.middleware';
import { db } from '../config/database';
import { fetchEventsByDate } from '../services/espn.adapter';
import { getOpsMetrics } from '../services/opsMetrics.service';
import { fighterNameContains } from '../utils/fighterNames';

export const adminRouter = Router();

// In production, gate these with an admin role check against user_profiles
function requireAdmin(req: AuthRequest, res: any, next: any) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return next(new AppError(403, 'Admin only'));
  }
  next();
}

// Ops dashboard: app/DB stats, odds-api quota, best-effort Railway/Supabase usage.
adminRouter.get('/dashboard', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    res.json(await getOpsMetrics());
  } catch (err) {
    next(err);
  }
});

// Ops metric history (trend graphs): metric -> [{ t, v }] for the last N days.
adminRouter.get('/history', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
    const { rows } = await db.query(
      `SELECT metric, captured_at, value FROM ops_metrics_history
       WHERE captured_at >= now() - ($1 || ' days')::interval
       ORDER BY captured_at ASC`,
      [days],
    );
    const out: Record<string, { t: string; v: number }[]> = {};
    for (const r of rows) {
      (out[r.metric] ??= []).push({ t: r.captured_at, v: Number(r.value) });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// All registered users with email (from Supabase auth), profile, and league memberships.
adminRouter.get('/users', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
        p.display_name, p.last_seen_at,
        COALESCE(
          json_agg(json_build_object('league_name', l.name, 'team_name', lm.team_name)
                   ORDER BY l.name)
            FILTER (WHERE lm.id IS NOT NULL),
          '[]'
        ) AS memberships
      FROM auth.users u
      LEFT JOIN user_profiles p ON p.id = u.id
      LEFT JOIN league_members lm ON lm.user_id = u.id
      LEFT JOIN leagues l ON l.id = lm.league_id
      GROUP BY u.id, u.email, u.created_at, u.last_sign_in_at, p.display_name, p.last_seen_at
      ORDER BY u.created_at
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// App health check — the same verifications the Sunday cloud routine runs, on demand.
// Each check: { key, label, status: 'pass' | 'warn' | 'fail' | 'skip', detail }.
adminRouter.get('/health-check', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const checks: { key: string; label: string; status: string; detail: string }[] = [];

    const {
      rows: [lastEvent],
    } = await db.query(`
      SELECT id, name, status, scheduled_at FROM ufc_events
      WHERE scheduled_at BETWEEN now() - interval '4 days' AND now()
      ORDER BY scheduled_at DESC LIMIT 1
    `);

    if (!lastEvent) {
      checks.push({
        key: 'last_event',
        label: 'Last event scored',
        status: 'skip',
        detail: 'No card in the past 4 days',
      });
    } else {
      const {
        rows: [fr],
      } = await db.query(
        `SELECT count(*) FILTER (WHERE f.status != 'cancelled')::int AS total,
                count(*) FILTER (WHERE f.status != 'cancelled' AND r.id IS NULL)::int AS missing
         FROM fights f LEFT JOIN fight_results r ON r.fight_id = f.id
         WHERE f.event_id = $1`,
        [lastEvent.id],
      );
      const scored = lastEvent.status === 'completed' && fr.missing === 0;
      checks.push({
        key: 'last_event',
        label: 'Last event scored',
        status: scored ? 'pass' : 'fail',
        detail: scored
          ? `${lastEvent.name}: completed, results on all ${fr.total} fights`
          : `${lastEvent.name}: status "${lastEvent.status}", ${fr.missing}/${fr.total} fights missing results`,
      });

      // Picks on decisively-resulted fights must be scored (draw/NC picks stay NULL by design)
      const {
        rows: [up],
      } = await db.query(
        `SELECT count(*)::int AS unscored
         FROM event_picks ep
         JOIN fights f ON f.id = ep.fight_id AND f.event_id = $1
         JOIN fight_results r ON r.fight_id = f.id AND r.winner_id IS NOT NULL
         WHERE ep.is_correct IS NULL`,
        [lastEvent.id],
      );
      checks.push({
        key: 'picks_settled',
        label: 'Picks settled',
        status: up.unscored === 0 ? 'pass' : 'fail',
        detail:
          up.unscored === 0
            ? 'Every submitted pick on a decided fight is scored'
            : `${up.unscored} pick(s) on decided fights never scored`,
      });

      const {
        rows: [mw],
      } = await db.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE winner_id IS NULL)::int AS open
         FROM matchups WHERE event_id = $1`,
        [lastEvent.id],
      );
      checks.push({
        key: 'matchups_final',
        label: 'Matchups finalized',
        status: mw.open === 0 ? 'pass' : 'warn',
        detail:
          mw.open === 0
            ? `All ${mw.total} matchups have a winner`
            : `${mw.open}/${mw.total} matchups without a winner (tie or unfinalized)`,
      });
    }

    const {
      rows: [nextEvent],
    } = await db.query(`
      SELECT e.id, e.name, e.scheduled_at,
        count(f.id)::int AS fights,
        count(f.red_fighter_odds)::int AS with_odds
      FROM ufc_events e LEFT JOIN fights f ON f.event_id = e.id
      WHERE e.status = 'scheduled' AND e.scheduled_at > now()
      GROUP BY e.id ORDER BY e.scheduled_at ASC LIMIT 1
    `);

    if (!nextEvent) {
      checks.push({
        key: 'next_event',
        label: 'Next event ready',
        status: 'fail',
        detail: 'No upcoming scheduled event found',
      });
    } else {
      const days = Math.round(
        (new Date(nextEvent.scheduled_at).getTime() - Date.now()) / 86_400_000,
      );
      const oddsOk = nextEvent.fights > 0 && nextEvent.with_odds >= nextEvent.fights * 0.5;
      // Odds sync only runs within 7 days of an event — missing odds further out is normal
      const status = nextEvent.fights === 0 ? 'fail' : oddsOk ? 'pass' : days > 7 ? 'warn' : 'fail';
      checks.push({
        key: 'next_event',
        label: 'Next event ready',
        status,
        detail: `${nextEvent.name} in ${days}d: ${nextEvent.fights} fights, odds on ${nextEvent.with_odds}`,
      });
    }

    res.json({ generatedAt: new Date().toISOString(), checks });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/sync/events', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    syncEvents().catch(console.error); // Fire and forget
    res.json({ ok: true, message: 'Event sync started' });
  } catch (err) {
    next(err);
  }
});

// Sync ESPN events for a specific date — useful for pulling in events ESPN's default
// scoreboard doesn't return yet (e.g. events announced far in advance)
adminRouter.post(
  '/sync/events/date/:yyyymmdd',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { yyyymmdd } = req.params;
      if (!/^\d{8}$/.test(yyyymmdd))
        throw new AppError(400, 'Date must be YYYYMMDD (e.g. 20260614)');
      const count = await syncEventsByDate(yyyymmdd);
      res.json({ ok: true, message: `Synced ${count} event(s) for ${yyyymmdd}` });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post('/sync/fighters', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    syncAllFighters().catch(console.error); // Fire and forget
    res.json({ ok: true, message: 'Fighter sync started (this takes several minutes)' });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/schedule/auto', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    await autoScheduleNextEvents();
    res.json({ ok: true, message: 'Auto-schedule run complete' });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/events', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, ufc_event_id, name, status, scheduled_at FROM ufc_events ORDER BY scheduled_at DESC LIMIT 50`,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Remove duplicate ufc_events rows that share the same calendar date — keeps the row
// with the earliest created_at (or lowest id) and deletes the rest
adminRouter.post('/events/deduplicate', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { rows: deleted } = await db.query(`
      DELETE FROM ufc_events
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY DATE(scheduled_at AT TIME ZONE 'UTC')
              ORDER BY id ASC
            ) AS rn
          FROM ufc_events
          WHERE status != 'cancelled'
        ) ranked
        WHERE rn > 1
      )
      RETURNING id, name, scheduled_at
    `);
    res.json({ ok: true, deleted: deleted.length, events: deleted });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/events/:eventId/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['scheduled', 'live', 'completed', 'cancelled'].includes(status)) {
      throw new AppError(400, 'Invalid status');
    }
    await db.query(`UPDATE ufc_events SET status = $1 WHERE id = $2`, [status, req.params.eventId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Re-sync fight card for a specific event (bout_order, is_main_event, card_segment)
adminRouter.post(
  '/events/:eventId/resync-fights',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const {
        rows: [event],
      } = await db.query(
        `SELECT id, ufc_event_id, name, scheduled_at FROM ufc_events WHERE id = $1`,
        [req.params.eventId],
      );
      if (!event) throw new AppError(404, 'Event not found');

      const dateStr = new Date(event.scheduled_at).toISOString().slice(0, 10).replace(/-/g, '');
      const espnEvents = await fetchEventsByDate(dateStr);
      const espnEvent = espnEvents.find(
        (e) => e.espnEventId === event.ufc_event_id || event.name.includes(e.name.split(':')[0]),
      );
      if (!espnEvent) throw new AppError(404, 'Event not found in ESPN data for that date');

      let updated = 0;
      for (const fight of espnEvent.fights) {
        const result = await db.query(
          `
        UPDATE fights
        SET bout_order = $1, is_main_event = $2, is_co_main = $3, card_segment = $4,
            red_fighter_odds = COALESCE($5, red_fighter_odds),
            blue_fighter_odds = COALESCE($6, blue_fighter_odds)
        WHERE ufc_fight_id = $7
      `,
          [
            fight.boutOrder,
            fight.isMainEvent,
            fight.isCoMain,
            fight.cardSegment,
            fight.redOdds ?? null,
            fight.blueOdds ?? null,
            fight.espnFightId,
          ],
        );
        if (result.rowCount) updated++;
      }

      res.json({
        ok: true,
        event: event.name,
        fightsUpdated: updated,
        totalFromEspn: espnEvent.fights.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Add tonight's event to all active leagues that don't already have it
adminRouter.post(
  '/events/:eventId/push-to-leagues',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const {
        rows: [event],
      } = await db.query(
        `SELECT id, name FROM ufc_events WHERE id = $1 AND status != 'cancelled'`,
        [req.params.eventId],
      );
      if (!event) throw new AppError(404, 'Event not found');

      const { rows: leagues } = await db.query(
        `
      SELECT l.id FROM leagues l
      WHERE l.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM league_events le
          WHERE le.league_id = l.id AND le.event_id = $1
        )
    `,
        [event.id],
      );

      for (const league of leagues) {
        await db.query(
          `
        INSERT INTO league_events (league_id, event_id, is_scoring)
        VALUES ($1, $2, true)
        ON CONFLICT DO NOTHING
      `,
          [league.id, event.id],
        );
      }

      res.json({ ok: true, event: event.name, leaguesAdded: leagues.length });
    } catch (err) {
      next(err);
    }
  },
);

// Manually add a fight result (commissioner tool + admin tool)
adminRouter.post('/fights/:fightId/result', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Delegated to events.routes handler — just a convenience alias
    res.redirect(307, `/api/v1/events/admin/${req.body.eventId}/results`);
  } catch (err) {
    next(err);
  }
});

// List fights for an event with current odds
adminRouter.get('/events/:eventId/fights', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `
      SELECT f.id, f.bout_order,
        rf.first_name AS red_first, rf.last_name AS red_last_name,
        bf.first_name AS blue_first, bf.last_name AS blue_last_name,
        f.red_fighter_odds, f.blue_fighter_odds
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      WHERE f.event_id = $1
      ORDER BY f.bout_order DESC
    `,
      [req.params.eventId],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Set odds for a single fight
adminRouter.patch('/fights/:fightId/odds', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { redOdds, blueOdds } = req.body;
    if (redOdds === undefined && blueOdds === undefined) {
      throw new AppError(400, 'Provide redOdds and/or blueOdds');
    }
    const { rowCount } = await db.query(
      `UPDATE fights SET
        red_fighter_odds = COALESCE($1, red_fighter_odds),
        blue_fighter_odds = COALESCE($2, blue_fighter_odds)
       WHERE id = $3`,
      [redOdds ?? null, blueOdds ?? null, req.params.fightId],
    );
    if (!rowCount) throw new AppError(404, 'Fight not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Bulk-set odds for an event's fights: [{ fightId, redOdds, blueOdds }]
adminRouter.post(
  '/events/:eventId/odds/bulk',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const entries: { fightId: string; redOdds?: number | null; blueOdds?: number | null }[] =
        req.body;
      if (!Array.isArray(entries)) throw new AppError(400, 'Body must be an array');
      let updated = 0;
      for (const e of entries) {
        const { rowCount } = await db.query(
          `UPDATE fights SET
          red_fighter_odds = COALESCE($1, red_fighter_odds),
          blue_fighter_odds = COALESCE($2, blue_fighter_odds)
         WHERE id = $3 AND event_id = $4`,
          [e.redOdds ?? null, e.blueOdds ?? null, e.fightId, req.params.eventId],
        );
        if (rowCount) updated++;
      }
      res.json({ ok: true, updated });
    } catch (err) {
      next(err);
    }
  },
);

// Sync odds from The Odds API (https://the-odds-api.com — free tier: 500 req/month)
// Requires ODDS_API_KEY env variable. Matches fighters by display name (fuzzy last-name match).
adminRouter.post(
  '/events/:eventId/sync-odds',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const apiKey = process.env.ODDS_API_KEY;
      if (!apiKey) throw new AppError(503, 'ODDS_API_KEY not configured');

      const { rows: fights } = await db.query(
        `
      SELECT f.id, f.ufc_fight_id,
        rf.first_name AS red_first, rf.last_name AS red_last,
        bf.first_name AS blue_first, bf.last_name AS blue_last,
        e.scheduled_at
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      JOIN ufc_events e ON e.id = f.event_id
      WHERE f.event_id = $1
    `,
        [req.params.eventId],
      );

      if (!fights.length) throw new AppError(404, 'No fights found for this event');

      const eventDate = new Date(fights[0].scheduled_at);
      const commenceFrom = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const commenceTo = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const url = `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&commenceTimeFrom=${commenceFrom}&commenceTimeTo=${commenceTo}`;
      const oddsRes = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!oddsRes.ok) {
        const text = await oddsRes.text();
        throw new AppError(502, `Odds API error ${oddsRes.status}: ${text}`);
      }
      const oddsEvents = (await oddsRes.json()) as any[];

      let matched = 0;
      for (const fight of fights) {
        const redLast = fight.red_last;
        const blueLast = fight.blue_last;

        const oddsEvent = oddsEvents.find((oe) => {
          const names = [oe.home_team ?? '', oe.away_team ?? ''];
          // Require BOTH fighters to appear, so we never pull a price from a different
          // bout that merely shares one fighter (e.g. a late replacement still listed
          // under the original opponent). No match = leave unpriced rather than wrong.
          return (
            names.some((n) => fighterNameContains(n, redLast)) &&
            names.some((n) => fighterNameContains(n, blueLast))
          );
        });
        if (!oddsEvent) continue;

        const bookmaker =
          oddsEvent.bookmakers?.find((b: any) => b.key === 'draftkings') ??
          oddsEvent.bookmakers?.[0];
        if (!bookmaker) continue;

        const h2h = bookmaker.markets?.find((m: any) => m.key === 'h2h');
        if (!h2h) continue;

        let redOdds: number | null = null;
        let blueOdds: number | null = null;

        for (const outcome of h2h.outcomes ?? []) {
          const name = outcome.name ?? '';
          if (fighterNameContains(name, redLast)) redOdds = outcome.price;
          else if (fighterNameContains(name, blueLast)) blueOdds = outcome.price;
        }

        if (redOdds !== null || blueOdds !== null) {
          await db.query(
            `UPDATE fights SET
            red_fighter_odds = COALESCE($1, red_fighter_odds),
            blue_fighter_odds = COALESCE($2, blue_fighter_odds)
           WHERE id = $3`,
            [redOdds, blueOdds, fight.id],
          );
          matched++;
        }
      }

      const remaining = oddsRes.headers.get('x-requests-remaining');
      res.json({ ok: true, matched, total: fights.length, requestsRemaining: remaining });
    } catch (err) {
      next(err);
    }
  },
);
