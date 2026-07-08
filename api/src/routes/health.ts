import { Router } from 'express';
import { ping } from '../db.js';
import { getMaintenanceMode } from '../services/settings.js';

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

healthRouter.get('/status', async (_req, res) => {
  try {
    const maintenance = await getMaintenanceMode();
    res.json({ data: { maintenance } });
  } catch {
    res.json({ data: { maintenance: false } });
  }
});
