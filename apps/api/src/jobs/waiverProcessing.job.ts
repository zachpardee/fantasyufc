import cron from 'node-cron';
import { db } from '../config/database';
import { sendNotification } from '../services/notification.service';
import { redis } from '../config/redis';

// Runs every day at 3am UTC. For each league, checks if today is their waiver day.
// waiver_day: 0=Sun, 1=Mon, ..., 6=Sat
export function startWaiverProcessingJob() {
  cron.schedule('0 3 * * *', () => processAllLeagueWaivers(), { timezone: 'UTC' });
}

export async function processAllLeagueWaivers() {
  const todayDow = new Date().getUTCDay(); // 0=Sun

  const { rows: leagues } = await db.query(`
    SELECT id, name, roster_size, waiver_order_type, waiver_day
    FROM leagues
    WHERE status = 'active' AND waiver_day = $1
  `, [todayDow]);

  for (const league of leagues) {
    try {
      await processLeagueWaivers(league.id, league.roster_size, league.waiver_order_type);
      console.log(`[Waivers] Processed league: ${league.name}`);
    } catch (err) {
      console.error(`[Waivers] Error in league ${league.name}:`, err);
    }
  }
}

async function processLeagueWaivers(leagueId: string, rosterSize: number, waiverOrderType: string) {
  // Get all pending claims for this league sorted by priority (lower = higher priority)
  const { rows: claims } = await db.query(`
    SELECT
      wc.id, wc.claiming_team_id, wc.fighter_id, wc.drop_fighter_id, wc.priority,
      f.first_name || ' ' || f.last_name AS fighter_name,
      df.first_name || ' ' || df.last_name AS drop_fighter_name,
      lm.user_id, lm.team_name
    FROM waiver_claims wc
    JOIN fighters f ON f.id = wc.fighter_id
    LEFT JOIN fighters df ON df.id = wc.drop_fighter_id
    JOIN league_members lm ON lm.id = wc.claiming_team_id
    WHERE wc.league_id = $1 AND wc.status = 'pending'
    ORDER BY wc.priority ASC, wc.submitted_at ASC
  `, [leagueId]);

  // Track which fighters have been claimed this run (prevent double-claiming)
  const claimedFighters = new Set<string>();
  const teamsWhoClaimed = new Set<string>();

  for (const claim of claims) {
    // A team can only win one waiver claim per cycle
    if (teamsWhoClaimed.has(claim.claiming_team_id)) {
      await denyWaiver(claim.id, 'Team already received a waiver award this cycle');
      continue;
    }

    // Fighter must still be unclaimed
    if (claimedFighters.has(claim.fighter_id)) {
      await denyWaiver(claim.id, 'Fighter was claimed by a higher-priority team');
      continue;
    }

    // Check fighter is still a free agent in this league
    const { rows: [onRoster] } = await db.query(`
      SELECT rf.id FROM roster_fighters rf
      JOIN rosters r ON r.id = rf.roster_id
      JOIN league_members lm ON lm.id = r.league_member_id
      WHERE lm.league_id = $1 AND rf.fighter_id = $2
    `, [leagueId, claim.fighter_id]);

    if (onRoster) {
      await denyWaiver(claim.id, 'Fighter is no longer available');
      continue;
    }

    // Get current roster size for this team
    const { rows: [{ count }] } = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM roster_fighters rf
      JOIN rosters r ON r.id = rf.roster_id
      WHERE r.league_member_id = $1
    `, [claim.claiming_team_id]);

    const currentSize = parseInt(count);
    const isFull = currentSize >= rosterSize;

    if (isFull && !claim.drop_fighter_id) {
      await denyWaiver(claim.id, 'Roster is full — must specify a fighter to drop');
      continue;
    }

    if (claim.drop_fighter_id) {
      // Verify the fighter to drop is actually on this team's roster
      const { rows: [onTeam] } = await db.query(`
        SELECT rf.id FROM roster_fighters rf
        JOIN rosters r ON r.id = rf.roster_id
        WHERE r.league_member_id = $1 AND rf.fighter_id = $2
      `, [claim.claiming_team_id, claim.drop_fighter_id]);

      if (!onTeam) {
        await denyWaiver(claim.id, 'Fighter to drop is not on your roster');
        continue;
      }
    }

    // All checks passed — execute the claim
    await approveWaiver(claim, leagueId);
    claimedFighters.add(claim.fighter_id);
    teamsWhoClaimed.add(claim.claiming_team_id);
  }

  // Deny all remaining pending claims (lower priority teams who didn't get awarded)
  await db.query(`
    UPDATE waiver_claims
    SET status = 'processed', processed_at = NOW()
    WHERE league_id = $1 AND status = 'pending'
  `, [leagueId]);

  // Recalculate waiver priority for next week
  await recalculateWaiverPriority(leagueId, waiverOrderType);

  await redis.del(`free-agents:${leagueId}`);
  await redis.del(`standings:${leagueId}`);
}

async function approveWaiver(claim: any, leagueId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: [roster] } = await client.query(
      `SELECT r.id FROM rosters r WHERE r.league_member_id = $1`,
      [claim.claiming_team_id],
    );

    // Drop the specified fighter first
    if (claim.drop_fighter_id) {
      await client.query(
        `DELETE FROM roster_fighters WHERE roster_id = $1 AND fighter_id = $2`,
        [roster.id, claim.drop_fighter_id],
      );
      await client.query(`
        INSERT INTO fighter_transactions (league_id, fighter_id, from_team_id, transaction_type)
        VALUES ($1, $2, $3, 'drop')
      `, [leagueId, claim.drop_fighter_id, claim.claiming_team_id]);
    }

    // Add the new fighter (bench by default — user sets lineup)
    await client.query(`
      INSERT INTO roster_fighters (roster_id, fighter_id, slot_type, acquired_via)
      VALUES ($1, $2, 'bench', 'waiver')
    `, [roster.id, claim.fighter_id]);

    await client.query(`
      INSERT INTO fighter_transactions (league_id, fighter_id, to_team_id, transaction_type, related_id)
      VALUES ($1, $2, $3, 'waiver', $4)
    `, [leagueId, claim.fighter_id, claim.claiming_team_id, claim.id]);

    await client.query(
      `UPDATE waiver_claims SET status = 'approved', processed_at = NOW() WHERE id = $1`,
      [claim.id],
    );

    await client.query('COMMIT');

    await sendNotification(
      claim.user_id,
      'waiver_approved',
      'Waiver Claim Approved',
      `${claim.fighter_name} has been added to your roster${claim.drop_fighter_name ? `, ${claim.drop_fighter_name} dropped` : ''}.`,
      { leagueId, fighterId: claim.fighter_id },
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function denyWaiver(claimId: string, reason: string) {
  const { rows: [claim] } = await db.query(
    `UPDATE waiver_claims SET status = 'denied', denial_reason = $2, processed_at = NOW()
     WHERE id = $1 RETURNING claiming_team_id, fighter_id`,
    [claimId, reason],
  );

  if (!claim) return;

  const { rows: [member] } = await db.query(
    `SELECT user_id FROM league_members WHERE id = $1`, [claim.claiming_team_id],
  );
  const { rows: [fighter] } = await db.query(
    `SELECT first_name || ' ' || last_name AS name FROM fighters WHERE id = $1`, [claim.fighter_id],
  );

  if (member && fighter) {
    await sendNotification(
      member.user_id,
      'waiver_denied',
      'Waiver Claim Denied',
      `Your claim for ${fighter.name} was denied: ${reason}`,
    );
  }
}

// After processing, reset priorities based on league settings
async function recalculateWaiverPriority(leagueId: string, orderType: string) {
  if (orderType === 'fcfs') return; // First-come-first-served doesn't reset

  // Inverse standings: worst record → highest priority (lowest number)
  await db.query(`
    UPDATE league_members lm
    SET waiver_priority = ranked.priority
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (ORDER BY wins ASC, total_points ASC) AS priority
      FROM league_members
      WHERE league_id = $1 AND is_active = true
    ) AS ranked
    WHERE lm.id = ranked.id
  `, [leagueId]);
}
