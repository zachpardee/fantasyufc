import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

function slugify(firstName: string, lastName: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

  const first = clean(firstName);
  const last = clean(lastName);
  // Handle single-name fighters (last name = first name in DB or empty)
  if (!last || last === first) return first;
  return `${first}-${last}`;
}

async function fetchImageUrl(firstName: string, lastName: string): Promise<string | null> {
  const slug = slugify(firstName, lastName);
  const url = `https://www.ufc.com/athlete/${slug}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html',
      },
    });
    if (!res.ok) {
      console.log(`  ✗ ${firstName} ${lastName} — HTTP ${res.status} (${slug})`);
      return null;
    }
    const html = await res.text();
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!match) {
      console.log(`  ✗ ${firstName} ${lastName} — no og:image found`);
      return null;
    }
    return match[1];
  } catch (err) {
    console.log(`  ✗ ${firstName} ${lastName} — fetch error: ${(err as Error).message}`);
    return null;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await client.connect();

  const { rows: fighters } = await client.query<{
    id: string;
    first_name: string;
    last_name: string;
  }>(`SELECT id, first_name, last_name FROM fighters ORDER BY first_name`);

  console.log(`Fetching images for ${fighters.length} fighters...\n`);

  let updated = 0;
  let failed = 0;

  for (const f of fighters) {
    const imageUrl = await fetchImageUrl(f.first_name, f.last_name);
    if (imageUrl) {
      await client.query(`UPDATE fighters SET image_url = $1 WHERE id = $2`, [imageUrl, f.id]);
      console.log(`  ✓ ${f.first_name} ${f.last_name}`);
      updated++;
    } else {
      failed++;
    }
    await sleep(400); // ~2.5 req/s — polite to UFC.com
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed`);
  await client.end();
}

main().catch(console.error);
