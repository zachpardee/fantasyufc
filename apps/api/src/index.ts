import './config/env';
import { app } from './app';
import { env } from './config/env';
import { db } from './config/database';
import { redis } from './config/redis';
import { startDraftTimerJob } from './jobs/draftTimer.job';
import { startEventSyncJob } from './jobs/eventSync.job';
import { startFighterSyncJob } from './jobs/fighterSync.job';
import { startLivePollerJob } from './jobs/livePoller.job';
import { startAutoScheduleJob } from './jobs/autoSchedule.job';
async function main() {
  await db.connect();
  await redis.connect().catch((err: unknown) => {
    console.warn('[Cache] Redis connect failed, falling back to in-memory cache:', (err as Error).message);
  });

  startDraftTimerJob();
  startEventSyncJob();
  startFighterSyncJob();
  startLivePollerJob();
  startAutoScheduleJob();

  app.listen(env.PORT, () => {
    console.log(`API running on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
