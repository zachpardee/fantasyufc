/**
 * Seeds two past settled events for the Staking Test League.
 * Adds realistic bets, P&L, matchup scores, and budget credits.
 * Usage: DATABASE_URL=... npx tsx src/db/seeds/staking_past_events.ts
 */
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

function dec(american: number) {
  return american >= 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}
function payout(stake: number, american: number) {
  return Math.round(stake * dec(american) * 100) / 100;
}
function pl(stake: number, american: number) {
  return Math.round((payout(stake, american) - stake) * 100) / 100;
}

async function run() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // ── Find the staking league and its members ───────────────────────────────
    const {
      rows: [league],
    } = await client.query(`SELECT id FROM leagues WHERE name = 'Staking Test League'`);
    if (!league) throw new Error('Staking Test League not found — run staking_league.ts first');
    const LID = league.id;

    const { rows: members } = await client.query(
      `SELECT id, team_name FROM league_members WHERE league_id = $1 AND is_active = true ORDER BY team_name`,
      [LID],
    );
    const byName = Object.fromEntries(members.map((m: any) => [m.team_name, m.id]));
    console.log('Members:', Object.keys(byName));

    const THUNDER = byName['Thunder Bets'];
    const YELLOW = byName['Yellow Flash'];
    const RED = byName['Red Rockets'];
    const GREEN = byName['Green Gamblers'];

    // ── Clean up any existing past-event data for this league ─────────────────
    const pastEvents = [
      '900053d0-38c2-4d03-9f09-3bd5943d0a56',
      '80fe0cdb-20d6-4c64-8db7-7a842ce7cf70',
    ];
    for (const eid of pastEvents) {
      await client.query(
        `DELETE FROM staking_parlay_legs WHERE parlay_id IN (SELECT id FROM staking_parlays WHERE league_id=$1 AND event_id=$2)`,
        [LID, eid],
      );
      await client.query(`DELETE FROM staking_parlays WHERE league_id=$1 AND event_id=$2`, [
        LID,
        eid,
      ]);
      await client.query(`DELETE FROM staking_singles WHERE league_id=$1 AND event_id=$2`, [
        LID,
        eid,
      ]);
      await client.query(`DELETE FROM matchups WHERE league_id=$1 AND event_id=$2`, [LID, eid]);
      await client.query(`DELETE FROM league_events WHERE league_id=$1 AND event_id=$2`, [
        LID,
        eid,
      ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT 1: Barboza vs. Murphy (900053d0)
    // All fights have real odds and results
    // ─────────────────────────────────────────────────────────────────────────
    const E1 = '900053d0-38c2-4d03-9f09-3bd5943d0a56';

    // fight IDs + metadata (from DB query above)
    const e1Fights: Record<
      string,
      { redId: string; blueId: string; winnerId: string; redOdds: number; blueOdds: number }
    > = {
      'a608e223-4f9b-42ad-8896-5a69bf814237': {
        redId: '98d488e8-a3f4-403a-b281-8a8b3ad281ab',
        blueId: 'e4607afe-6fc2-4677-8bb7-c12976f0dc1e',
        winnerId: '98d488e8-a3f4-403a-b281-8a8b3ad281ab',
        redOdds: -200,
        blueOdds: 165,
      }, // Della Maddalena vs Covington
      '1a0da55b-ca6a-4074-92ad-7b84749a654e': {
        redId: '55d34817-7e84-4214-a7e2-226b957027f0',
        blueId: 'b525929b-4826-4962-af8e-1b0f73c1d886',
        winnerId: '55d34817-7e84-4214-a7e2-226b957027f0',
        redOdds: -150,
        blueOdds: 120,
      }, // Almeida vs Blaydes
      'd98edcb4-a136-4c10-be7b-bef40cfa3e70': {
        redId: '46fae21f-af70-4228-87c8-ca3c721046a0',
        blueId: 'c51a026e-ae1e-4389-a56e-a0092a8af1ae',
        winnerId: '46fae21f-af70-4228-87c8-ca3c721046a0',
        redOdds: -140,
        blueOdds: 115,
      }, // Gaethje vs Chandler
      'aba7e46a-c088-4445-846d-0ef692206afd': {
        redId: 'bbb8eb57-d98a-4cea-a505-42d63a1a8153',
        blueId: '4037514d-1e20-41f1-8354-6385f125bc48',
        winnerId: 'bbb8eb57-d98a-4cea-a505-42d63a1a8153',
        redOdds: -350,
        blueOdds: 275,
      }, // Chimaev vs Costa
      'c1072c6e-9d2b-4c2c-9e68-62e27a42dd42': {
        redId: 'f572ffab-b514-4e6d-95b4-27136587735b',
        blueId: '30cc78d3-1938-493d-a26c-ee15d0e0fd3e',
        winnerId: '30cc78d3-1938-493d-a26c-ee15d0e0fd3e',
        redOdds: 130,
        blueOdds: -160,
      }, // Blachowicz vs Hill
      'd9ed6fee-2483-401c-a0d1-b3dc6a0d66f4': {
        redId: 'a99d4d64-add1-4ed8-b3a3-049a3054dc27',
        blueId: '0b21b4a8-596c-4c9e-89b9-d929e2e967ba',
        winnerId: 'a99d4d64-add1-4ed8-b3a3-049a3054dc27',
        redOdds: -120,
        blueOdds: 100,
      }, // Brady vs Burns
    };

    await client.query(
      `INSERT INTO league_events (league_id, event_id, is_scoring, staking_settled) VALUES ($1,$2,true,true)`,
      [LID, E1],
    );

    // All fight metadata merged — must be defined before helpers
    const allFights: Record<
      string,
      { redId: string; blueId: string; winnerId: string; redOdds: number; blueOdds: number }
    > = {
      ...e1Fights,
      // e2Fights populated below after odds are seeded — we fill in now since values are known
      '8dd66afe-1bbb-47ef-b00e-415477fc2020': {
        redId: '686877f6-7f5a-482e-9353-3bd13eca5934',
        blueId: '14ac2faa-ab16-49dd-a526-bbf4bf62f7dc',
        winnerId: '686877f6-7f5a-482e-9353-3bd13eca5934',
        redOdds: -250,
        blueOdds: 200,
      },
      'd5bec2f9-f67f-48e4-9602-faa09c2728af': {
        redId: 'f2dfb52d-854c-4149-b825-f1d50e824006',
        blueId: '9fd54947-12a0-41f9-aefa-f8fbc3fb2cd8',
        winnerId: '9fd54947-12a0-41f9-aefa-f8fbc3fb2cd8',
        redOdds: -130,
        blueOdds: 110,
      },
      'c301a06f-fe06-4444-9694-5e72149fd35f': {
        redId: 'bc904cbd-a032-471c-b9c0-a9f059ca25c5',
        blueId: '2dd2f348-5aaf-4f43-b63d-9259ecb85583',
        winnerId: 'bc904cbd-a032-471c-b9c0-a9f059ca25c5',
        redOdds: -180,
        blueOdds: 150,
      },
      '635ef4fb-3a09-424d-96f8-501ec561dc01': {
        redId: 'c136f680-10a3-48fb-9d85-66481c9be3ea',
        blueId: '228469ad-745f-46b5-9295-7b7c85dade62',
        winnerId: '228469ad-745f-46b5-9295-7b7c85dade62',
        redOdds: -500,
        blueOdds: 400,
      },
      'd84fe982-56bf-4ecb-a25c-9d505d848f79': {
        redId: '9443ce16-7a7c-4132-9aab-222bb235f578',
        blueId: 'df7b4f09-5258-4c6b-8bf4-9940fbd70353',
        winnerId: 'df7b4f09-5258-4c6b-8bf4-9940fbd70353',
        redOdds: -200,
        blueOdds: 165,
      },
      'e3a66279-8334-4ddb-ad2c-f5c40ade12ed': {
        redId: '63ca78c9-fb5c-4b34-8bbb-bde9fe007022',
        blueId: '76a7afca-adb9-4788-b68e-e4b93d797557',
        winnerId: '76a7afca-adb9-4788-b68e-e4b93d797557',
        redOdds: 120,
        blueOdds: -145,
      },
    };

    // Singles helper
    async function single(
      eventId: string,
      memberId: string,
      fightId: string,
      fighterId: string,
      stake: number,
      isRed: boolean,
    ) {
      const fight = allFights[fightId];
      const american = isRed ? fight.redOdds : fight.blueOdds;
      const won = fighterId === fight.winnerId;
      const pot = payout(stake, american);
      const actualPayout = won ? pot : 0;
      const profitLoss = actualPayout - stake;
      await client.query(
        `
        INSERT INTO staking_singles
          (league_id, event_id, member_id, fight_id, fighter_id, odds, stake, potential_payout, actual_payout, profit_loss, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (league_id, event_id, member_id, fight_id) DO UPDATE SET
          fighter_id=EXCLUDED.fighter_id, odds=EXCLUDED.odds, stake=EXCLUDED.stake,
          potential_payout=EXCLUDED.potential_payout, actual_payout=EXCLUDED.actual_payout,
          profit_loss=EXCLUDED.profit_loss, status=EXCLUDED.status
      `,
        [
          LID,
          eventId,
          memberId,
          fightId,
          fighterId,
          american,
          stake,
          pot,
          actualPayout,
          profitLoss,
          won ? 'won' : 'lost',
        ],
      );
      return { profitLoss, won };
    }

    // Parlay helper
    async function parlay(
      eventId: string,
      memberId: string,
      stake: number,
      legs: { fightId: string; fighterId: string; isRed: boolean }[],
    ) {
      const combinedDec = legs.reduce((acc, l) => {
        const fight = allFights[l.fightId];
        const american = l.isRed ? fight.redOdds : fight.blueOdds;
        return acc * dec(american);
      }, 1);
      const allWon = legs.every((l) => {
        const fight = allFights[l.fightId];
        return l.fighterId === fight.winnerId;
      });
      const pot = Math.round(stake * combinedDec * 100) / 100;
      const actualPayout = allWon ? pot : 0;
      const profitLoss = actualPayout - stake;
      const {
        rows: [pr],
      } = await client.query(
        `
        INSERT INTO staking_parlays
          (league_id, event_id, member_id, stake, decimal_odds, potential_payout, actual_payout, profit_loss, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (league_id, event_id, member_id) DO UPDATE SET
          stake=EXCLUDED.stake, decimal_odds=EXCLUDED.decimal_odds, potential_payout=EXCLUDED.potential_payout,
          actual_payout=EXCLUDED.actual_payout, profit_loss=EXCLUDED.profit_loss, status=EXCLUDED.status
        RETURNING id
      `,
        [
          LID,
          eventId,
          memberId,
          stake,
          combinedDec,
          pot,
          actualPayout,
          profitLoss,
          allWon ? 'won' : 'lost',
        ],
      );
      for (const l of legs) {
        const fight = allFights[l.fightId];
        const american = l.isRed ? fight.redOdds : fight.blueOdds;
        const result = l.fighterId === fight.winnerId ? 'won' : 'lost';
        await client.query(
          `
          INSERT INTO staking_parlay_legs (parlay_id, fight_id, fighter_id, odds, decimal_odds, result)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (parlay_id, fight_id) DO UPDATE SET fighter_id=EXCLUDED.fighter_id, result=EXCLUDED.result
        `,
          [pr.id, l.fightId, l.fighterId, american, dec(american), result],
        );
      }
      return { profitLoss, won: allWon };
    }

    // --- Event 1 bets ---
    // Thunder Bets: Della Maddalena $20 ✓, Chimaev $15 ✓, parlay Gaethje+Hill $10 ✓
    const t1_s1 = await single(
      E1,
      THUNDER,
      'a608e223-4f9b-42ad-8896-5a69bf814237',
      e1Fights['a608e223-4f9b-42ad-8896-5a69bf814237'].redId,
      20,
      true,
    );
    const t1_s2 = await single(
      E1,
      THUNDER,
      'aba7e46a-c088-4445-846d-0ef692206afd',
      e1Fights['aba7e46a-c088-4445-846d-0ef692206afd'].redId,
      15,
      true,
    );
    const t1_p = await parlay(E1, THUNDER, 10, [
      {
        fightId: 'd98edcb4-a136-4c10-be7b-bef40cfa3e70',
        fighterId: e1Fights['d98edcb4-a136-4c10-be7b-bef40cfa3e70'].redId,
        isRed: true,
      },
      {
        fightId: 'c1072c6e-9d2b-4c2c-9e68-62e27a42dd42',
        fighterId: e1Fights['c1072c6e-9d2b-4c2c-9e68-62e27a42dd42'].blueId,
        isRed: false,
      },
    ]);
    const thunderE1PL = t1_s1.profitLoss + t1_s2.profitLoss + t1_p.profitLoss;
    console.log(
      `Thunder E1 P&L: ${thunderE1PL.toFixed(2)} (singles: ${t1_s1.won ? 'W' : 'L'},${t1_s2.won ? 'W' : 'L'} parlay:${t1_p.won ? 'W' : 'L'})`,
    );

    // Yellow Flash: Costa $10 ✗, Brady $20 ✓
    const y1_s1 = await single(
      E1,
      YELLOW,
      'aba7e46a-c088-4445-846d-0ef692206afd',
      e1Fights['aba7e46a-c088-4445-846d-0ef692206afd'].blueId,
      10,
      false,
    );
    const y1_s2 = await single(
      E1,
      YELLOW,
      'd9ed6fee-2483-401c-a0d1-b3dc6a0d66f4',
      e1Fights['d9ed6fee-2483-401c-a0d1-b3dc6a0d66f4'].redId,
      20,
      true,
    );
    const yellowE1PL = y1_s1.profitLoss + y1_s2.profitLoss;
    console.log(
      `Yellow E1 P&L: ${yellowE1PL.toFixed(2)} (${y1_s1.won ? 'W' : 'L'},${y1_s2.won ? 'W' : 'L'})`,
    );

    // Red Rockets: Blachowicz $15 ✗, Almeida $20 ✓
    const r1_s1 = await single(
      E1,
      RED,
      'c1072c6e-9d2b-4c2c-9e68-62e27a42dd42',
      e1Fights['c1072c6e-9d2b-4c2c-9e68-62e27a42dd42'].redId,
      15,
      true,
    );
    const r1_s2 = await single(
      E1,
      RED,
      '1a0da55b-ca6a-4074-92ad-7b84749a654e',
      e1Fights['1a0da55b-ca6a-4074-92ad-7b84749a654e'].redId,
      20,
      true,
    );
    const redE1PL = r1_s1.profitLoss + r1_s2.profitLoss;
    console.log(
      `Red E1 P&L: ${redE1PL.toFixed(2)} (${r1_s1.won ? 'W' : 'L'},${r1_s2.won ? 'W' : 'L'})`,
    );

    // Green Gamblers: Hill $25 ✓, parlay Della Maddalena+Almeida $15 ✓
    const g1_s1 = await single(
      E1,
      GREEN,
      'c1072c6e-9d2b-4c2c-9e68-62e27a42dd42',
      e1Fights['c1072c6e-9d2b-4c2c-9e68-62e27a42dd42'].blueId,
      25,
      false,
    );
    const g1_p = await parlay(E1, GREEN, 15, [
      {
        fightId: 'a608e223-4f9b-42ad-8896-5a69bf814237',
        fighterId: e1Fights['a608e223-4f9b-42ad-8896-5a69bf814237'].redId,
        isRed: true,
      },
      {
        fightId: '1a0da55b-ca6a-4074-92ad-7b84749a654e',
        fighterId: e1Fights['1a0da55b-ca6a-4074-92ad-7b84749a654e'].redId,
        isRed: true,
      },
    ]);
    const greenE1PL = g1_s1.profitLoss + g1_p.profitLoss;
    console.log(
      `Green E1 P&L: ${greenE1PL.toFixed(2)} (${g1_s1.won ? 'W' : 'L'} parlay:${g1_p.won ? 'W' : 'L'})`,
    );

    // Matchup 1 with scores and winner
    const {
      rows: [m1a],
    } = await client.query(
      `
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, home_score, away_score)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `,
      [LID, E1, THUNDER, YELLOW, thunderE1PL, yellowE1PL],
    );
    await client.query(`UPDATE matchups SET winner_id=$1 WHERE id=$2`, [
      thunderE1PL > yellowE1PL ? THUNDER : YELLOW,
      m1a.id,
    ]);

    const {
      rows: [m1b],
    } = await client.query(
      `
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, home_score, away_score)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `,
      [LID, E1, RED, GREEN, redE1PL, greenE1PL],
    );
    await client.query(`UPDATE matchups SET winner_id=$1 WHERE id=$2`, [
      redE1PL > greenE1PL ? RED : GREEN,
      m1b.id,
    ]);

    // Credit weekly budget after event 1
    const e1NetByMember = [
      [THUNDER, thunderE1PL],
      [YELLOW, yellowE1PL],
      [RED, redE1PL],
      [GREEN, greenE1PL],
    ];
    for (const [mid, netPL] of e1NetByMember) {
      // Net P&L (winnings already credited via payout) + weekly budget top-up
      // Since these are historical settled bets, we add net P&L + budget credit to current balance
      await client.query(
        `UPDATE league_members SET staking_balance = staking_balance + $1 + 100 WHERE id = $2`,
        [netPL, mid],
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT 2: Sterling vs. Zalal (80fe0cdb)
    // Need to add odds to fights with null
    // ─────────────────────────────────────────────────────────────────────────
    const E2 = '80fe0cdb-20d6-4c64-8db7-7a842ce7cf70';

    // Seed odds for Sterling event fights (most were null)
    const e2Odds: Record<string, [number, number]> = {
      '8dd66afe-1bbb-47ef-b00e-415477fc2020': [-250, 200], // Sterling vs Zalal
      'd5bec2f9-f67f-48e4-9602-faa09c2728af': [-130, 110], // Hernandez vs Garcia
      'c301a06f-fe06-4444-9694-5e72149fd35f': [-180, 150], // Grant vs Luna
      'd84fe982-56bf-4ecb-a25c-9d505d848f79': [-200, 165], // Spann vs Buchecha
      'e3a66279-8334-4ddb-ad2c-f5c40ade12ed': [120, -145], // McConico vs Vieira
      // 635ef4fb already has blueOdds=+400 in DB, add red
    };
    for (const [fid, [r, b]] of Object.entries(e2Odds)) {
      await client.query(
        `UPDATE fights SET red_fighter_odds=$1, blue_fighter_odds=$2 WHERE id=$3`,
        [r, b, fid],
      );
    }
    // Barcelos vs Jackson: only blue was set (+400), add red
    await client.query(
      `UPDATE fights SET red_fighter_odds=-500 WHERE id='635ef4fb-3a09-424d-96f8-501ec561dc01'`,
    );

    await client.query(
      `INSERT INTO league_events (league_id, event_id, is_scoring, staking_settled) VALUES ($1,$2,true,true)`,
      [LID, E2],
    );

    // --- Event 2 bets ---
    // Thunder Bets: Sterling $30 ✓, Jackson $5 ✓ (upset pick!)
    const t2_s1 = await single(
      E2,
      THUNDER,
      '8dd66afe-1bbb-47ef-b00e-415477fc2020',
      allFights['8dd66afe-1bbb-47ef-b00e-415477fc2020'].redId,
      30,
      true,
    );
    const t2_s2 = await single(
      E2,
      THUNDER,
      '635ef4fb-3a09-424d-96f8-501ec561dc01',
      allFights['635ef4fb-3a09-424d-96f8-501ec561dc01'].blueId,
      5,
      false,
    );
    const thunderE2PL = t2_s1.profitLoss + t2_s2.profitLoss;
    console.log(
      `Thunder E2 P&L: ${thunderE2PL.toFixed(2)} (${t2_s1.won ? 'W' : 'L'},${t2_s2.won ? 'W' : 'L'})`,
    );

    // Yellow Flash: Hernandez $20 ✗, Buchecha $15 ✓
    const y2_s1 = await single(
      E2,
      YELLOW,
      'd5bec2f9-f67f-48e4-9602-faa09c2728af',
      allFights['d5bec2f9-f67f-48e4-9602-faa09c2728af'].redId,
      20,
      true,
    );
    const y2_s2 = await single(
      E2,
      YELLOW,
      'd84fe982-56bf-4ecb-a25c-9d505d848f79',
      allFights['d84fe982-56bf-4ecb-a25c-9d505d848f79'].blueId,
      15,
      false,
    );
    const yellowE2PL = y2_s1.profitLoss + y2_s2.profitLoss;
    console.log(
      `Yellow E2 P&L: ${yellowE2PL.toFixed(2)} (${y2_s1.won ? 'W' : 'L'},${y2_s2.won ? 'W' : 'L'})`,
    );

    // Red Rockets: Barcelos $40 ✗ (upset!), Vieira $20 ✓
    const r2_s1 = await single(
      E2,
      RED,
      '635ef4fb-3a09-424d-96f8-501ec561dc01',
      allFights['635ef4fb-3a09-424d-96f8-501ec561dc01'].redId,
      40,
      true,
    );
    const r2_s2 = await single(
      E2,
      RED,
      'e3a66279-8334-4ddb-ad2c-f5c40ade12ed',
      allFights['e3a66279-8334-4ddb-ad2c-f5c40ade12ed'].blueId,
      20,
      false,
    );
    const redE2PL = r2_s1.profitLoss + r2_s2.profitLoss;
    console.log(
      `Red E2 P&L: ${redE2PL.toFixed(2)} (${r2_s1.won ? 'W' : 'L'},${r2_s2.won ? 'W' : 'L'})`,
    );

    // Green Gamblers: Buchecha $20 ✓, parlay Sterling+Grant $20 ✓
    const g2_s1 = await single(
      E2,
      GREEN,
      'd84fe982-56bf-4ecb-a25c-9d505d848f79',
      allFights['d84fe982-56bf-4ecb-a25c-9d505d848f79'].blueId,
      20,
      false,
    );
    const g2_p = await parlay(E2, GREEN, 20, [
      {
        fightId: '8dd66afe-1bbb-47ef-b00e-415477fc2020',
        fighterId: allFights['8dd66afe-1bbb-47ef-b00e-415477fc2020'].redId,
        isRed: true,
      },
      {
        fightId: 'c301a06f-fe06-4444-9694-5e72149fd35f',
        fighterId: allFights['c301a06f-fe06-4444-9694-5e72149fd35f'].redId,
        isRed: true,
      },
    ]);
    const greenE2PL = g2_s1.profitLoss + g2_p.profitLoss;
    console.log(
      `Green E2 P&L: ${greenE2PL.toFixed(2)} (${g2_s1.won ? 'W' : 'L'} parlay:${g2_p.won ? 'W' : 'L'})`,
    );

    // Matchups for event 2
    const {
      rows: [m2a],
    } = await client.query(
      `
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, home_score, away_score)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `,
      [LID, E2, THUNDER, YELLOW, thunderE2PL, yellowE2PL],
    );
    await client.query(`UPDATE matchups SET winner_id=$1 WHERE id=$2`, [
      thunderE2PL > yellowE2PL ? THUNDER : YELLOW,
      m2a.id,
    ]);

    const {
      rows: [m2b],
    } = await client.query(
      `
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, home_score, away_score)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `,
      [LID, E2, RED, GREEN, redE2PL, greenE2PL],
    );
    await client.query(`UPDATE matchups SET winner_id=$1 WHERE id=$2`, [
      redE2PL > greenE2PL ? RED : GREEN,
      m2b.id,
    ]);

    // Credit net P&L + weekly budget for event 2
    const e2NetByMember = [
      [THUNDER, thunderE2PL],
      [YELLOW, yellowE2PL],
      [RED, redE2PL],
      [GREEN, greenE2PL],
    ];
    for (const [mid, netPL] of e2NetByMember) {
      await client.query(
        `UPDATE league_members SET staking_balance = staking_balance + $1 + 100 WHERE id = $2`,
        [netPL, mid],
      );
    }

    // Update wins/losses on league_members from matchup outcomes
    // event 1
    await client.query(`UPDATE league_members SET wins=wins+1 WHERE id=$1`, [
      thunderE1PL > yellowE1PL ? THUNDER : YELLOW,
    ]);
    await client.query(`UPDATE league_members SET losses=losses+1 WHERE id=$1`, [
      thunderE1PL > yellowE1PL ? YELLOW : THUNDER,
    ]);
    await client.query(`UPDATE league_members SET wins=wins+1 WHERE id=$1`, [
      redE1PL > greenE1PL ? RED : GREEN,
    ]);
    await client.query(`UPDATE league_members SET losses=losses+1 WHERE id=$1`, [
      redE1PL > greenE1PL ? GREEN : RED,
    ]);
    // event 2
    await client.query(`UPDATE league_members SET wins=wins+1 WHERE id=$1`, [
      thunderE2PL > yellowE2PL ? THUNDER : YELLOW,
    ]);
    await client.query(`UPDATE league_members SET losses=losses+1 WHERE id=$1`, [
      thunderE2PL > yellowE2PL ? YELLOW : THUNDER,
    ]);
    await client.query(`UPDATE league_members SET wins=wins+1 WHERE id=$1`, [
      redE2PL > greenE2PL ? RED : GREEN,
    ]);
    await client.query(`UPDATE league_members SET losses=losses+1 WHERE id=$1`, [
      redE2PL > greenE2PL ? GREEN : RED,
    ]);

    await client.query('COMMIT');
    console.log('\nPast events seeded successfully!');

    // Print final state
    const { rows: final } = await db.query(
      `SELECT team_name, staking_balance, wins, losses FROM league_members WHERE league_id=$1 ORDER BY staking_balance DESC`,
      [LID],
    );
    console.log('\nFinal standings:');
    for (const m of final) {
      console.log(
        `  ${m.team_name}: $${parseFloat(m.staking_balance).toFixed(2)}  W${m.wins}-L${m.losses}`,
      );
    }
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
