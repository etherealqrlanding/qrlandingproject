import { Router } from 'express';
import { z } from 'zod';
import {
  adminCreateImage,
  adminCreateOption,
  adminCreateProduct,
  adminDeleteImage,
  adminDeleteOption,
  adminDeleteProduct,
  adminHardDeleteProduct,
  adminGetProduct,
  adminListProducts,
  adminUpdateImage,
  adminUpdateOption,
  adminUpdateProduct,
} from '../../repos/admin-catalog.js';

export const adminProductsRouter = Router();

const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  category_id: z.number().int().positive(),
  name: z.string().min(2).max(160),
  venue_name: z.string().min(1).max(160),
  short_description_es: z.string().max(500).optional().nullable(),
  short_description_en: z.string().max(500).optional().nullable(),
  long_description_es: z.string().max(4000).optional().nullable(),
  long_description_en: z.string().max(4000).optional().nullable(),
  address_es: z.string().max(300).optional().nullable(),
  address_en: z.string().max(300).optional().nullable(),
  schedule_summary_es: z.string().max(800).optional().nullable(),
  schedule_summary_en: z.string().max(800).optional().nullable(),
  video_url: z.string().max(500).optional().nullable(),
  starting_price_usd: z.number().nonnegative().optional().nullable(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

adminProductsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await adminListProducts();
    res.json({ data: rows });
  } catch (err) { next(err); }
});

adminProductsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const product = await adminGetProduct(id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ data: product });
  } catch (err) { next(err); }
});

adminProductsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const id = await adminCreateProduct(parsed.data);
    const product = await adminGetProduct(id);
    res.status(201).json({ data: product });
  } catch (err) { next(err); }
});

adminProductsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const ok = await adminUpdateProduct(id, parsed.data);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    const product = await adminGetProduct(id);
    res.json({ data: product });
  } catch (err) { next(err); }
});

// DELETE /api/admin/products/:id
//   (default)      → soft delete: marca is_active = FALSE (conserva historial).
//   ?mode=hard     → borrado definitivo. Solo si no aparece en órdenes; si tiene ventas
//                    devuelve 409 con el conteo para que el front ofrezca desactivar.
adminProductsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    if (req.query.mode === 'hard') {
      const result = await adminHardDeleteProduct(id);
      if (result.blocked) {
        return res.status(409).json({
          error: `El producto aparece en ${result.orderCount} orden(es) histórica(s) y no puede borrarse definitivamente. Podés desactivarlo en su lugar.`,
          details: { order_count: result.orderCount },
        });
      }
      if (!result.deleted) return res.status(404).json({ error: 'Not found' });
      return res.json({ data: { ok: true } });
    }

    const ok = await adminDeleteProduct(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ─── Opciones ───────────────────────────────────────────

const optionSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,50}$/),
  name_es: z.string().min(1).max(160),
  name_en: z.string().max(160).optional().nullable(),
  description_es: z.string().max(500).optional().nullable(),
  description_en: z.string().max(500).optional().nullable(),
  includes_es: z.array(z.string().max(300)).max(30).optional(),
  includes_en: z.array(z.string().max(300)).max(30).optional(),
  price_adult_usd: z.number().nonnegative(),
  price_child_usd: z.number().nonnegative().optional().nullable(),
  net_price_adult_usd: z.number().nonnegative().optional().nullable(),
  net_price_child_usd: z.number().nonnegative().optional().nullable(),
  net_price_currency: z.enum(['USD', 'ARS']).optional().nullable(),
  net_price_adult_ars: z.number().nonnegative().optional().nullable(),
  net_price_child_ars: z.number().nonnegative().optional().nullable(),
  has_dinner: z.boolean().optional(),
  has_transfer: z.boolean().optional(),
  transfer_price_usd: z.number().nonnegative().optional(),
  net_transfer_price_usd: z.number().nonnegative().optional().nullable(),
  net_transfer_price_ars: z.number().nonnegative().optional().nullable(),
  available_days: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  pickup_window_es: z.string().max(200).optional().nullable(),
  pickup_window_en: z.string().max(200).optional().nullable(),
  dinner_time_es: z.string().max(200).optional().nullable(),
  dinner_time_en: z.string().max(200).optional().nullable(),
  show_time_es: z.string().max(200).optional().nullable(),
  show_time_en: z.string().max(200).optional().nullable(),
  default_capacity_per_day: z.number().int().nonnegative().optional(),
  low_availability_threshold: z.number().int().nonnegative().optional(),
  show_remaining_count: z.boolean().optional(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

adminProductsRouter.post('/:productId/options', async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
    const parsed = optionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const id = await adminCreateOption(productId, parsed.data);
    res.status(201).json({ data: { id } });
  } catch (err) { next(err); }
});

adminProductsRouter.patch('/options/:optionId', async (req, res, next) => {
  try {
    const id = Number(req.params.optionId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = optionSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const ok = await adminUpdateOption(id, parsed.data);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminProductsRouter.delete('/options/:optionId', async (req, res, next) => {
  try {
    const id = Number(req.params.optionId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const ok = await adminDeleteOption(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ─── Disponibilidad / cupos por fecha ──────────────────

const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capacity_override: z.number().int().nonnegative().nullable().optional(),
  is_closed: z.boolean().optional(),
  notes: z.string().max(300).nullable().optional(),
});

adminProductsRouter.get('/options/:optionId/availability', async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);
    if (!Number.isInteger(optionId) || optionId <= 0) return res.status(400).json({ error: 'Invalid id' });
    const { pool } = await import('../../db.js');
    const { rows } = await pool.query(
      `SELECT id, to_char(date, 'YYYY-MM-DD') AS date,
              capacity_override, is_closed, notes
         FROM option_availability
        WHERE option_id = $1
        ORDER BY date`,
      [optionId],
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// Upsert: si ya existe override para esa fecha, lo reemplaza.
adminProductsRouter.post('/options/:optionId/availability', async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);
    if (!Number.isInteger(optionId) || optionId <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const { pool } = await import('../../db.js');
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO option_availability (option_id, date, capacity_override, is_closed, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (option_id, date) DO UPDATE
         SET capacity_override = EXCLUDED.capacity_override,
             is_closed = EXCLUDED.is_closed,
             notes = EXCLUDED.notes
       RETURNING id`,
      [
        optionId, parsed.data.date,
        parsed.data.capacity_override ?? null,
        parsed.data.is_closed ?? false,
        parsed.data.notes ?? null,
      ],
    );
    res.status(201).json({ data: { id: rows[0].id } });
  } catch (err) { next(err); }
});

adminProductsRouter.delete('/availability/:availabilityId', async (req, res, next) => {
  try {
    const id = Number(req.params.availabilityId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const { pool } = await import('../../db.js');
    const result = await pool.query(`DELETE FROM option_availability WHERE id = $1`, [id]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ─── Imágenes ───────────────────────────────────────────

const imageSchema = z.object({
  url: z.string().url().max(800),
  alt_text: z.string().max(200).optional().nullable(),
  is_hero: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

adminProductsRouter.post('/:productId/images', async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product id' });
    const parsed = imageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const id = await adminCreateImage(productId, parsed.data);
    res.status(201).json({ data: { id } });
  } catch (err) { next(err); }
});

adminProductsRouter.patch('/images/:imageId', async (req, res, next) => {
  try {
    const id = Number(req.params.imageId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = imageSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const ok = await adminUpdateImage(id, parsed.data);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminProductsRouter.delete('/images/:imageId', async (req, res, next) => {
  try {
    const id = Number(req.params.imageId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const ok = await adminDeleteImage(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
