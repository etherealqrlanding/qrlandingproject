import { Router } from 'express';
import { z } from 'zod';
import { getProductBySlug, listCategories, listProducts } from '../repos/catalog.js';
import { pool } from '../db.js';
import { getSameDayCutoff, getExchangeRate, getSupportWhatsapp, getBookingHorizonMonths } from '../services/settings.js';
import { getAbout, getFaq } from '../services/content.js';

export const catalogRouter = Router();

catalogRouter.get('/categories', async (_req, res, next) => {
  try {
    const rows = await listCategories();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

const listProductsQuery = z.object({
  category: z.string().min(1).max(64).optional(),
});

catalogRouter.get('/products', async (req, res, next) => {
  try {
    const parsed = listProductsQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const rows = await listProducts({ categorySlug: parsed.data.category });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/products/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    const product = await getProductBySlug(slug);
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

// ─── Disponibilidad por option en un rango de fechas ─────────────
// Devuelve, para cada fecha del rango, si está disponible y un hint de cupos restantes.
// NO expone los cupos exactos al frontend público (solo categorías: ok / low / full / closed).
// `pax` (adultos + menores, comparten un único pool de cupo — ver /capacity) es opcional y
// por defecto 1: con pax=1 el cálculo de full/low da exactamente igual que antes de este
// parámetro, así que los consumidores que no lo mandan (checkout público, reprogramar) no
// cambian de comportamiento.
const availabilityQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pax: z.coerce.number().int().min(1).max(50).optional(),
});

// Cupo restante para una fecha concreta — usado por el checkout para capear el stepper de pax
catalogRouter.get('/options/:optionId/capacity', async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);
    if (!Number.isInteger(optionId) || optionId <= 0) return res.status(400).json({ error: 'Invalid id' });
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });

    const { rows: optRows } = await pool.query<{
      default_capacity_per_day: number; is_active: boolean;
    }>(
      `SELECT default_capacity_per_day, is_active FROM product_options WHERE id = $1 LIMIT 1`,
      [optionId],
    );
    if (!optRows[0] || !optRows[0].is_active) return res.status(404).json({ error: 'Option not found' });

    // Cutoff del mismo día
    const cutoff = await getSameDayCutoff();
    if (cutoff) {
      const nowBA = new Date(Date.now() - 3 * 60 * 60 * 1000);
      if (date === nowBA.toISOString().slice(0, 10)) {
        const cur = nowBA.getUTCHours() * 60 + nowBA.getUTCMinutes();
        const [ch, cm] = cutoff.split(':').map(Number);
        if (cur >= ch * 60 + cm) return res.json({ data: { remaining: 0, capacity: 0, status: 'closed', reason: 'cutoff' } });
      }
    }

    // Override manual
    const { rows: ovRows } = await pool.query<{ capacity_override: number | null; is_closed: boolean }>(
      `SELECT capacity_override, is_closed FROM option_availability WHERE option_id = $1 AND date = $2 LIMIT 1`,
      [optionId, date],
    );
    const ov = ovRows[0];
    if (ov?.is_closed) return res.json({ data: { remaining: 0, capacity: 0, status: 'closed' } });

    const capacity = ov?.capacity_override ?? optRows[0].default_capacity_per_day;

    const { rows: bRows } = await pool.query<{ total: number }>(
      `SELECT COALESCE(SUM(oi.adults + oi.children), 0)::int AS total
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.option_id = $1 AND oi.service_date = $2::date AND o.status IN ('paid', 'pending')`,
      [optionId, date],
    );
    const remaining = Math.max(0, capacity - (bRows[0]?.total ?? 0));
    res.json({ data: { remaining, capacity, status: remaining === 0 ? 'full' : 'available' } });
  } catch (err) { next(err); }
});

// Tipo de cambio USD→ARS vigente — endpoint público (solo lectura)
catalogRouter.get('/settings/exchange-rate', async (_req, res, next) => {
  try {
    const rate = await getExchangeRate();
    res.json({ data: { rate } });
  } catch (err) { next(err); }
});

// Horario límite de reservas del mismo día — endpoint público
catalogRouter.get('/settings/booking-cutoff', async (_req, res, next) => {
  try {
    const time = await getSameDayCutoff();
    res.json({ data: { time } });
  } catch (err) { next(err); }
});

// Horizonte de venta (hasta cuántos meses a futuro se puede reservar) — endpoint público
catalogRouter.get('/settings/booking-horizon', async (_req, res, next) => {
  try {
    const months = await getBookingHorizonMonths();
    res.json({ data: { months } });
  } catch (err) { next(err); }
});

// Número de WhatsApp de contacto — endpoint público (solo lectura)
catalogRouter.get('/settings/whatsapp', async (_req, res, next) => {
  try {
    const number = await getSupportWhatsapp();
    res.json({ data: { number } });
  } catch (err) { next(err); }
});

// Contenido editable — endpoints públicos (solo lectura)
catalogRouter.get('/content/about', async (_req, res, next) => {
  try {
    res.json({ data: await getAbout() });
  } catch (err) { next(err); }
});

catalogRouter.get('/content/faq', async (_req, res, next) => {
  try {
    res.json({ data: await getFaq() });
  } catch (err) { next(err); }
});

catalogRouter.get('/options/:optionId/availability', async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);
    if (!Number.isInteger(optionId) || optionId <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = availabilityQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid range', details: parsed.error.flatten() });

    // 1) Datos base de la option + días de operación de la casa (product_available_days) —
    // un día está abierto solo si está en AMBOS conjuntos (intersección casa ∩ tier).
    const { rows: optRows } = await pool.query<{
      default_capacity_per_day: number;
      available_days: number[];
      product_available_days: number[];
      is_active: boolean;
      low_availability_threshold: number;
      show_remaining_count: boolean;
    }>(
      `SELECT po.default_capacity_per_day, po.available_days, po.is_active,
              po.low_availability_threshold, po.show_remaining_count,
              p.available_days AS product_available_days
         FROM product_options po
         JOIN products p ON p.id = po.product_id
        WHERE po.id = $1 LIMIT 1`,
      [optionId],
    );
    const option = optRows[0];
    if (!option || !option.is_active) return res.status(404).json({ error: 'Option not found' });

    // Calcular si hoy ya pasó el horario límite global (hora Buenos Aires = UTC-3)
    const cutoffTime = await getSameDayCutoff();
    const nowBA = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const todayBA = nowBA.toISOString().slice(0, 10);
    let todayCutoffPassed = false;
    if (cutoffTime) {
      const currentMin = nowBA.getUTCHours() * 60 + nowBA.getUTCMinutes();
      const [ch, cm] = cutoffTime.split(':').map(Number);
      todayCutoffPassed = currentMin >= ch * 60 + cm;
    }

    // Horizonte de venta: hasta qué fecha se puede reservar (null = sin tope).
    // Se calcula acá y se aplica en el loop de abajo pase lo que pase con el `to`
    // pedido, para que el tope sea real y no dependa de que el cliente lo respete.
    const horizonMonths = await getBookingHorizonMonths();
    const horizonDate = horizonMonths != null
      ? (() => {
          const d = new Date(`${todayBA}T00:00:00`);
          d.setMonth(d.getMonth() + horizonMonths);
          return d.toISOString().slice(0, 10);
        })()
      : null;

    // 2) Reservas confirmadas por fecha (sumamos adultos + menores de órdenes pagadas)
    const { rows: bookings } = await pool.query<{ service_date: string; total_pax: number }>(
      `SELECT to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
              SUM(oi.adults + oi.children)::int AS total_pax
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.option_id = $1
          AND oi.service_date BETWEEN $2 AND $3
          AND o.status IN ('paid', 'pending')
        GROUP BY oi.service_date`,
      [optionId, parsed.data.from, parsed.data.to],
    );
    const bookedByDate = new Map(bookings.map((b) => [b.service_date, b.total_pax]));

    // 3) Overrides manuales por fecha
    const { rows: overrides } = await pool.query<{
      date: string; capacity_override: number | null; is_closed: boolean;
    }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, capacity_override, is_closed
         FROM option_availability
        WHERE option_id = $1 AND date BETWEEN $2 AND $3`,
      [optionId, parsed.data.from, parsed.data.to],
    );
    const overrideByDate = new Map(overrides.map((o) => [o.date, o]));
    const pax = parsed.data.pax ?? 1;

    // 4) Generar respuesta día por día
    const result: Array<{ date: string; status: 'available' | 'low' | 'full' | 'closed'; reason?: string; remaining?: number }> = [];
    const start = new Date(`${parsed.data.from}T00:00:00`);
    const end = new Date(`${parsed.data.to}T00:00:00`);
    if (end < start) return res.status(400).json({ error: 'to must be >= from' });

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Lun..7=Dom

      if (horizonDate && iso > horizonDate) {
        result.push({ date: iso, status: 'closed', reason: 'beyond_horizon' });
        continue;
      }
      if (!option.available_days.includes(dow) || !option.product_available_days.includes(dow)) {
        result.push({ date: iso, status: 'closed', reason: 'not_operating_day' });
        continue;
      }
      if (iso === todayBA && todayCutoffPassed) {
        result.push({ date: iso, status: 'closed', reason: 'cutoff' });
        continue;
      }
      const ov = overrideByDate.get(iso);
      if (ov?.is_closed) {
        result.push({ date: iso, status: 'closed', reason: 'manually_closed' });
        continue;
      }
      const capacity = ov?.capacity_override ?? option.default_capacity_per_day;
      const booked = bookedByDate.get(iso) ?? 0;
      const remaining = capacity - booked;

      // "full" acá significa "no entra este grupo" — con pax=1 (default) equivale
      // exactamente a remaining <= 0, igual que antes de tener este parámetro.
      if (capacity > 0 && remaining < pax) {
        result.push({ date: iso, status: 'full' });
      } else if (capacity > 0 && (remaining - pax) < option.low_availability_threshold) {
        // Exponer el conteo exacto solo si el admin lo habilitó
        const entry: (typeof result)[number] = { date: iso, status: 'low' };
        if (option.show_remaining_count) entry.remaining = remaining;
        result.push(entry);
      } else {
        result.push({ date: iso, status: 'available' });
      }
    }

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
