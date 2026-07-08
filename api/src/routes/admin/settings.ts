import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { getExchangeRate, setExchangeRate, getSameDayCutoff, setSameDayCutoff, getModifyWindow, setModifyWindow, getCancelWindow, setCancelWindow, getMaintenanceMode, setMaintenanceMode } from '../../services/settings.js';
import { getAbout, setAbout, getFaq, setFaq, getSellerFaq, setSellerFaq } from '../../services/content.js';

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

// ─── Anticipación mínima para modificar reservas ─────────
const operationCutoffSchema = z.object({ hours: z.number().int().min(1).max(720).nullable() });

adminSettingsRouter.get('/modify-window', async (_req, res, next) => {
  try {
    res.json({ data: { hours: await getModifyWindow() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/modify-window', async (req, res, next) => {
  try {
    const parsed = operationCutoffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setModifyWindow(parsed.data.hours);
    res.json({ data: { hours: await getModifyWindow() } });
  } catch (err) { next(err); }
});

// ─── Anticipación mínima para cancelar reservas ──────────
adminSettingsRouter.get('/cancel-window', async (_req, res, next) => {
  try {
    res.json({ data: { hours: await getCancelWindow() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/cancel-window', async (req, res, next) => {
  try {
    const parsed = operationCutoffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setCancelWindow(parsed.data.hours);
    res.json({ data: { hours: await getCancelWindow() } });
  } catch (err) { next(err); }
});

// ─── Modo mantenimiento ──────────────────────────────────
adminSettingsRouter.get('/maintenance', async (_req, res, next) => {
  try {
    res.json({ data: { enabled: await getMaintenanceMode() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/maintenance', async (req, res, next) => {
  try {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setMaintenanceMode(parsed.data.enabled);
    res.json({ data: { enabled: await getMaintenanceMode() } });
  } catch (err) { next(err); }
});

// ─── Retención de papelera ────────────────────────────────
adminSettingsRouter.get('/trash-retention', async (_req, res, next) => {
  try {
    const { rows } = await pool.query<{ value: unknown }>(
      `SELECT value FROM settings WHERE key = 'trash_retention_days' LIMIT 1`,
    );
    const val = rows[0]?.value;
    const days = typeof val === 'number' ? val : parseInt(String(val ?? '30'), 10);
    res.json({ data: { days: Number.isFinite(days) && days > 0 ? days : 30 } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/trash-retention', async (req, res, next) => {
  try {
    const parsed = z.object({ days: z.number().int().min(1).max(365) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await pool.query(
      `INSERT INTO settings (key, value, description, updated_at)
       VALUES ('trash_retention_days', $1::jsonb, 'Días de retención en papelera', NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [parsed.data.days],
    );
    res.json({ data: { days: parsed.data.days } });
  } catch (err) { next(err); }
});

// ─── Contenido: Nosotros ─────────────────────────────────
const aboutSchema = z.object({
  title_es: z.string().max(200),
  title_en: z.string().max(200),
  body_es: z.string().max(20000),
  body_en: z.string().max(20000),
});

adminSettingsRouter.get('/content/about', async (_req, res, next) => {
  try {
    res.json({ data: await getAbout() });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/content/about', async (req, res, next) => {
  try {
    const parsed = aboutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    res.json({ data: await setAbout(parsed.data) });
  } catch (err) { next(err); }
});

// ─── Contenido: Preguntas Frecuentes ─────────────────────
const faqSchema = z.object({
  items: z.array(z.object({
    q_es: z.string().max(500),
    q_en: z.string().max(500),
    a_es: z.string().max(5000),
    a_en: z.string().max(5000),
  })).max(100),
});

adminSettingsRouter.get('/content/faq', async (_req, res, next) => {
  try {
    res.json({ data: await getFaq() });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/content/faq', async (req, res, next) => {
  try {
    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    res.json({ data: await setFaq(parsed.data.items) });
  } catch (err) { next(err); }
});

// ─── Contenido: Preguntas Frecuentes para Vendedores ─────────
const sellerFaqSchema = z.object({
  items: z.array(z.object({
    q_es: z.string().max(500),
    a_es: z.string().max(5000),
  })).max(100),
});

adminSettingsRouter.get('/content/seller-faq', async (_req, res, next) => {
  try {
    res.json({ data: await getSellerFaq() });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/content/seller-faq', async (req, res, next) => {
  try {
    const parsed = sellerFaqSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    res.json({ data: await setSellerFaq(parsed.data.items) });
  } catch (err) { next(err); }
});
