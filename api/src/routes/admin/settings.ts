import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { getExchangeRate, setExchangeRate, getSameDayCutoff, setSameDayCutoff, getMpFeePct, setMpFeePct } from '../../services/settings.js';

export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT key, value, description, updated_at FROM settings ORDER BY key`);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

const rateSchema = z.object({ rate: z.number().positive() });

adminSettingsRouter.put('/exchange-rate', async (req, res, next) => {
  try {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setExchangeRate(parsed.data.rate);
    const current = await getExchangeRate();
    res.json({ data: { rate: current } });
  } catch (err) { next(err); }
});

const cutoffSchema = z.object({ time: z.string().regex(/^\d{2}:\d{2}$/).nullable() });

adminSettingsRouter.get('/booking-cutoff', async (_req, res, next) => {
  try {
    const time = await getSameDayCutoff();
    res.json({ data: { time } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/booking-cutoff', async (req, res, next) => {
  try {
    const parsed = cutoffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setSameDayCutoff(parsed.data.time);
    const time = await getSameDayCutoff();
    res.json({ data: { time } });
  } catch (err) { next(err); }
});

const mpFeeSchema = z.object({ pct: z.number().min(0).max(100) });

adminSettingsRouter.get('/mp-fee-pct', async (_req, res, next) => {
  try {
    const pct = await getMpFeePct();
    res.json({ data: { pct } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/mp-fee-pct', async (req, res, next) => {
  try {
    const parsed = mpFeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setMpFeePct(parsed.data.pct);
    const pct = await getMpFeePct();
    res.json({ data: { pct } });
  } catch (err) { next(err); }
});
