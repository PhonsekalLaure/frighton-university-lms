import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Frighton University Library Management System (LMS) API',
    port: 5001,
    timestamp: new Date().toISOString(),
  });
});
