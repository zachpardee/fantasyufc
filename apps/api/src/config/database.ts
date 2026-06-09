import { Pool } from 'pg';
import { env } from './env';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Log idle-client errors but don't crash — pool will discard and replace the client
db.on('error', (err) => {
  console.error('[DB] Idle client error (pool will recover):', err.message);
});
