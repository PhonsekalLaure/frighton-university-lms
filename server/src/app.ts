import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { authRouter } from './routes/authRoutes.js';
import { healthRouter } from './routes/healthRoutes.js';
import { bookRouter } from './routes/bookRoutes.js';
import { loanRouter } from './routes/loanRoutes.js';
import { staffRouter } from './routes/staffRoutes.js';
import { protectCookieRequests, requireLibrarian } from './middlewares/auth.js';
import { errorHandler } from './middlewares/errorHandler.js';

export const createApp = (): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    if (config.nodeEnv === 'production') {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(protectCookieRequests);
  app.use(express.json({ limit: '10kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/v1/books', requireLibrarian, bookRouter);
  app.use('/api/v1/loans', requireLibrarian, loanRouter);

  app.use('/api/v1/staff', requireLibrarian, staffRouter);

  app.use(errorHandler);
  return app;
};
