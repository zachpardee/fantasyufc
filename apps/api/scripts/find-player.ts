// Read-only: locate a user by username to confirm before mutating. Run with:
//   tsx --env-file=.env scripts/find-player.ts player3
import { Pool } from 'pg';

const term = process.argv[2] ?? 'player3';

(async () => {
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows } = await db.query(
    `SELECT up.id, up.username, up.display_name, u.email, u.created_at
       FROM user_profiles up
       JOIN auth.users u ON u.id = up.id
      WHERE up.username ILIKE $1 OR up.display_name ILIKE $1 OR u.email ILIKE $1
      ORDER BY up.username`,
    [`%${term}%`],
  );
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\n${rows.length} match(es) for "${term}"`);
  await db.end();
})();
