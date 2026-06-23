/**
 * Backfill stored combined odds / potential payout for PENDING parlays whose decimal_odds
 * is NULL (saved before the unpriced-leg fix). Computes from the legs, treating a leg with
 * no posted line as 1.0 — matching the bet-builder and the fixed display.
 *
 * Usage: tsx --env-file=.env scripts/backfill-parlay-odds.ts
 */
import { db } from '../src/config/database';

async function main() {
  const { rows: parlays } = await db.query(
    `SELECT id, stake FROM staking_parlays WHERE status = 'pending' AND decimal_odds IS NULL`,
  );
  console.log(`Found ${parlays.length} pending parlay(s) with NULL decimal_odds.\n`);

  let fixed = 0;
  for (const p of parlays) {
    const { rows: legs } = await db.query(
      `SELECT decimal_odds FROM staking_parlay_legs WHERE parlay_id = $1`,
      [p.id],
    );
    if (!legs.length) continue;

    const combined = legs.reduce(
      (acc: number, l: any) =>
        acc * (l.decimal_odds != null ? parseFloat(l.decimal_odds) || 1 : 1),
      1,
    );
    const decOdds = Math.round(combined * 10000) / 10000;
    const payout = Math.round(parseFloat(p.stake) * combined * 100) / 100;

    await db.query(
      `UPDATE staking_parlays SET decimal_odds = $1, potential_payout = $2 WHERE id = $3`,
      [decOdds, payout, p.id],
    );
    console.log(`  parlay ${p.id}: $${p.stake} → decimal_odds ${decOdds}, potential_payout $${payout}`);
    fixed++;
  }

  console.log(`\nDone. Updated ${fixed} parlay(s).`);
  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
