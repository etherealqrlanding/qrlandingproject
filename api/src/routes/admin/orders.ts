import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { refundPayment } from '../../services/mercadopago.js';
import { sendOrderPaidNotifications, sendOrderRefundedNotifications } from '../../services/email.js';
import { logPaymentEvent } from '../../repos/orders.js';
import { syncOrderWithMp } from '../checkout.js';

export const adminOrdersRouter = Router();

const listQuery = z.object({
  status: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired']).optional(),
  ref: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

adminOrdersRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() });

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, ...vals: unknown[]) => {
      vals.forEach((v) => { params.push(v); });
      where.push(sql);
    };
    if (parsed.data.status) add(`o.status = $${params.length + 1}`, parsed.data.status);
    if (parsed.data.ref) add(`o.ref_code = $${params.length + 1}`, parsed.data.ref);
    if (parsed.data.from) add(`o.created_at >= $${params.length + 1}::date`, parsed.data.from);
    if (parsed.data.to) add(`o.created_at < ($${params.length + 1}::date + INTERVAL '1 day')`, parsed.data.to);
    if (parsed.data.search) {
      const term = `%${parsed.data.search.toLowerCase()}%`;
      params.push(term);
      where.push(`(LOWER(o.customer_email) LIKE $${params.length} OR LOWER(o.customer_name) LIKE $${params.length})`);
    }
    const limit = parsed.data.limit ?? 100;

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         o.id, o.public_id, o.status::text AS status,
         o.customer_name, o.customer_email, o.customer_nationality,
         o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
         o.ref_code, o.mp_payment_status, o.payment_method,
         o.created_at, o.paid_at,
         oi.product_name_snapshot AS product_name,
         oi.option_name_snapshot AS option_name,
         to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
         oi.adults, oi.children,
         a.seller_id, s.code AS seller_code, s.name AS seller_name,
         a.commission_amount_usd::float AS commission_amount_usd,
         a.paid_to_seller_at
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN order_attributions a ON a.order_id = o.id
         LEFT JOIN sellers s ON s.id = a.seller_id
         ${whereSql}
        ORDER BY o.created_at DESC
        LIMIT ${limit}`,
      params,
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

adminOrdersRouter.get('/:publicId', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const { rows: orderRows } = await pool.query(
      `SELECT
         o.*,
         a.seller_id, s.code AS seller_code, s.name AS seller_name,
         a.commission_percent_snapshot, a.commission_amount_usd::float AS commission_amount_usd,
         a.commission_amount_ars::float AS commission_amount_ars,
         a.net_total_usd_snapshot::float AS net_total_usd,
         a.paid_to_seller_at, a.net_settled_at
         FROM orders o
         LEFT JOIN order_attributions a ON a.order_id = o.id
         LEFT JOIN sellers s ON s.id = a.seller_id
        WHERE o.public_id = $1
        LIMIT 1`,
      [publicId],
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Not found' });

    const [items, events] = await Promise.all([
      pool.query(
        `SELECT *, to_char(service_date, 'YYYY-MM-DD') AS service_date
           FROM order_items WHERE order_id = $1 ORDER BY id`,
        [order.id],
      ),
      pool.query(
        `SELECT id, event_type, mp_resource_id, payload, created_at
           FROM payment_events WHERE order_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [order.id],
      ),
    ]);
    res.json({ data: { ...order, items: items.rows, events: events.rows } });
  } catch (err) { next(err); }
});

// 'refunded' está excluido a propósito: el único camino para llegar a ese estado
// es vía el endpoint /refund que llama a Mercado Pago. Permitir setearlo manualmente
// dejaría la DB inconsistente con MP (orden marcada como reintegrada pero sin devolución real).
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'paid', 'failed', 'cancelled']),
  note: z.string().max(500).optional(),
});

// ─── Refund: cancela la reserva y reintegra al cliente ────────
const refundSchema = z.object({
  reason: z.string().max(500).optional(),
  notify_customer: z.boolean().optional().default(true),
  // Si se especifica amount_usd, hace refund parcial. Si se omite, refund total.
  amount_usd: z.number().positive().optional(),
});

adminOrdersRouter.post('/:publicId/refund', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    // 1) Cargar la orden y validar que se pueda reintegrar
    const { rows: orderRows } = await pool.query<{
      id: number; status: string; mp_payment_id: string | null;
      total_usd: number; total_ars: number; exchange_rate_used: number;
    }>(
      `SELECT id, status::text AS status, mp_payment_id,
              total_usd::float AS total_usd, total_ars::float AS total_ars,
              exchange_rate_used::float AS exchange_rate_used
         FROM orders WHERE public_id = $1 LIMIT 1`,
      [publicId],
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Not found' });

    if (order.status === 'refunded') {
      return res.status(409).json({ error: 'Esta orden ya fue reintegrada' });
    }
    if (order.status !== 'paid') {
      return res.status(400).json({ error: `Solo se pueden reintegrar órdenes pagadas. Estado actual: ${order.status}` });
    }
    if (!order.mp_payment_id) {
      return res.status(400).json({
        error: 'La orden no tiene un payment_id de Mercado Pago (el webhook no llegó a confirmarla todavía). Si el cobro fue por fuera de MP, marcala como "cancelled" desde el detalle.',
      });
    }

    // Refund parcial: validar y convertir USD → ARS con el rate de la orden
    let amountArs: number | undefined;
    let amountUsdToRefund: number | undefined;
    const isPartial = parsed.data.amount_usd != null && parsed.data.amount_usd < order.total_usd;
    if (parsed.data.amount_usd != null) {
      if (parsed.data.amount_usd > order.total_usd) {
        return res.status(400).json({ error: `El monto a reintegrar (USD ${parsed.data.amount_usd}) supera el total de la orden (USD ${order.total_usd}).` });
      }
      amountUsdToRefund = parsed.data.amount_usd;
      amountArs = Math.round(parsed.data.amount_usd * order.exchange_rate_used * 100) / 100;
    }

    // 2) Disparar el refund en MP con idempotency key determinística.
    //    Así, si se reintenta (doble clic, timeout, reproceso), MP NO reintegra dos veces.
    const idempotencyKey = `refund:${order.id}:${isPartial ? amountArs : 'full'}`;
    let refundResponse;
    try {
      refundResponse = await refundPayment(order.mp_payment_id, amountArs, idempotencyKey);
    } catch (err) {
      const message = (err as Error).message ?? 'Refund failed';
      await logPaymentEvent(order.id, 'refund_failed', order.mp_payment_id, {
        error: message, reason: parsed.data.reason, amount_usd: amountUsdToRefund,
      });
      return res.status(502).json({ error: `Mercado Pago rechazó el refund: ${message}` });
    }

    // 3) Actualizar la orden:
    //    - Refund total → status = 'refunded'
    //    - Refund parcial → orden sigue 'paid' (cliente sí recibió servicio parcial o ajuste)
    const newStatus = isPartial ? 'paid' : 'refunded';
    const noteLine = `[${new Date().toISOString()}] ${isPartial ? `Refund parcial USD ${amountUsdToRefund}` : 'Refund total procesado'}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`;
    await pool.query(
      `UPDATE orders
          SET status = $1::order_status,
              internal_notes = COALESCE(internal_notes || E'\\n', '') || $2,
              updated_at = NOW()
        WHERE id = $3`,
      [newStatus, noteLine, order.id],
    );

    await logPaymentEvent(order.id, isPartial ? 'refund_partial_processed' : 'refund_processed', order.mp_payment_id, {
      reason: parsed.data.reason ?? null,
      refund_id: refundResponse?.id ?? null,
      amount_ars: refundResponse?.amount ?? amountArs ?? null,
      amount_usd: amountUsdToRefund ?? order.total_usd,
    });

    // 4) Notificar (fire-and-forget) — incluye cliente + admin + vendedor si hubo atribución
    if (parsed.data.notify_customer !== false) {
      sendOrderRefundedNotifications(order.id, parsed.data.reason, amountUsdToRefund).catch((err) =>
        console.error('[email] refund notification failed for order', order.id, err),
      );
    }

    res.json({
      data: {
        ok: true,
        refund_id: refundResponse?.id ?? null,
        amount_ars: refundResponse?.amount ?? amountArs ?? null,
        amount_usd: amountUsdToRefund ?? order.total_usd,
        is_partial: isPartial,
        new_status: newStatus,
      },
    });
  } catch (err) { next(err); }
});

// ─── Sincronizar con Mercado Pago (respaldo del webhook) ──────
// Consulta MP por la referencia de la orden y actualiza estado + payment_id.
// Útil si el webhook no llegó: deja la orden en su estado real (y reintegrable).
adminOrdersRouter.post('/:publicId/sync-mp', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const result = await syncOrderWithMp(publicId);
    if (!result.found) {
      return res.status(404).json({ error: 'No se encontró ningún pago en Mercado Pago para esta orden. Si el cobro no se completó, la orden no debería figurar como pagada.' });
    }
    res.json({ data: { ok: true, status: result.status } });
  } catch (err) { next(err); }
});

adminOrdersRouter.patch('/:publicId/status', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    // Cargamos el estado previo para detectar transiciones (ej: pending → paid dispara emails)
    const { rows: prevRows } = await pool.query<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE public_id = $1 LIMIT 1`,
      [publicId],
    );
    const previousStatus = prevRows[0]?.status;

    const { rows } = await pool.query(
      `UPDATE orders
          SET status = $1::order_status,
              internal_notes = COALESCE($2, internal_notes),
              paid_at = CASE WHEN $1 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
              updated_at = NOW()
        WHERE public_id = $3
        RETURNING id, status::text AS status`,
      [parsed.data.status, parsed.data.note ?? null, publicId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      `INSERT INTO payment_events (order_id, event_type, payload)
       VALUES ($1, 'admin_status_change', $2::jsonb)`,
      [rows[0].id, JSON.stringify({ status: parsed.data.status, note: parsed.data.note ?? null, previous: previousStatus })],
    );

    // Disparar notificaciones por email si la transición es a 'paid' (simulación manual del webhook)
    if (parsed.data.status === 'paid' && previousStatus !== 'paid') {
      sendOrderPaidNotifications(rows[0].id).catch((err) =>
        console.error('[email] manual paid notification failed for order', rows[0].id, err),
      );
    }

    res.json({ data: { ok: true, status: rows[0].status } });
  } catch (err) { next(err); }
});

// DELETE /api/admin/orders/:publicId — borrado total e irreversible de la orden.
// Arrastra (FK ON DELETE CASCADE) order_items y order_attributions; los payment_events
// quedan con order_id = NULL (ON DELETE SET NULL) como rastro mínimo del cobro.
// Se permite incluso para órdenes pagadas: la decisión del negocio es darle flexibilidad
// total al admin, con la confirmación correspondiente del lado del front.
adminOrdersRouter.delete('/:publicId', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const result = await pool.query(`DELETE FROM orders WHERE public_id = $1 RETURNING id`, [publicId]);
    if ((result.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
