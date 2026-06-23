/**
 * Seeds a full 4-team test league:
 * - 4 users (2 existing + 2 new)
 * - Snake draft (10 fighters per team)
 * - 2 scored past events + 3 upcoming events on schedule
 * - Finalized matchup results → standings
 */

import { createClient } from '@supabase/supabase-js';
import { db } from './apps/api/src/config/database';
import {
  generateMatchupsForLeague,
  finalizeMatchupResults,
} from './apps/api/src/services/matchup.service';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Existing users ──────────────────────────────────────────────────────────
const EXISTING = [
  {
    userId: 'e3361f5c-8cde-4e61-b8b2-6232be71f53e',
    email: 'zach@fantasyufc.dev',
    teamName: 'Blue Thunder',
    isCommissioner: true,
  },
  {
    userId: '908aab05-2b41-4529-899a-4db71e9fb659',
    email: 'zachattack877@comcast.net',
    teamName: 'Red Squad',
    isCommissioner: false,
  },
];

// ── Events ──────────────────────────────────────────────────────────────────
const COMPLETED_EVENTS = [
  '1f57f0a7-fef2-4c04-9d8e-766934a8839d', // UFC 309 (Apr 12)
  '900053d0-38c2-4d03-9f09-3bd5943d0a56', // Barboza vs Murphy (May 3)
];
const UPCOMING_EVENTS = [
  '5f8bfb5f-289b-45f9-a35a-93fcf413d01b', // Song vs Figueiredo (May 30)
  'e54abf43-faf8-4c1b-ac16-dcbed8050287', // UFC 310 (Jun 7)
  '1a312777-ce2f-4cf8-b7e0-9447655a7870', // Holloway vs Allen (Jun 21)
];

// 40 fighter IDs for snake draft
const FIGHTERS = [
  'e0ef4beb-5b9a-42ab-a20e-b86cc9e17e60',
  'e73383ae-9856-4519-9312-384bcae7778f',
  '5d5b7178-3ed7-4b10-8fe2-65b446c18a91',
  '6096a0a1-7e11-4fdb-9cc2-e96c70773bca',
  'b525929b-4826-4962-af8e-1b0f73c1d886',
  'a1804fc8-3c36-41ec-b6b5-63b461b1ca28',
  '55d34817-7e84-4214-a7e2-226b957027f0',
  'd70a6900-4162-484b-93e7-691daca853e2',
  '435442e8-bf4f-44fb-b993-b86117b8a9d1',
  '30cc78d3-1938-493d-a26c-ee15d0e0fd3e',
  'f572ffab-b514-4e6d-95b4-27136587735b',
  'b372463b-b273-4618-a5d7-dc034b5ff2af',
  '92304cf4-ba13-46e1-825e-37627b3badbb',
  '183f332d-c438-4f28-8e49-ae2c40bd9018',
  'd9327f51-e934-413c-88df-d7fd3abca23e',
  '24b3def7-0ed7-4820-ab5f-3f9dc2368cb6',
  '625dd9e7-38ed-4a0d-afce-b31158ffcce2',
  '4037514d-1e20-41f1-8354-6385f125bc48',
  'bbb8eb57-d98a-4cea-a505-42d63a1a8153',
  'e0be9bd5-ac8a-44bb-bd5c-c512282e090d',
  '2d8f4f5f-00a5-4faf-be70-dfe3479fe1d8',
  'f9a01b9a-070a-400a-847e-a14acb724650',
  'c6881695-983c-4cd8-88e5-b19758d993a4',
  '98d488e8-a3f4-403a-b281-8a8b3ad281ab',
  'e4607afe-6fc2-4677-8bb7-c12976f0dc1e',
  '0b21b4a8-596c-4c9e-89b9-d929e2e967ba',
  'a99d4d64-add1-4ed8-b3a3-049a3054dc27',
  'a230e399-5eff-479a-96b8-9395a3d8e951',
  'e23b2377-052a-4c2f-8eab-24281580a164',
  'be8f896a-3e1a-4acb-a911-e56edd75324f',
  '54615d1f-2e6b-4377-8384-85b8507d324d',
  '46fae21f-af70-4228-87c8-ca3c721046a0',
  '5faaf9c9-2a03-4111-9cd3-2f78e40224f5',
  'b19a64f3-902e-44f9-ad92-b5571b9843d7',
  'c51a026e-ae1e-4389-a56e-a0092a8af1ae',
  '8037560d-aff1-45f8-9099-85b0c56b6e09',
  'acedcb89-72cd-4b1b-a156-f0b58ee75ad7',
  '5d9a7e00-ad49-498b-bb53-951978fffe35',
  'dfa6e92b-8507-45e2-8331-78345bca841d',
  '53fb4f7d-807e-4302-9494-f865bc21a02d',
];

// Snake draft: 4 teams, 10 rounds → 40 picks total
function snakeDraft(numTeams: number, numRounds: number): number[][] {
  const picks: number[][] = Array.from({ length: numTeams }, () => []);
  for (let round = 0; round < numRounds; round++) {
    const order =
      round % 2 === 0
        ? Array.from({ length: numTeams }, (_, i) => i)
        : Array.from({ length: numTeams }, (_, i) => numTeams - 1 - i);
    order.forEach((teamIdx) => picks[teamIdx].push(round * numTeams + order.indexOf(teamIdx)));
  }
  return picks;
}

async function main() {
  console.log('🚀 Seeding full 4-team league...\n');

  // ── 1. Create 2 new users ─────────────────────────────────────────────────
  const newUserDefs = [
    { email: 'player3@fantasyufc.dev', teamName: 'Green Machine' },
    { email: 'player4@fantasyufc.dev', teamName: 'Yellow Peril' },
  ];

  const allUsers = [...EXISTING];
  for (const u of newUserDefs) {
    // Check if already exists
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing.users.find((x) => x.email === u.email);
    let userId: string;
    if (found) {
      userId = found.id;
      console.log(`  user exists: ${u.email} (${userId})`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: 'TestPass123!',
        email_confirm: true,
      });
      if (error) throw new Error(`Create user failed: ${error.message}`);
      userId = data.user.id;
      console.log(`  created user: ${u.email} (${userId})`);
    }

    // Upsert profile
    await db.query(
      `
      INSERT INTO user_profiles (id, username, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO NOTHING
    `,
      [userId, u.email.split('@')[0], u.teamName],
    );

    allUsers.push({ userId, email: u.email, teamName: u.teamName, isCommissioner: false });
  }

  // ── 2. Create league ──────────────────────────────────────────────────────
  const {
    rows: [league],
  } = await db.query(
    `
    INSERT INTO leagues (name, commissioner_id, max_teams, roster_size, starter_slots, bench_slots,
      draft_type, status, is_public, season_year, invite_code,
      draft_pick_time_seconds, trade_deadline_days)
    VALUES ('Full Test League', $1, 4, 10, 8, 2, 'snake', 'active', false, 2026,
      'TEST04', 60, 7)
    RETURNING id
  `,
    [allUsers[0].userId],
  );
  const leagueId = league.id;
  console.log(`\n  league created: ${leagueId} (Full Test League)`);

  // Scoring settings
  await db.query(
    `
    INSERT INTO scoring_settings (league_id, pts_win, pts_ko_tko, pts_submission, pts_decision,
      pts_draw, pts_no_contest, pts_finish_rd1, pts_finish_rd2, pts_finish_rd3,
      pts_ko_loss_penalty, title_fight_multiplier, score_prelims, score_early_prelims)
    VALUES ($1, 200, 300, 300, 200, 50, 0, 100, 75, 50, -50, 1.5, true, false)
  `,
    [leagueId],
  );

  // ── 3. Create members ─────────────────────────────────────────────────────
  const memberIds: string[] = [];
  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i];
    const {
      rows: [m],
    } = await db.query(
      `
      INSERT INTO league_members (league_id, user_id, team_name, draft_position, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id
    `,
      [leagueId, u.userId, u.teamName, i + 1],
    );
    memberIds.push(m.id);
    console.log(`  member: ${u.teamName} → ${m.id}`);
  }

  // ── 4. Create rosters + assign fighters (snake draft) ─────────────────────
  const rosterIds: string[] = [];
  for (const memberId of memberIds) {
    const {
      rows: [r],
    } = await db.query(
      `
      INSERT INTO rosters (league_member_id) VALUES ($1) RETURNING id
    `,
      [memberId],
    );
    rosterIds.push(r.id);
  }

  const draftAssignments = snakeDraft(4, 10); // 4 teams, 10 rounds
  for (let teamIdx = 0; teamIdx < 4; teamIdx++) {
    for (let pos = 0; pos < draftAssignments[teamIdx].length; pos++) {
      const fighterIdx = draftAssignments[teamIdx][pos];
      const slotType = pos < 8 ? 'starter' : 'bench';
      await db.query(
        `
        INSERT INTO roster_fighters (roster_id, fighter_id, slot_type, slot_position, acquired_via)
        VALUES ($1, $2, $3, $4, 'draft')
        ON CONFLICT DO NOTHING
      `,
        [rosterIds[teamIdx], FIGHTERS[fighterIdx], slotType, pos],
      );
    }
    console.log(
      `  roster assigned: ${allUsers[teamIdx].teamName} (${draftAssignments[teamIdx].length} fighters)`,
    );
  }

  // ── 5. Add events to league schedule ────────────────────────────────────
  for (const eventId of [...COMPLETED_EVENTS, ...UPCOMING_EVENTS]) {
    await db.query(
      `
      INSERT INTO league_events (league_id, event_id, is_scoring)
      VALUES ($1, $2, true)
      ON CONFLICT DO NOTHING
    `,
      [leagueId, eventId],
    );
  }
  console.log(`\n  added ${COMPLETED_EVENTS.length + UPCOMING_EVENTS.length} events to schedule`);

  // ── 6. Generate round-robin matchups ─────────────────────────────────────
  const result = await generateMatchupsForLeague(leagueId);
  console.log(`  generated matchups: ${JSON.stringify(result)}`);

  // ── 7. Set scores on completed-event matchups ────────────────────────────
  // Design: T1=Blue Thunder, T2=Red Squad, T3=Green Machine, T4=Yellow Peril
  // Event 1 (UFC 309): T1 beats T2 (1850-1400), T3 beats T4 (1700-1350)
  // Event 2 (Barboza vs Murphy): T3 beats T1 (1900-1650), T2 beats T4 (2000-1500)
  const scoreMap: Record<string, { home: number; away: number }[]> = {
    [COMPLETED_EVENTS[0]]: [
      { home: 1850, away: 1400 },
      { home: 1700, away: 1350 },
    ],
    [COMPLETED_EVENTS[1]]: [
      { home: 1900, away: 1650 },
      { home: 2000, away: 1500 },
    ],
  };

  for (const eventId of COMPLETED_EVENTS) {
    const { rows: matchups } = await db.query(
      `SELECT id, home_team_id, away_team_id FROM matchups WHERE league_id = $1 AND event_id = $2 ORDER BY created_at`,
      [leagueId, eventId],
    );
    const scores = scoreMap[eventId];
    for (let i = 0; i < matchups.length; i++) {
      const s = scores[i] ?? { home: 1500, away: 1300 };
      await db.query(`UPDATE matchups SET home_score = $1, away_score = $2 WHERE id = $3`, [
        s.home,
        s.away,
        matchups[i].id,
      ]);
    }
    // Finalize: sets winner_id, updates wins/losses/total_points
    await finalizeMatchupResults(leagueId, eventId);
    console.log(`  finalized event: ${eventId}`);
  }

  // ── 8. Print standings ───────────────────────────────────────────────────
  const { rows: standings } = await db.query(
    `
    SELECT lm.team_name, lm.wins, lm.losses, lm.total_points
    FROM league_members lm
    WHERE lm.league_id = $1
    ORDER BY lm.wins DESC, lm.total_points DESC
  `,
    [leagueId],
  );

  console.log('\n📊 Standings:');
  standings.forEach((s, i) => {
    console.log(
      `  #${i + 1} ${s.team_name}  ${s.wins}W-${s.losses}L  ${(+s.total_points).toFixed(0)} pts`,
    );
  });

  console.log(`\n✅ Done! League ID: ${leagueId}`);
  console.log(`   Open: http://localhost:5173/league/${leagueId}`);
  console.log(`   Invite code: TEST04`);

  await db.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
