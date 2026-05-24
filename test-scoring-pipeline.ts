/**
 * Validates the automated scoring pipeline before a live event.
 * Usage: npx tsx test-scoring-pipeline.ts
 *
 * Checks:
 *   1. ESPN scoreboard is reachable and returns upcoming UFC events
 *   2. Those events exist in our DB with fights and fighter IDs
 *   3. SportsDB can find a recent completed UFC event (name lookup)
 *   4. processFightResult works correctly against a past fight result
 */

import { db } from './apps/api/src/config/database';
import { fetchUpcomingEvents, fetchEventsByDate } from './apps/api/src/services/espn.adapter';
import { searchEventResults } from './apps/api/src/services/sportsdb.adapter';
import { syncEvents } from './apps/api/src/jobs/eventSync.job';

async function main() {
  console.log('=== Scoring Pipeline Diagnostic ===\n');

  // ── 1. ESPN scoreboard ──────────────────────────────────────────────────
  console.log('1. Fetching ESPN scoreboard...');
  try {
    const events = await fetchUpcomingEvents();
    console.log(`   Found ${events.length} event(s) on scoreboard`);
    for (const e of events) {
      console.log(`   • [${e.status}] ${e.name} (${e.scheduledAt.slice(0, 10)}) — ${e.fights.length} fights, espnId=${e.espnEventId}`);
    }
  } catch (err) {
    console.error('   ESPN fetch FAILED:', err);
    process.exit(1);
  }

  // ── 2. Sync events into DB and show what landed ─────────────────────────
  console.log('\n2. Running eventSync...');
  try {
    await syncEvents();
    console.log('   Sync complete');
  } catch (err) {
    console.error('   Sync FAILED:', err);
  }

  // ── 3. Check upcoming events in DB ─────────────────────────────────────
  console.log('\n3. Upcoming events in DB:');
  const { rows: upcomingEvents } = await db.query(`
    SELECT e.name, e.status, e.scheduled_at, e.ufc_event_id,
           COUNT(f.id) AS fight_count,
           COUNT(CASE WHEN f.red_fighter_id IS NOT NULL AND f.blue_fighter_id IS NOT NULL THEN 1 END) AS resolved_count
    FROM ufc_events e
    LEFT JOIN fights f ON f.event_id = e.id
    WHERE e.scheduled_at > NOW() - INTERVAL '7 days'
    GROUP BY e.id
    ORDER BY e.scheduled_at
  `);

  for (const e of upcomingEvents) {
    const flag = +e.fight_count !== +e.resolved_count ? '⚠️  MISSING FIGHTER IDs' : '✅';
    console.log(`   ${flag} ${e.name} (${e.scheduled_at?.toISOString().slice(0, 10)}) — ${e.resolved_count}/${e.fight_count} fights resolved`);
  }

  // ── 4. Check fighters missing ESPN IDs (could break fighter resolution) ─
  console.log('\n4. Fights with unresolved fighters (null IDs):');
  const { rows: badFights } = await db.query(`
    SELECT e.name AS event_name, rf.first_name || ' ' || rf.last_name AS red,
           bf.first_name || ' ' || bf.last_name AS blue,
           f.status
    FROM fights f
    JOIN ufc_events e ON e.id = f.event_id
    JOIN fighters rf ON rf.id = f.red_fighter_id
    JOIN fighters bf ON bf.id = f.blue_fighter_id
    WHERE e.scheduled_at > NOW()
      AND (rf.ufc_fighter_id IS NULL OR bf.ufc_fighter_id IS NULL)
    ORDER BY e.scheduled_at, f.bout_order
    LIMIT 20
  `);

  if (badFights.length === 0) {
    console.log('   ✅ All upcoming fights have ESPN fighter IDs');
  } else {
    for (const f of badFights) {
      console.log(`   ⚠️  ${f.event_name}: ${f.red} vs ${f.blue} — missing ESPN ID`);
    }
  }

  // ── 5. SportsDB lookup ─────────────────────────────────────────────────
  console.log('\n5. Testing SportsDB (searching "UFC 309")...');
  try {
    const result = await searchEventResults('UFC 309');
    if (result) {
      console.log(`   ✅ Found: "${result.name}" — ${result.results.length} fight result(s)`);
      result.results.slice(0, 3).forEach((r) =>
        console.log(`      ${r.winnerName} def. ${r.loserName} by ${r.method} R${r.round}`),
      );
    } else {
      console.log('   ⚠️  No SportsDB results found — method enrichment will be skipped');
    }
  } catch (err) {
    console.error('   SportsDB FAILED:', err);
  }

  // ── 6. Validate a past fight result processes without error ───────────
  console.log('\n6. Testing processFightResult on an existing result...');
  const { rows: [pastResult] } = await db.query(`
    SELECT fr.id, f.id AS fight_id, rf.first_name || ' ' || rf.last_name AS winner_name,
           e.name AS event_name
    FROM fight_results fr
    JOIN fights f ON f.id = fr.fight_id
    JOIN ufc_events e ON e.id = f.event_id
    JOIN fighters rf ON rf.id = fr.winner_id
    LIMIT 1
  `);

  if (!pastResult) {
    console.log('   ⚠️  No past fight results in DB — run seed first');
  } else {
    console.log(`   Testing with: ${pastResult.event_name} — winner: ${pastResult.winner_name}`);
    try {
      const { processFightResult } = await import('./apps/api/src/services/scoring.service');
      await processFightResult(pastResult.id);
      console.log('   ✅ processFightResult completed without error');
    } catch (err) {
      console.error('   ❌ processFightResult FAILED:', err);
    }
  }

  // ── 7. League event coverage ───────────────────────────────────────────
  console.log('\n7. League event coverage:');
  const { rows: coverage } = await db.query(`
    SELECT l.name AS league, e.name AS event, e.status, le.is_scoring
    FROM league_events le
    JOIN leagues l ON l.id = le.league_id
    JOIN ufc_events e ON e.id = le.event_id
    WHERE e.scheduled_at > NOW() - INTERVAL '7 days'
    ORDER BY e.scheduled_at, l.name
  `);

  if (coverage.length === 0) {
    console.log('   ⚠️  No leagues have upcoming events scheduled — scoring will not trigger');
  } else {
    for (const c of coverage) {
      console.log(`   • ${c.league} — ${c.event} [${c.status}] scoring=${c.is_scoring}`);
    }
  }

  console.log('\n=== Done ===');
  await db.end();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
