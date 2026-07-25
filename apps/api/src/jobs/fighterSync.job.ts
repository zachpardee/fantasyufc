import cron from 'node-cron';
import { tracked } from './jobRuns';
import { db } from '../config/database';
import { fetchAthletes, type EspnAthlete } from '../services/espn.adapter';
import { redis } from '../config/redis';

// Runs every Sunday at 3am UTC — full fighter roster sync from ESPN
export function startFighterSyncJob() {
  cron.schedule('0 3 * * 0', tracked('fighter_sync', syncAllFighters), { timezone: 'UTC' });
}

export async function syncAllFighters() {
  console.log('[FighterSync] Starting full fighter sync...');
  let page = 1;
  let total = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const { athletes, hasMore: more } = await fetchAthletes(page, 100);
      hasMore = more;

      for (const athlete of athletes) {
        try {
          await upsertFighter(athlete);
          total++;
        } catch (err) {
          console.error('[FighterSync] Failed to upsert:', athlete.displayName, err);
        }
      }

      console.log(
        `[FighterSync] Page ${page}: synced ${athletes.length} fighters (total: ${total})`,
      );
      page++;

      // Throttle between pages
      await sleep(2000);
    } catch (err) {
      console.error(`[FighterSync] Page ${page} error:`, err);
      hasMore = false;
    }
  }

  await redis.del('fighters:*');
  console.log(`[FighterSync] Complete — synced ${total} fighters`);
}

async function upsertFighter(athlete: EspnAthlete) {
  // Resolve weight class
  let weightClassId: string | null = null;
  if (athlete.weightClassSlug) {
    const {
      rows: [wc],
    } = await db.query(`SELECT id FROM weight_classes WHERE slug = $1`, [athlete.weightClassSlug]);
    weightClassId = wc?.id ?? null;
  }

  if (!weightClassId) {
    // Infer from weight
    if (athlete.weightLbs) {
      const {
        rows: [wc],
      } = await db.query(
        `SELECT id FROM weight_classes WHERE weight_limit_lbs >= $1 ORDER BY weight_limit_lbs ASC LIMIT 1`,
        [athlete.weightLbs - 5],
      );
      weightClassId = wc?.id ?? null;
    }
  }

  if (!weightClassId) return; // Can't insert without weight class

  await db.query(
    `
    INSERT INTO fighters (
      ufc_fighter_id, first_name, last_name, weight_class_id,
      nationality, image_url, height_inches, reach_inches, dob
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (ufc_fighter_id) DO UPDATE SET
      first_name    = EXCLUDED.first_name,
      last_name     = EXCLUDED.last_name,
      weight_class_id = COALESCE(EXCLUDED.weight_class_id, fighters.weight_class_id),
      nationality   = COALESCE(EXCLUDED.nationality, fighters.nationality),
      image_url     = COALESCE(EXCLUDED.image_url, fighters.image_url),
      height_inches = COALESCE(EXCLUDED.height_inches, fighters.height_inches),
      reach_inches  = COALESCE(EXCLUDED.reach_inches, fighters.reach_inches),
      dob           = COALESCE(EXCLUDED.dob, fighters.dob)
  `,
    [
      athlete.espnId,
      athlete.firstName,
      athlete.lastName,
      weightClassId,
      athlete.country ?? null,
      athlete.imageUrl ?? null,
      athlete.heightInches ?? null,
      athlete.reachInches ?? null,
      athlete.dateOfBirth ?? null,
    ],
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
