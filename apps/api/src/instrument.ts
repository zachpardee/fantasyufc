import * as Sentry from '@sentry/node';

// Error reporting — active only when SENTRY_DSN is configured (production).
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
  });
}
