/**
 * One-command Supabase setup.
 * Usage: DATABASE_URL=... npx tsx scripts/setup-supabase.ts [--seed]
 *
 * Steps:
 *   1. Verify required env vars
 *   2. Test the database connection
 *   3. Run all migrations in order
 *   4. (optional, --seed flag) Run seeds: weight classes + fighters
 *   5. Print what's left to configure manually
 */

import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const REQUIRED_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const OPTIONAL_VARS = ['REDIS_URL', 'JWT_SECRET', 'EXPO_ACCESS_TOKEN', 'ADMIN_USER_IDS'];

function checkEnv() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length) {
    console.error('\n[setup] Missing required env vars:');
    missing.forEach((v) => console.error(`  ✗ ${v}`));
    console.error(
      '\nCopy .env.example → .env and fill in the values from your Supabase project dashboard.\n',
    );
    process.exit(1);
  }

  const warned = OPTIONAL_VARS.filter((v) => !process.env[v]);
  if (warned.length) {
    console.warn('\n[setup] Optional vars not set (features may be limited):');
    warned.forEach((v) => console.warn(`  ⚠  ${v}`));
  }

  console.log('[setup] Env vars OK.\n');
}

async function migrate(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id        SERIAL PRIMARY KEY,
      filename  VARCHAR(255) NOT NULL UNIQUE,
      run_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = join(__dirname, '../apps/api/src/db/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const {
      rows: [existing],
    } = await db.query(`SELECT id FROM _migrations WHERE filename = $1`, [file]);
    if (existing) {
      console.log(`  - ${file} (already run, skipping)`);
      continue;
    }

    process.stdout.write(`  Running ${file}... `);
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log('done');
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('FAILED\n');
      throw err;
    } finally {
      client.release();
    }
  }

  if (ran === 0) {
    console.log('  All migrations already up to date.');
  } else {
    console.log(`\n  ${ran} migration(s) applied.`);
  }
}

async function seed() {
  const apiDir = join(__dirname, '../apps/api');

  process.stdout.write('  Seeding weight classes... ');
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const wcSql = readFileSync(join(apiDir, 'src/db/seeds/weight_classes.sql'), 'utf8');
  await db.query(wcSql);
  await db.end();
  console.log('done');

  process.stdout.write('  Seeding fighters (~65 top fighters)... ');
  execSync('npx tsx src/db/seeds/fighters.ts', {
    env: process.env,
    stdio: 'inherit',
    cwd: apiDir,
  });
  console.log('done');
}

function printNextSteps() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Setup complete. A few manual steps remain:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Supabase Dashboard → Authentication → Settings
   • Set "JWT expiry" to 3600 (1 hour) or longer
   • Enable email confirmations (or disable for dev)
   • Add your app URLs to the redirect allow-list

2. Supabase Dashboard → Project Settings → API
   • Copy the JWT secret → set JWT_SECRET in your .env

3. Set ADMIN_USER_IDS in .env
   • Sign up through your app, then find your UUID in
     Supabase Dashboard → Authentication → Users
   • ADMIN_USER_IDS=your-uuid (comma-separate for multiple)

4. Expo push notifications
   • Create a project at expo.dev, enable push notifications
   • Copy the access token → EXPO_ACCESS_TOKEN in .env

5. Start the API:
     npm run dev --workspace=apps/api

6. (Optional) Start local infra instead of Supabase:
     docker compose -f infrastructure/docker-compose.yml up -d
  `);
}

async function main() {
  const runSeed = process.argv.includes('--seed');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Fantasy UFC — Supabase Setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  checkEnv();

  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase.com') ? { rejectUnauthorized: false } : false,
  });

  console.log('[1/3] Testing database connection...');
  try {
    const { rows } = await db.query('SELECT version()');
    console.log(`  Connected: ${rows[0].version.split(' ').slice(0, 2).join(' ')}\n`);
  } catch (err) {
    console.error('  Failed to connect. Check your DATABASE_URL.\n', err);
    process.exit(1);
  }

  console.log('[2/3] Running migrations...');
  await migrate(db);
  await db.end();
  console.log();

  if (runSeed) {
    console.log('[3/3] Running seeds...');
    await seed();
    console.log();
  } else {
    console.log('[3/3] Skipping seeds (pass --seed to populate fighters + weight classes)\n');
  }

  printNextSteps();
}

main().catch((err) => {
  console.error('\n[setup] Fatal error:', err?.message ?? err);
  process.exit(1);
});
