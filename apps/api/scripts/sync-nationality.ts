import 'dotenv/config';
import { db } from '../src/config/database';
import { fetchAthletes } from '../src/services/espn.adapter';

async function run() {
  console.log('[NationalitySync] Fetching all ESPN athletes...');
  let page = 1;
  let updated = 0;
  let hasMore = true;

  while (hasMore) {
    const { athletes, hasMore: more } = await fetchAthletes(page, 100);
    hasMore = more;

    for (const a of athletes) {
      if (!a.country) continue;
      const result = await db.query(
        `UPDATE fighters SET nationality = $1 WHERE ufc_fighter_id = $2 AND (nationality IS NULL OR nationality != $1)`,
        [a.country, a.espnId],
      );
      if (result.rowCount && result.rowCount > 0) updated++;
    }

    console.log(`  Page ${page}: ${athletes.length} athletes (updated so far: ${updated})`);
    page++;
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`[NationalitySync] Done — updated ${updated} fighters`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
