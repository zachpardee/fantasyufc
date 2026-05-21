/**
 * Runs all SQL migrations in order.
 * Usage: npx tsx src/db/migrate.ts
 */
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows: [existing] } = await db.query(
      `SELECT id FROM _migrations WHERE filename = $1`, [file],
    );
    if (existing) {
      console.log(`Skipping ${file} (already run)`);
      continue;
    }

    console.log(`Running migration: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf8');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${file}:`, err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('All migrations complete.');
  await db.end();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
