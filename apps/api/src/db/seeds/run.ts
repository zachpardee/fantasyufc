/**
 * Runs all seeds in order.
 * Usage: npx tsx src/db/seeds/run.ts
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // 1. Weight classes (SQL)
  console.log('Seeding weight classes...');
  const wcSql = readFileSync(join(__dirname, 'weight_classes.sql'), 'utf8');
  await db.query(wcSql);
  console.log('Weight classes seeded.');

  // 2. Fighters (TypeScript seed — spawned as child process to avoid circular deps)
  console.log('Seeding fighters...');
  const { execSync } = await import('child_process');
  execSync('npx tsx src/db/seeds/fighters.ts', {
    env: process.env,
    stdio: 'inherit',
    cwd: join(__dirname, '../../..'),
  });

  await db.end();
  console.log('All seeds complete.');
}

run().catch((err) => { console.error(err); process.exit(1); });
