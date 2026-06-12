import * as Sentry from '@sentry/react';

// Error reporting + tracing + error session replay.
// Active only when a DSN is configured (production).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.2,
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/fantasy-fighting-league-production\.up\.railway\.app/,
    ],
    // Replay only around errors to stay inside the free quota
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
