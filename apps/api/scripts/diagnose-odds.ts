/**
 * Diagnose why a fighter has no odds.
 *
 * Usage:  tsx --env-file=.env scripts/diagnose-odds.ts [lastNameSubstring]
 * Example: tsx --env-file=.env scripts/diagnose-odds.ts chikadze
 *
 * It finds the fighter's upcoming fight(s), pulls the live the-odds-api payload for the
 * event's window, and replays the EXACT matcher from preEventPrep.job.ts so we can see
 * which step fails: (a) the book has no line, or (b) our name-matching misses it.
 */
import { db } from '../src/config/database';

const NAME = (process.argv[2] ?? 'chikadze').toLowerCase();

// ── mirror of preEventPrep.job.ts helpers ──────────────────────────────────────
const toOddsTs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

async function main() {
  console.log(`\n=== Diagnosing odds for fighter matching "${NAME}" ===\n`);

  // 1. Find the fighter's fights (red or blue) on scheduled/live events, with current odds.
  const { rows: fights } = await db.query<{
    fight_id: string;
    event_id: string;
    event_name: string;
    scheduled_at: string;
    event_status: string;
    red_first: string;
    red_last: string;
    blue_first: string;
    blue_last: string;
    red_fighter_odds: number | null;
    blue_fighter_odds: number | null;
  }>(
    `
    SELECT f.id AS fight_id, e.id AS event_id, e.name AS event_name,
           e.scheduled_at, e.status AS event_status,
           rf.first_name AS red_first, rf.last_name AS red_last,
           bf.first_name AS blue_first, bf.last_name AS blue_last,
           f.red_fighter_odds, f.blue_fighter_odds
    FROM fights f
    JOIN ufc_events e ON e.id = f.event_id
    JOIN fighters rf ON rf.id = f.red_fighter_id
    JOIN fighters bf ON bf.id = f.blue_fighter_id
    WHERE (LOWER(rf.last_name) LIKE $1 OR LOWER(bf.last_name) LIKE $1)
      AND e.status IN ('scheduled', 'live')
    ORDER BY e.scheduled_at ASC
    `,
    [`%${NAME}%`],
  );

  if (!fights.length) {
    console.log(`No scheduled/live fight found for a fighter matching "${NAME}".`);
    await db.end();
    return;
  }

  for (const f of fights) {
    const daysUntil = (new Date(f.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    console.log(`Fight: ${f.red_first} ${f.red_last}  vs  ${f.blue_first} ${f.blue_last}`);
    console.log(`Event: "${f.event_name}"  (${f.event_status})  ${f.scheduled_at}`);
    console.log(`Days until event: ${daysUntil.toFixed(1)}`);
    console.log(
      `Current DB odds → red: ${f.red_fighter_odds ?? 'NULL'}  blue: ${f.blue_fighter_odds ?? 'NULL'}`,
    );

    // 2. Window gate — the sync only fetches odds for events within 7 days.
    if (daysUntil > 7) {
      console.log(
        `\n⛔ Event is ${daysUntil.toFixed(1)} days out (> 7). The odds sync does NOT run yet for this event,\n` +
          `   so no odds will populate until it's inside the 7-day window. (This alone explains it.)\n`,
      );
      console.log('─'.repeat(70));
      continue;
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      console.log(
        '\n⚠️  ODDS_API_KEY is not set in this environment — cannot query the odds API.\n',
      );
      console.log('─'.repeat(70));
      continue;
    }

    // 3. Fetch the odds-api payload for this event's window (same query the job uses).
    const eventDate = new Date(f.scheduled_at);
    const commenceFrom = toOddsTs(new Date(eventDate.getTime() - 24 * 60 * 60 * 1000));
    const commenceTo = toOddsTs(new Date(eventDate.getTime() + 24 * 60 * 60 * 1000));
    const url = `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&commenceTimeFrom=${commenceFrom}&commenceTimeTo=${commenceTo}`;

    console.log(`\nQuerying the-odds-api window ${commenceFrom} → ${commenceTo} ...`);
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    console.log(
      `API response: ${res.status}  | quota remaining: ${res.headers.get('x-requests-remaining') ?? '?'}` +
        `  used: ${res.headers.get('x-requests-used') ?? '?'}`,
    );
    if (!res.ok) {
      console.log(`API error body: ${await res.text().catch(() => '')}`);
      console.log('─'.repeat(70));
      continue;
    }
    const oddsEvents = (await res.json()) as any[];
    console.log(`API returned ${oddsEvents.length} MMA event(s) in this window.`);

    const redLast = f.red_last.toLowerCase();
    const blueLast = f.blue_last.toLowerCase();

    // 4. Replay the EVENT-level match.
    const eventMatch = oddsEvents.find((oe) => {
      const names = [oe.home_team?.toLowerCase() ?? '', oe.away_team?.toLowerCase() ?? ''];
      return names.some((n) => n.includes(redLast) || n.includes(blueLast));
    });

    // Does ANY event in the payload mention either fighter (even if .find picked another)?
    const allMentions = oddsEvents.filter((oe) => {
      const names = [oe.home_team?.toLowerCase() ?? '', oe.away_team?.toLowerCase() ?? ''];
      return names.some((n) => n.includes(redLast) || n.includes(blueLast));
    });

    if (!eventMatch) {
      console.log(
        `\n❌ Cause (a): the book has NO event/line for this bout.\n` +
          `   No returned event's team names contain "${redLast}" or "${blueLast}".`,
      );
      console.log('\nFirst few events the API DID return (for sanity):');
      for (const oe of oddsEvents.slice(0, 8)) {
        console.log(`   • ${oe.home_team}  vs  ${oe.away_team}   (${oe.commence_time})`);
      }
      console.log('─'.repeat(70));
      continue;
    }

    console.log(`\nEvent-level match → "${eventMatch.home_team}" vs "${eventMatch.away_team}"`);
    if (allMentions.length > 1) {
      console.log(
        `⚠️  ${allMentions.length} returned events mention one of these last names — the matcher takes the FIRST,\n` +
          `   which can be the wrong bout. All mentions:`,
      );
      for (const oe of allMentions) console.log(`     • ${oe.home_team} vs ${oe.away_team}`);
    }

    // 5. Replay the OUTCOME-level match.
    const bookmaker =
      eventMatch.bookmakers?.find((b: any) => b.key === 'draftkings') ?? eventMatch.bookmakers?.[0];
    const h2h = bookmaker?.markets?.find((m: any) => m.key === 'h2h');
    if (!h2h) {
      console.log(`\n❌ Cause (a): matched event has no h2h market / bookmaker.`);
      console.log('─'.repeat(70));
      continue;
    }
    console.log(`Bookmaker used: ${bookmaker.key}`);
    console.log('Outcomes in payload:');
    let redOdds: number | null = null;
    let blueOdds: number | null = null;
    for (const outcome of h2h.outcomes ?? []) {
      const name = outcome.name?.toLowerCase() ?? '';
      const hitsRed = name.includes(redLast);
      const hitsBlue = name.includes(blueLast);
      console.log(
        `   "${outcome.name}"  @ ${outcome.price}` +
          `   → ${hitsRed ? `matches RED (${redLast})` : hitsBlue ? `matches BLUE (${blueLast})` : 'NO MATCH'}`,
      );
      if (hitsRed) redOdds = outcome.price;
      else if (hitsBlue) blueOdds = outcome.price;
    }

    console.log(`\nMatcher result → red: ${redOdds ?? 'NULL'}  blue: ${blueOdds ?? 'NULL'}`);
    if (redOdds == null && blueOdds == null) {
      console.log(
        `\n❌ Cause (b): the event matched but NO outcome name contained "${redLast}" or "${blueLast}".\n` +
          `   This is a name-matching miss (spelling/diacritics/substring). Compare the outcome\n` +
          `   names above to the stored last names.`,
      );
    } else if (redOdds == null || blueOdds == null) {
      console.log(
        `\n⚠️  Partial: only one side matched. The other fighter's name didn't match any outcome\n` +
          `   (or the book only priced one side). The unmatched side stays NULL.`,
      );
    } else {
      console.log(
        `\n✅ Both sides resolve. If the DB still shows NULL, the sync simply hasn't run since the\n` +
          `   line was posted — force it with POST /admin/events/${f.event_id}/sync-odds.`,
      );
    }
    console.log('─'.repeat(70));
  }

  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
