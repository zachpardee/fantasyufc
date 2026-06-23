/**
 * Seeds a staking test league modelled on the Full Test League.
 * Same 4 users, $100/week budget, linked to the next upcoming event with sample bets.
 * Usage: DATABASE_URL=... npx tsx src/db/seeds/staking_league.ts
 */
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

function toDecimalOdds(american: number): number {
  return american >= 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function calcPayout(stake: number, dec: number): number {
  return Math.round(stake * dec * 100) / 100;
}

async function run() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // ── Users (same as Full Test League) ─────────────────────────────────────
    const ZACH = 'e3361f5c-8cde-4e61-b8b2-6232be71f53e'; // zach@fantasyufc.dev
    const PLAYER4 = 'd0382287-e2f7-44f9-8091-99ddea4d0660'; // player4@fantasyufc.dev
    const ZACH2 = '908aab05-2b41-4529-899a-4db71e9fb659'; // zachattack877@comcast.net
    const PLAYER3 = '8a3ed49f-08a4-4b8b-b0af-c631e8236ddd'; // player3@fantasyufc.dev

    const EVENT_ID = '5f8bfb5f-289b-45f9-a35a-93fcf413d01b'; // Song vs Figueiredo

    // ── Tear down any existing staking test league to keep things clean ───────
    const { rows: existing } = await client.query(
      `SELECT id FROM leagues WHERE name = 'Staking Test League'`,
    );
    if (existing.length) {
      const id = existing[0].id;
      console.log(`Dropping existing Staking Test League (${id})…`);
      await client.query(
        `DELETE FROM staking_parlay_legs WHERE parlay_id IN (SELECT id FROM staking_parlays WHERE league_id = $1)`,
        [id],
      );
      await client.query(`DELETE FROM staking_parlays   WHERE league_id = $1`, [id]);
      await client.query(`DELETE FROM staking_singles   WHERE league_id = $1`, [id]);
      await client.query(`DELETE FROM matchups          WHERE league_id = $1`, [id]);
      await client.query(`DELETE FROM league_events     WHERE league_id = $1`, [id]);
      await client.query(`DELETE FROM scoring_settings  WHERE league_id = $1`, [id]);
      await client.query(`DELETE FROM league_members    WHERE league_id = $1`, [id]);
      await client.query(`DELETE FROM leagues           WHERE id        = $1`, [id]);
    }

    // ── League ────────────────────────────────────────────────────────────────
    const {
      rows: [league],
    } = await client.query(
      `
      INSERT INTO leagues (
        name, commissioner_id, invite_code, max_teams,
        status, season_year, season_length_months, season_ends_at,
        league_format, weekly_budget
      ) VALUES (
        'Staking Test League', $1, 'STAKE1', 6,
        'active', 2026, 6, '2026-11-01',
        'staking', 100
      ) RETURNING id
    `,
      [ZACH],
    );
    const leagueId = league.id;
    console.log(`Created league: ${leagueId}`);

    // ── Scoring settings ──────────────────────────────────────────────────────
    await client.query(
      `
      INSERT INTO scoring_settings (league_id, pts_win, pts_ko_tko, pts_submission, pts_decision, score_prelims)
      VALUES ($1, 20, 10, 10, 5, true)
    `,
      [leagueId],
    );

    // ── Members ───────────────────────────────────────────────────────────────
    const memberDefs = [
      { userId: ZACH, teamName: 'Thunder Bets', color: '#4488ff' },
      { userId: PLAYER4, teamName: 'Yellow Flash', color: '#f5a623' },
      { userId: ZACH2, teamName: 'Red Rockets', color: '#c8102e' },
      { userId: PLAYER3, teamName: 'Green Gamblers', color: '#22aa55' },
    ];
    const memberIds: Record<string, string> = {};
    for (const m of memberDefs) {
      const {
        rows: [row],
      } = await client.query(
        `
        INSERT INTO league_members (league_id, user_id, team_name, avatar_color, staking_balance, is_active)
        VALUES ($1, $2, $3, $4, 100, true)
        RETURNING id
      `,
        [leagueId, m.userId, m.teamName, m.color],
      );
      memberIds[m.teamName] = row.id;
      console.log(`  Member: ${m.teamName} → ${row.id}`);
    }

    // ── League event ──────────────────────────────────────────────────────────
    await client.query(
      `
      INSERT INTO league_events (league_id, event_id, is_scoring) VALUES ($1, $2, true)
    `,
      [leagueId, EVENT_ID],
    );

    // ── Matchups ──────────────────────────────────────────────────────────────
    await client.query(
      `
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id)
      VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)
    `,
      [
        leagueId,
        EVENT_ID,
        memberIds['Thunder Bets'],
        memberIds['Yellow Flash'],
        memberIds['Red Rockets'],
        memberIds['Green Gamblers'],
      ],
    );

    // ── Odds on the top-6 fights (null in DB — add realistic lines) ───────────
    const odds: Record<string, { red: number; blue: number }> = {
      '232f53e3-0709-4338-ade6-c17db20f326d': { red: -175, blue: 145 }, // Song vs Figueiredo
      '5493a2bd-2279-4099-8f6e-62a5ad59a4ad': { red: 165, blue: -200 }, // Menifield vs Zhang
      '1f8be1cb-1269-44f2-90a1-2bd415bb9edc': { red: -300, blue: 240 }, // Pavlovich vs Teixeira
      'e82a2121-a622-4245-a503-3ae00672d338': { red: -220, blue: 180 }, // Asakura vs Smotherman
      '415b1009-d169-47c5-b602-a472f708b6f6': { red: 110, blue: -130 }, // Matthews vs Salikhov
      'b5fcf8fc-231f-4372-9f01-032241550c17': { red: -180, blue: 150 }, // Perez vs Sumudaerji
    };
    for (const [fightId, o] of Object.entries(odds)) {
      await client.query(
        `UPDATE fights SET red_fighter_odds = $1, blue_fighter_odds = $2 WHERE id = $3`,
        [o.red, o.blue, fightId],
      );
    }
    console.log('Odds seeded on 6 fights.');

    // ── Sample bets ───────────────────────────────────────────────────────────
    // Fetch red/blue fighter IDs for the 6 fights
    const { rows: fights } = await client.query(
      `
      SELECT f.id, f.red_fighter_id, f.blue_fighter_id,
             rf.first_name || ' ' || rf.last_name AS red_name,
             bf.first_name || ' ' || bf.last_name AS blue_name,
             f.red_fighter_odds, f.blue_fighter_odds
      FROM fights f
      JOIN fighters rf ON rf.id = f.red_fighter_id
      JOIN fighters bf ON bf.id = f.blue_fighter_id
      WHERE f.id = ANY($1::uuid[])
    `,
      [Object.keys(odds)],
    );

    const byId = Object.fromEntries(fights.map((f: any) => [f.id, f]));

    // Helper to place a single
    async function placeSingle(
      memberId: string,
      fightId: string,
      fighterId: string,
      stake: number,
    ) {
      const fight = byId[fightId];
      const isRed = fighterId === fight.red_fighter_id;
      const american = isRed ? fight.red_fighter_odds : fight.blue_fighter_odds;
      const dec = toDecimalOdds(american);
      const payout = calcPayout(stake, dec);
      const {
        rows: [r],
      } = await client.query(
        `
        INSERT INTO staking_singles
          (league_id, event_id, member_id, fight_id, fighter_id, odds, stake, potential_payout, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        ON CONFLICT (league_id, event_id, member_id, fight_id) DO UPDATE SET
          fighter_id = EXCLUDED.fighter_id, odds = EXCLUDED.odds,
          stake = EXCLUDED.stake, potential_payout = EXCLUDED.potential_payout
        RETURNING id
      `,
        [leagueId, EVENT_ID, memberId, fightId, fighterId, american, stake, payout],
      );
      await client.query(
        `UPDATE league_members SET staking_balance = staking_balance - $1 WHERE id = $2`,
        [stake, memberId],
      );
      return r.id;
    }

    // --- Thunder Bets (zach): Pavlovich single $20, Song single $15, parlay $10 ---
    const pavFight = '1f8be1cb-1269-44f2-90a1-2bd415bb9edc'; // Pavlovich (red, -300)
    const songFight = '232f53e3-0709-4338-ade6-c17db20f326d'; // Song (red, -175)
    const thunderId = memberIds['Thunder Bets'];

    await placeSingle(thunderId, pavFight, byId[pavFight].red_fighter_id, 20);
    await placeSingle(thunderId, songFight, byId[songFight].red_fighter_id, 15);

    // Parlay: Pavlovich + Song, stake $10
    const pavDec = toDecimalOdds(-300);
    const songDec = toDecimalOdds(-175);
    const parlayDec = pavDec * songDec;
    const parlayPayout = calcPayout(10, parlayDec);
    const {
      rows: [pRow],
    } = await client.query(
      `
      INSERT INTO staking_parlays
        (league_id, event_id, member_id, stake, decimal_odds, potential_payout, status)
      VALUES ($1, $2, $3, 10, $4, $5, 'pending')
      ON CONFLICT (league_id, event_id, member_id) DO UPDATE SET
        stake = EXCLUDED.stake, decimal_odds = EXCLUDED.decimal_odds,
        potential_payout = EXCLUDED.potential_payout
      RETURNING id
    `,
      [leagueId, EVENT_ID, thunderId, parlayDec, parlayPayout],
    );
    await client.query(
      `
      INSERT INTO staking_parlay_legs (parlay_id, fight_id, fighter_id, odds, decimal_odds)
      VALUES ($1, $2, $3, $4, $5), ($1, $6, $7, $8, $9)
      ON CONFLICT (parlay_id, fight_id) DO UPDATE SET
        fighter_id = EXCLUDED.fighter_id, odds = EXCLUDED.odds, decimal_odds = EXCLUDED.decimal_odds
    `,
      [
        pRow.id,
        pavFight,
        byId[pavFight].red_fighter_id,
        -300,
        pavDec,
        songFight,
        byId[songFight].red_fighter_id,
        -175,
        songDec,
      ],
    );
    await client.query(
      `UPDATE league_members SET staking_balance = staking_balance - 10 WHERE id = $1`,
      [thunderId],
    );
    console.log(
      `Thunder Bets: Pavlovich $20 + Song $15 + parlay $10 (dec: ${parlayDec.toFixed(3)}x → $${parlayPayout})`,
    );

    // --- Yellow Flash (player4): Figueiredo single $25, Zhang single $20 ---
    const figFight = '232f53e3-0709-4338-ade6-c17db20f326d'; // Figueiredo (blue, +145)
    const zhangFight = '5493a2bd-2279-4099-8f6e-62a5ad59a4ad'; // Zhang (blue, -200)
    const yellowId = memberIds['Yellow Flash'];

    await placeSingle(yellowId, figFight, byId[figFight].blue_fighter_id, 25);
    await placeSingle(yellowId, zhangFight, byId[zhangFight].blue_fighter_id, 20);
    console.log(`Yellow Flash: Figueiredo $25 + Zhang $20`);

    // --- Red Rockets (zach2): Teixeira underdog single $10 ---
    const texFight = '1f8be1cb-1269-44f2-90a1-2bd415bb9edc'; // Teixeira (blue, +240)
    const redId = memberIds['Red Rockets'];
    await placeSingle(redId, texFight, byId[texFight].blue_fighter_id, 10);
    console.log(`Red Rockets: Teixeira $10 (+240)`);

    // Green Gamblers — no bets yet (testing empty state)

    await client.query('COMMIT');
    console.log('\nStaking Test League seeded successfully!');
    console.log(`League ID: ${leagueId}`);
    console.log(`Invite code: STAKE1`);

    // Print final balances
    const { rows: balances } = await db.query(
      `SELECT team_name, staking_balance FROM league_members WHERE league_id = $1 ORDER BY team_name`,
      [leagueId],
    );
    console.log('\nBalances:');
    for (const b of balances) console.log(`  ${b.team_name}: $${b.staking_balance}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
