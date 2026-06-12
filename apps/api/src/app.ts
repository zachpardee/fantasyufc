import express from 'express';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error.middleware';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:19006').split(',');
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true }));
app.use('/api/v1', apiRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);
