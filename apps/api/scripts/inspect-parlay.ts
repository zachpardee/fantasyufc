/**
 * Inspect a team's parlays + legs to see why a payout shows $0.
 * Usage: tsx --env-file=.env scripts/inspect-parlay.ts "thunder"
 */
import { db } from '../src/config/database';

const TEAM = (process.argv[2] ?? 'thunder').toLowerCase();

async function main() {
  const { rows: parlays } = await db.query(
    `
    SELECT sp.id, sp.stake, sp.decimal_odds, sp.potential_payout, sp.status,
           lm.team_name, e.name AS event_name
    FROM staking_parlays sp
    JOIN league_members lm ON lm.id = sp.member_id
    JOIN ufc_events e ON e.id = sp.event_id
    WHERE LOWER(lm.team_name) LIKE $1
    ORDER BY sp.created_at DESC
    `,
    [`%${TEAM}%`],
  );

  if (!parlays.length) {
    console.log(`No parlays found for a team matching "${TEAM}".`);
    await db.end();
    return;
  }

  for (const p of parlays) {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Team: ${p.team_name}  | Event: ${p.event_name}  | status: ${p.status}`);
    console.log(
      `Parlay stake: $${p.stake}  decimal_odds: ${p.decimal_odds ?? 'NULL'}  potential_payout: ${p.potential_payout ?? 'NULL'}`,
    );

    const { rows: legs } = await db.query(
      `
      SELECT spl.odds, spl.decimal_odds, spl.result,
             fi.first_name, fi.last_name,
             f.red_fighter_odds, f.blue_fighter_odds
      FROM staking_parlay_legs spl
      JOIN fighters fi ON fi.id = spl.fighter_id
      JOIN fights f ON f.id = spl.fight_id
      WHERE spl.parlay_id = $1
      `,
      [p.id],
    );

    console.log('Legs:');
    for (const l of legs) {
      console.log(
        `  • ${l.first_name} ${l.last_name}  | leg odds: ${l.odds ?? 'NULL'}  leg decimal_odds: ${l.decimal_odds ?? 'NULL'}  | result: ${l.result}`,
      );
    }

    // What the (fixed) mobile display would compute from legs:
    const computed = legs.reduce(
      (acc: number, l: any) => acc * (l.decimal_odds != null ? parseFloat(l.decimal_odds) || 1 : 1),
      1,
    );
    console.log(
      `\n→ Display payout from legs would be: $${(parseFloat(p.stake) * computed).toFixed(2)}  (combined odds ${computed.toFixed(3)})`,
    );
    if (computed <= 1) {
      console.log(
        `   combined odds ≤ 1 → every leg is unpriced, so even the fixed display shows $0.\n` +
          `   The other leg(s) also have no posted line yet.`,
      );
    }
  }

  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
