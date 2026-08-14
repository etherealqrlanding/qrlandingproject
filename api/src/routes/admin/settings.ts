import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { getExchangeRate, setExchangeRate, getExchangeRateMode, setExchangeRateMode, setExchangeRateFromAuto, getSameDayCutoff, setSameDayCutoff, getBookingHorizonMonths, setBookingHorizonMonths, getModifyWindow, setModifyWindow, getCancelWindow, setCancelWindow, getMaintenanceMode, setMaintenanceMode, getArchiveRetentionDays, setArchiveRetentionDays, getSupportWhatsapp, setSupportWhatsapp } from '../../services/settings.js';
import { fetchOficialVentaRate } from '../../services/exchangeRateSync.js';
import { getAbout, setAbout, getFaq, setFaq, getSellerFaq, setSellerFaq, getTerms, setTerms } from '../../services/content.js';

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

// ─── Modo de tipo de cambio: automático (dolarapi.com, oficial) o manual ───
const rateModeSchema = z.object({ mode: z.enum(['auto', 'manual']) });

adminSettingsRouter.get('/exchange-rate-mode', async (_req, res, next) => {
  try {
    res.json({ data: { mode: await getExchangeRateMode() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/exchange-rate-mode', async (req, res, next) => {
  try {
    const parsed = rateModeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setExchangeRateMode(parsed.data.mode);
    // Al activar "auto" refrescamos ya mismo — no tiene sentido dejar el valor viejo
    // hasta el próximo barrido de hasta 30 minutos.
    if (parsed.data.mode === 'auto') {
      const rate = await fetchOficialVentaRate();
      await setExchangeRateFromAuto(rate);
    }
    res.json({ data: { rate: await getExchangeRate(), mode: await getExchangeRateMode() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.post('/exchange-rate/sync-now', async (_req, res, next) => {
  try {
    if ((await getExchangeRateMode()) !== 'auto') {
      return res.status(400).json({ error: 'El tipo de cambio está en modo manual. Activá "automático" para poder sincronizar.' });
    }
    const rate = await fetchOficialVentaRate();
    await setExchangeRateFromAuto(rate);
    res.json({ data: { rate: await getExchangeRate(), mode: await getExchangeRateMode() } });
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

// ─── Horizonte de venta: hasta cuántos meses a futuro se puede reservar ───
const bookingHorizonSchema = z.object({ months: z.number().int().min(1).max(36).nullable() });

adminSettingsRouter.get('/booking-horizon', async (_req, res, next) => {
  try {
    res.json({ data: { months: await getBookingHorizonMonths() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/booking-horizon', async (req, res, next) => {
  try {
    const parsed = bookingHorizonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setBookingHorizonMonths(parsed.data.months);
    res.json({ data: { months: await getBookingHorizonMonths() } });
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

// ─── Retención en tabla principal antes del auto-archivado ───
const archiveRetentionSchema = z.object({ days: z.number().int().min(1).max(365).nullable() });

adminSettingsRouter.get('/archive-retention', async (_req, res, next) => {
  try {
    res.json({ data: { days: await getArchiveRetentionDays() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/archive-retention', async (req, res, next) => {
  try {
    const parsed = archiveRetentionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setArchiveRetentionDays(parsed.data.days);
    res.json({ data: { days: await getArchiveRetentionDays() } });
  } catch (err) { next(err); }
});

// ─── WhatsApp de contacto/soporte ─────────────────────────
const whatsappSchema = z.object({ number: z.string().regex(/^\d{10,15}$/, 'Solo dígitos, con código de país (ej: 5491132368312)') });

adminSettingsRouter.get('/support-whatsapp', async (_req, res, next) => {
  try {
    res.json({ data: { number: await getSupportWhatsapp() } });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/support-whatsapp', async (req, res, next) => {
  try {
    const parsed = whatsappSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    await setSupportWhatsapp(parsed.data.number);
    res.json({ data: { number: await getSupportWhatsapp() } });
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

// ─── Contenido: Términos y Condiciones ────────────────────
const termsSchema = z.object({
  title_es: z.string().max(200),
  title_en: z.string().max(200),
  body_es: z.string().max(40000),
  body_en: z.string().max(40000),
});

adminSettingsRouter.get('/content/terms', async (_req, res, next) => {
  try {
    res.json({ data: await getTerms() });
  } catch (err) { next(err); }
});

adminSettingsRouter.put('/content/terms', async (req, res, next) => {
  try {
    const parsed = termsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    res.json({ data: await setTerms(parsed.data) });
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
