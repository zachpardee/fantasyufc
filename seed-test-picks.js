// seed-test-picks.js
// Creates test matchup + picks for Barboza (past, scored) and Song vs Figueiredo (upcoming, unscored)
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

const LEAGUE_ID   = '7469743f-3366-4a1c-bfe0-68ce80465612';
const MEMBER_1    = '18baa248-ad78-4aa5-b918-09f6ae8099e4'; // Zach (home)
const MEMBER_2    = 'cb17e0f9-9538-4128-bda8-70e29bcba265'; // Zach (away)

// Past event — Barboza vs. Murphy (already in DB as completed)
const BARBOZA_EVENT_ID = '900053d0-38c2-4d03-9f09-3bd5943d0a56';

// Tonight's event — Song vs. Figueiredo
const SONG_EVENT_ID    = '5f8bfb5f-289b-45f9-a35a-93fcf413d01b';
const SONG_MATCHUP_ID  = 'a03c3308-cf50-4ef9-88e0-2931308f0442';

// Weight class IDs
const WC = {
  heavyweight:       'c7ef390e-8eae-4ca5-8a47-9cfb9bc48443',
  lightHeavyweight:  'dce34903-fdfe-4f4a-a381-347155a8f5f0',
  middleweight:      'ab0aa149-6a4a-4e43-8173-3d4edd7a56b1',
  welterweight:      '9f812ac6-2cbf-4cc6-92ee-f993043fd31c',
  lightweight:       '787b134d-8cd5-4bee-bf98-8442e22cf972',
};

// Fighters (from DB, not on any roster)
const F = {
  dellaMaddalena: '98d488e8-a3f4-403a-b281-8a8b3ad281ab',
  covington:      'e4607afe-6fc2-4677-8bb7-c12976f0dc1e',
  almeida:        '55d34817-7e84-4214-a7e2-226b957027f0',
  blaydes:        'b525929b-4826-4962-af8e-1b0f73c1d886',
  gaethje:        '46fae21f-af70-4228-87c8-ca3c721046a0',
  chandler:       'c51a026e-ae1e-4389-a56e-a0092a8af1ae',
  chimaev:        'bbb8eb57-d98a-4cea-a505-42d63a1a8153',
  costa:          '4037514d-1e20-41f1-8354-6385f125bc48',
  blachowicz:     'f572ffab-b514-4e6d-95b4-27136587735b',
  hill:           '30cc78d3-1938-493d-a26c-ee15d0e0fd3e',
  brady:          'a99d4d64-add1-4ed8-b3a3-049a3054dc27',
  burns:          '0b21b4a8-596c-4c9e-89b9-d929e2e967ba',
};

// Song vs Figueiredo fight IDs
const SONG_FIGHTS = {
  f1: '232f53e3-0709-4338-ade6-c17db20f326d', // Song Yadong (red) vs Figueiredo (blue), bout 13
  f2: '5493a2bd-2279-4099-8f6e-62a5ad59a4ad', // Menifield (red) vs Zhang (blue), bout 12
  f3: '1f8be1cb-1269-44f2-90a1-2bd415bb9edc', // Pavlovich (red) vs Teixeira (blue), bout 11
  f4: 'e82a2121-a622-4245-a503-3ae00672d338', // Asakura (red) vs Smotherman (blue), bout 10
  f5: '415b1009-d169-47c5-b602-a472f708b6f6', // Matthews (red) vs Salikhov (blue), bout 9
  f6: 'b5fcf8fc-231f-4372-9f01-032241550c17', // Perez (red) vs Sumudaerji (blue), bout 8
};
const SONG_RED = {
  f1: '84bf051c-4eef-4584-9628-6fd1b07e5e0f', // Song Yadong
  f2: '45c444c7-9f34-4af9-92b0-b78c1ce4949b', // Menifield
  f3: 'd976d1a6-daff-4de3-8b6b-ed852b4bf5e3', // Pavlovich
  f4: 'f9ecf4da-ba1a-4eed-b1a9-db5c248a14f2', // Asakura
  f5: 'ef685ae4-389b-4bff-b472-4263f39f67db', // Matthews
  f6: 'cb537fe8-57d5-4210-9c4a-85b982e60dbd', // Alex Perez
};
const SONG_BLUE = {
  f1: '42c3001b-1373-4912-bf6d-0865c9dadc9c', // Figueiredo
  f2: '4bcf399f-8efb-4efb-b40f-29960c435dac', // Zhang Mingyang
  f3: '48161457-35ba-4899-bc06-f854be3541dc', // Teixeira
  f4: '40b8d735-3f96-4ddc-9404-9e783446f2d5', // Smotherman
  f5: 'a6b45771-e159-44e4-b7bb-c5b76ccb640a', // Salikhov
  f6: '2dd6fedb-ffdb-4bb0-ba4c-3742c3b824fb', // Sumudaerji
};

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // ── 1. Clear any existing test data for these events ────────────────────
    await client.query(`DELETE FROM event_picks WHERE league_id = $1 AND fight_id IN (
      SELECT id FROM fights WHERE event_id = $2
    )`, [LEAGUE_ID, BARBOZA_EVENT_ID]);
    await client.query(`DELETE FROM event_picks WHERE league_id = $1 AND fight_id IN (
      SELECT id FROM fights WHERE event_id = $2
    )`, [LEAGUE_ID, SONG_EVENT_ID]);
    await client.query(`DELETE FROM fight_results WHERE fight_id IN (SELECT id FROM fights WHERE event_id = $1)`, [BARBOZA_EVENT_ID]);
    await client.query(`DELETE FROM fights WHERE event_id = $1`, [BARBOZA_EVENT_ID]);
    await client.query(`DELETE FROM matchups WHERE league_id = $1 AND event_id = $2`, [LEAGUE_ID, BARBOZA_EVENT_ID]);
    await client.query(`DELETE FROM league_events WHERE league_id = $1 AND event_id = $2`, [LEAGUE_ID, BARBOZA_EVENT_ID]);
    console.log('Cleared old Barboza data');

    // ── 2. Build fights for Barboza event ───────────────────────────────────
    const barbozaFights = [
      { red: F.dellaMaddalena, blue: F.covington,  wc: WC.welterweight,      isMain: true,  isCo: false, order: 13, winner: F.dellaMaddalena, outcome: 'ko_tko',              redOdds: -200, blueOdds: 165 },
      { red: F.almeida,        blue: F.blaydes,    wc: WC.heavyweight,       isMain: false, isCo: true,  order: 12, winner: F.almeida,        outcome: 'submission',           redOdds: -150, blueOdds: 120 },
      { red: F.gaethje,        blue: F.chandler,   wc: WC.lightweight,       isMain: false, isCo: false, order: 11, winner: F.gaethje,        outcome: 'ko_tko',               redOdds: -140, blueOdds: 115 },
      { red: F.chimaev,        blue: F.costa,      wc: WC.middleweight,      isMain: false, isCo: false, order: 10, winner: F.chimaev,        outcome: 'decision_unanimous',   redOdds: -350, blueOdds: 275 },
      { red: F.blachowicz,     blue: F.hill,       wc: WC.lightHeavyweight,  isMain: false, isCo: false, order:  9, winner: F.hill,           outcome: 'ko_tko',               redOdds: 130,  blueOdds: -160 },
      { red: F.brady,          blue: F.burns,      wc: WC.welterweight,      isMain: false, isCo: false, order:  8, winner: F.brady,          outcome: 'decision_unanimous',   redOdds: -120, blueOdds: 100 },
    ];

    const fightIds = [];
    for (const f of barbozaFights) {
      const { rows: [fight] } = await client.query(`
        INSERT INTO fights (event_id, weight_class_id, red_fighter_id, blue_fighter_id,
          is_main_event, is_co_main, bout_order, card_segment, scheduled_rounds,
          status, red_fighter_odds, blue_fighter_odds)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,5,'completed',$9,$10)
        RETURNING id
      `, [BARBOZA_EVENT_ID, f.wc, f.red, f.blue, f.isMain, f.isCo, f.order,
          f.order >= 11 ? 'main' : f.order >= 8 ? 'prelims' : 'early_prelims',
          f.redOdds, f.blueOdds]);
      fightIds.push({ id: fight.id, ...f });
    }
    console.log('Created', fightIds.length, 'Barboza fights');

    // ── 3. Fight results for Barboza ─────────────────────────────────────────
    for (const f of fightIds) {
      const side = f.winner === f.red ? 'red' : 'blue';
      await client.query(`
        INSERT INTO fight_results (fight_id, winner_id, winner_side, outcome, ending_round, ending_time_seconds)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [f.id, f.winner, side, f.outcome,
          f.outcome === 'ko_tko' || f.outcome === 'submission' ? 2 : 3,
          f.outcome === 'ko_tko' ? 187 : f.outcome === 'submission' ? 243 : 0]);
    }
    console.log('Created fight results for Barboza');

    // ── 4. Add Barboza to league schedule ────────────────────────────────────
    await client.query(`
      INSERT INTO league_events (league_id, event_id, is_scoring)
      VALUES ($1,$2,true)
      ON CONFLICT DO NOTHING
    `, [LEAGUE_ID, BARBOZA_EVENT_ID]);

    // ── 5. Create matchup for Barboza ────────────────────────────────────────
    const { rows: [barbozaMatchup] } = await client.query(`
      INSERT INTO matchups (league_id, event_id, home_team_id, away_team_id, home_score, away_score)
      VALUES ($1,$2,$3,$4,0,0)
      RETURNING id
    `, [LEAGUE_ID, BARBOZA_EVENT_ID, MEMBER_1, MEMBER_2]);
    console.log('Created Barboza matchup:', barbozaMatchup.id);

    // ── 6. Picks for Barboza (Member 1) ──────────────────────────────────────
    // Member 1 picks: 4 correct (3 with method, 1 without), 2 wrong → 300+300+300+200+0+300 = 1400
    const m1Picks = [
      { fightIdx: 0, pickerId: F.dellaMaddalena, method: 'ko_tko' },              // ✓✓ 300
      { fightIdx: 1, pickerId: F.almeida,         method: 'decision' },            // ✓  200 (wrong method)
      { fightIdx: 2, pickerId: F.gaethje,         method: 'ko_tko' },              // ✓✓ 300
      { fightIdx: 3, pickerId: F.chimaev,         method: 'decision' },            // ✓✓ 300
      { fightIdx: 4, pickerId: F.blachowicz,      method: 'decision' },            // ✗   0
      { fightIdx: 5, pickerId: F.brady,           method: 'decision' },            // ✓✓ 300
    ];

    // Member 2 picks: 4 correct (3 with method, 1 without), 2 wrong → 300+200+300+300+0+0 = 1100
    const m2Picks = [
      { fightIdx: 0, pickerId: F.covington,       method: 'decision' },            // ✗   0
      { fightIdx: 1, pickerId: F.almeida,         method: 'submission' },          // ✓✓ 300
      { fightIdx: 2, pickerId: F.gaethje,         method: 'ko_tko' },              // ✓✓ 300
      { fightIdx: 3, pickerId: F.chimaev,         method: 'ko_tko' },              // ✓  200 (wrong method)
      { fightIdx: 4, pickerId: F.hill,            method: 'ko_tko' },              // ✓✓ 300
      { fightIdx: 5, pickerId: F.burns,           method: 'submission' },          // ✗   0
    ];

    function isMethodMatch(picked, outcome) {
      if (picked === outcome) return true;
      if (picked === 'decision' && ['decision_unanimous','decision_split','decision_majority'].includes(outcome)) return true;
      return false;
    }

    let m1Score = 0, m2Score = 0;

    for (const p of m1Picks) {
      const f = fightIds[p.fightIdx];
      const correct = p.pickerId === f.winner;
      const methodOk = correct && isMethodMatch(p.method, f.outcome);
      const pts = methodOk ? 300 : correct ? 200 : 0;
      m1Score += pts;
      await client.query(`
        INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method, is_correct, points_earned)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [LEAGUE_ID, MEMBER_1, f.id, p.pickerId, p.method, correct, pts]);
    }

    for (const p of m2Picks) {
      const f = fightIds[p.fightIdx];
      const correct = p.pickerId === f.winner;
      const methodOk = correct && isMethodMatch(p.method, f.outcome);
      const pts = methodOk ? 300 : correct ? 200 : 0;
      m2Score += pts;
      await client.query(`
        INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method, is_correct, points_earned)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [LEAGUE_ID, MEMBER_2, f.id, p.pickerId, p.method, correct, pts]);
    }

    console.log(`Barboza picks — Member 1: ${m1Score}pts, Member 2: ${m2Score}pts`);

    // ── 7. Update Barboza matchup scores & winner ────────────────────────────
    const winnerId = m1Score > m2Score ? MEMBER_1 : m2Score > m1Score ? MEMBER_2 : null;
    await client.query(`
      UPDATE matchups SET home_score=$1, away_score=$2, winner_id=$3
      WHERE id=$4
    `, [m1Score, m2Score, winnerId, barbozaMatchup.id]);
    console.log('Updated Barboza matchup scores');

    // ── 8. Picks for Song vs Figueiredo (both members, pre-event) ────────────
    // Clear any existing picks first
    await client.query(`DELETE FROM event_picks WHERE league_id=$1 AND fight_id IN ($2,$3,$4,$5,$6,$7)`,
      [LEAGUE_ID, ...Object.values(SONG_FIGHTS)]);

    const songM1Picks = [
      { id: SONG_FIGHTS.f1, pickerId: SONG_RED.f1, method: 'ko_tko' },      // Song Yadong
      { id: SONG_FIGHTS.f2, pickerId: SONG_RED.f2, method: 'ko_tko' },      // Menifield
      { id: SONG_FIGHTS.f3, pickerId: SONG_RED.f3, method: 'ko_tko' },      // Pavlovich
      { id: SONG_FIGHTS.f4, pickerId: SONG_RED.f4, method: 'decision' },    // Asakura
      { id: SONG_FIGHTS.f5, pickerId: SONG_RED.f5, method: 'decision' },    // Matthews
      { id: SONG_FIGHTS.f6, pickerId: SONG_RED.f6, method: 'decision' },    // Alex Perez
    ];

    const songM2Picks = [
      { id: SONG_FIGHTS.f1, pickerId: SONG_BLUE.f1, method: 'submission' }, // Figueiredo
      { id: SONG_FIGHTS.f2, pickerId: SONG_BLUE.f2, method: 'ko_tko' },     // Zhang Mingyang
      { id: SONG_FIGHTS.f3, pickerId: SONG_RED.f3,  method: 'ko_tko' },     // Pavlovich (same pick)
      { id: SONG_FIGHTS.f4, pickerId: SONG_RED.f4,  method: 'ko_tko' },     // Asakura (different method)
      { id: SONG_FIGHTS.f5, pickerId: SONG_BLUE.f5, method: 'ko_tko' },     // Salikhov
      { id: SONG_FIGHTS.f6, pickerId: SONG_RED.f6,  method: 'ko_tko' },     // Alex Perez (same fighter)
    ];

    for (const p of songM1Picks) {
      await client.query(`
        INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (league_id, member_id, fight_id) DO UPDATE SET picked_fighter_id=$4, picked_method=$5
      `, [LEAGUE_ID, MEMBER_1, p.id, p.pickerId, p.method]);
    }

    for (const p of songM2Picks) {
      await client.query(`
        INSERT INTO event_picks (league_id, member_id, fight_id, picked_fighter_id, picked_method)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (league_id, member_id, fight_id) DO UPDATE SET picked_fighter_id=$4, picked_method=$5
      `, [LEAGUE_ID, MEMBER_2, p.id, p.pickerId, p.method]);
    }

    console.log('Created Song vs Figueiredo picks for both members');

    await client.query('COMMIT');
    console.log('\nDone!');
    console.log(`Barboza matchup: Member 1 wins ${m1Score}-${m2Score}`);
    console.log('Song picks: both members have submitted picks for all 6 fights');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
