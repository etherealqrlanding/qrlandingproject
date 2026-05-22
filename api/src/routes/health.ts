import { Router } from 'express';
import { ping } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const db = await ping();
  res.json({
    status: 'ok',
    db: db ? 'up' : 'down',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
