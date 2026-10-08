import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { healthRouter } from './routes/healthRoutes.js';
import { bookRouter } from './routes/bookRoutes.js';
import { loanRouter } from './routes/loanRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

export const createApp = (): Express => {
  const app = express();

  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/health', healthRouter);
  app.use('/api/v1/books', bookRouter);
  app.use('/api/v1/loans', loanRouter);

  app.use(errorHandler);

  return app;
};
