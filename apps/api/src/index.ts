import './config/env';
import { app } from './app';
import { env } from './config/env';
import { db } from './config/database';
import { redis } from './config/redis';
import { startEventSyncJob } from './jobs/eventSync.job';
import { startFighterSyncJob } from './jobs/fighterSync.job';
import { startLivePollerJob } from './jobs/livePoller.job';
import { startAutoScheduleJob } from './jobs/autoSchedule.job';
import { startPreEventPrepJob } from './jobs/preEventPrep.job';
async function main() {
  const dbClient = await db.connect();
  dbClient.release();
  await redis.connect().catch((err: unknown) => {
    console.warn('[Cache] Redis connect failed, falling back to in-memory cache:', (err as Error).message);
  });

  startEventSyncJob();
  startFighterSyncJob();
  startLivePollerJob();
  startAutoScheduleJob();
  startPreEventPrepJob();

  app.listen(env.PORT, () => {
    console.log(`API running on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
