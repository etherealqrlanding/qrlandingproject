import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { refundPayment } from '../../services/mercadopago.js';
import { sendOrderPaidNotifications, sendOrderRefundedNotifications, sendOrderModifiedNotifications, sendOrderIncreasedNotifications, sendCashCollectedNotifications, sendAdminCancelledNotifications } from '../../services/email.js';
import { logPaymentEvent, applyOrderReduction } from '../../repos/orders.js';
import { computeOrderReduction, type OrderReductionSnapshot } from '../../services/orderReduction.js';
import { recomputeCashCommission } from '../../services/orderCommission.js';
import { createAddonForOrder, createCashAddonForOrder } from '../../services/orderAddon.js';
import { listPendingAddonsByOrderPublicId, getAddonForAction, applyAddonPayment, cancelAddon } from '../../repos/addons.js';
import { syncOrderWithMp } from '../checkout.js';
import { getModifyWindow, getCancelWindow, checkOperationWindow } from '../../services/settings.js';
import { checkSingleDateAvailability } from '../../repos/availability.js';

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
      service_date: string | Date;
    }>(
      `SELECT o.id, o.status::text AS status, o.mp_payment_id,
              o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
              o.exchange_rate_used::float AS exchange_rate_used,
              oi.service_date
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.public_id = $1
        ORDER BY oi.id LIMIT 1`,
      [publicId],
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Not found' });

    const cancelCheck = checkOperationWindow(await getCancelWindow(), order.service_date);
    if (cancelCheck.blocked) return res.status(409).json({ error: cancelCheck.message });

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

// ─── Modificar reserva reduciendo pax/traslado + reintegro parcial (MP) ───────
// El cliente se baja pasajeros o quita el traslado: se reintegra el delta por MP,
// se ajusta la reserva (pax/totales), se libera el cupo y se recalcula la comisión.
// Para AGREGAR algo o cambiar de servicio: cancelar + crear una reserva nueva.
const modifySchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  transfer_requested: z.boolean(),
  reason: z.string().max(500).optional(),
  notify_customer: z.boolean().optional().default(true),
});

adminOrdersRouter.post('/:publicId/modify', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const parsed = modifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    // 1) Cargar orden + item + atribución (todo lo congelado que necesita el cálculo)
    const { rows } = await pool.query<{
      order_id: number; status: string; payment_method: string; mp_payment_id: string | null;
      total_usd: number; total_ars: number; exchange_rate_used: number;
      item_id: number; adults: number; children: number;
      unit_price_adult_usd: number; unit_price_child_usd: number | null;
      subtotal_usd: number; transfer_requested: boolean; transfer_hotel: string | null;
      service_date: string | Date;
      commission_percent: number | null;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method, o.mp_payment_id,
              o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
              o.exchange_rate_used::float AS exchange_rate_used,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd,
              oi.transfer_requested, oi.transfer_hotel,
              oi.service_date,
              a.commission_percent_snapshot::float AS commission_percent
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN order_attributions a ON a.order_id = o.id
        WHERE o.public_id = $1
        ORDER BY oi.id
        LIMIT 1`,
      [publicId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });

    const modifyCheck = checkOperationWindow(await getModifyWindow(), row.service_date);
    if (modifyCheck.blocked) return res.status(409).json({ error: modifyCheck.message });

    // 2) Validaciones de estado
    if (row.status !== 'paid') {
      return res.status(400).json({ error: `Solo se pueden modificar reservas pagadas. Estado actual: ${row.status}` });
    }
    if (row.payment_method !== 'mercadopago') {
      return res.status(400).json({ error: 'Esta reserva es en efectivo. La devolución en efectivo se gestiona desde su vía correspondiente.' });
    }
    if (!row.mp_payment_id) {
      return res.status(400).json({ error: 'La orden no tiene un pago de Mercado Pago confirmado. Sincronizala con MP primero.' });
    }

    // 3) Calcular la reducción (validación + montos) sobre datos congelados
    const snap: OrderReductionSnapshot = {
      origAdults: row.adults,
      origChildren: row.children,
      unitPriceAdultUsd: row.unit_price_adult_usd,
      unitPriceChildUsd: row.unit_price_child_usd,
      subtotalUsd: row.subtotal_usd,
      transferRequested: row.transfer_requested,
      totalArs: row.total_ars,
      exchangeRateUsed: row.exchange_rate_used,
      commissionPercent: row.commission_percent,
    };
    const calc = computeOrderReduction(snap, {
      adults: parsed.data.adults,
      children: parsed.data.children,
      transferRequested: parsed.data.transfer_requested,
    });
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    // 4) Refund en MP ANTES de tocar la DB. Idempotency key atada a la composición DESTINO:
    //    reintentar el mismo cambio devuelve el mismo refund; reducciones sucesivas (que
    //    apuntan a composiciones distintas) nunca colisionan.
    const idempotencyKey = `refund:${row.order_id}:to:${parsed.data.adults}a${parsed.data.children}n${parsed.data.transfer_requested ? 'T' : 'F'}`;
    try {
      await refundPayment(row.mp_payment_id, calc.refundArs, idempotencyKey);
    } catch (err) {
      const message = (err as Error).message ?? 'Refund failed';
      await logPaymentEvent(row.order_id, 'modify_refund_failed', row.mp_payment_id, {
        error: message, target: parsed.data, refund_ars: calc.refundArs,
      });
      return res.status(502).json({ error: `Mercado Pago rechazó el reintegro: ${message}` });
    }

    // 5) Persistir la reducción (item + totales + comisión + registro de reintegro)
    const newTransfer = parsed.data.transfer_requested;
    const noteLine = `[${new Date().toISOString()}] Modificación: ${row.adults}→${parsed.data.adults} ad, ${row.children}→${parsed.data.children} men${row.transfer_requested && !newTransfer ? ', traslado removido' : ''}. Reintegro USD ${calc.refundUsd}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`;
    await applyOrderReduction({
      orderId: row.order_id,
      itemId: row.item_id,
      origAdults: row.adults,
      origChildren: row.children,
      newAdults: parsed.data.adults,
      newChildren: parsed.data.children,
      newTransferRequested: newTransfer,
      newTransferHotel: newTransfer ? row.transfer_hotel : null,
      newSubtotalUsd: calc.newSubtotalUsd,
      newTotalArs: calc.newTotalArs,
      refundUsd: calc.refundUsd,
      refundArs: calc.refundArs,
      newCommissionUsd: calc.newCommissionUsd,
      newCommissionArs: calc.newCommissionArs,
      newNetTotalUsd: null,
      noteLine,
      actor: 'admin',
    });

    // 6) Notificar (fire-and-forget)
    if (parsed.data.notify_customer !== false) {
      sendOrderModifiedNotifications(row.order_id, calc.refundUsd, calc.refundArs, parsed.data.reason).catch((e) =>
        console.error('[email] modify notification failed for order', row.order_id, e),
      );
    }

    res.json({
      data: {
        ok: true,
        refund_usd: calc.refundUsd,
        refund_ars: calc.refundArs,
        new_total_usd: calc.newSubtotalUsd,
        new_adults: parsed.data.adults,
        new_children: parsed.data.children,
        new_transfer: newTransfer,
      },
    });
  } catch (err) { next(err); }
});

// ─── Confirmar cobro en efectivo (admin en nombre del vendedor) ────────────────
// El admin marca como cobrada una orden pendiente en efectivo atribuida a un vendedor,
// cuando el vendedor no puede operar el portal por su cuenta.
adminOrdersRouter.post('/:publicId/collect-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await pool.query<{ id: number; status: string; payment_method: string }>(
      `SELECT id, status::text AS status, payment_method
         FROM orders WHERE public_id = $1 LIMIT 1`,
      [publicId],
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.payment_method !== 'cash') {
      return res.status(400).json({ error: 'Esta orden no es en efectivo.' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ error: 'La orden ya fue procesada anteriormente.' });
    }

    await pool.query(
      `UPDATE orders SET status = 'paid', paid_at = NOW(), cash_collected_at = NOW() WHERE id = $1`,
      [order.id],
    );
    await pool.query(
      `INSERT INTO payment_events (order_id, event_type, payload)
       VALUES ($1, 'cash_collected_by_admin', $2::jsonb)`,
      [order.id, JSON.stringify({ actor: 'admin' })],
    );

    sendCashCollectedNotifications(order.id, 'admin').catch((e) =>
      console.error('[collect-cash admin] email send failed:', e),
    );

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ─── Reducir reserva en efectivo (devolución en mano) ─────────────────────────
// El pasajero se baja pax o quita traslado en una reserva EN EFECTIVO ya cobrada:
// el vendedor le devuelve el delta en efectivo. Se ajusta la reserva, se libera el
// cupo y se recalcula el neto que el vendedor nos debe rendir. No pasa por MP.
adminOrdersRouter.post('/:publicId/reduce-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const parsed = modifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const { rows } = await pool.query<{
      order_id: number; status: string; payment_method: string;
      total_ars: number; exchange_rate_used: number;
      item_id: number; adults: number; children: number;
      unit_price_adult_usd: number; unit_price_child_usd: number | null;
      subtotal_usd: number; transfer_requested: boolean; transfer_hotel: string | null;
      service_date: string | Date;
      seller_id: number | null; net_total_usd: number | null; net_settled_at: string | null;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              o.total_ars::float AS total_ars, o.exchange_rate_used::float AS exchange_rate_used,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested, oi.transfer_hotel,
              oi.service_date,
              a.seller_id, a.net_total_usd_snapshot::float AS net_total_usd,
              a.net_settled_at
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN order_attributions a ON a.order_id = o.id
        WHERE o.public_id = $1
        ORDER BY oi.id
        LIMIT 1`,
      [publicId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.payment_method !== 'cash') {
      return res.status(400).json({ error: 'Esta vía es solo para reservas en efectivo. Para Mercado Pago usá el reintegro.' });
    }
    if (row.status !== 'paid') {
      return res.status(400).json({ error: `Solo se pueden reducir reservas en efectivo ya cobradas. Estado actual: ${row.status}` });
    }
    if (row.net_settled_at) {
      return res.status(409).json({ error: 'Esta orden ya fue rendida al operador. No se puede modificar una vez liquidada.' });
    }
    const adminReduceCheck = checkOperationWindow(await getModifyWindow(), row.service_date);
    if (adminReduceCheck.blocked) return res.status(409).json({ error: adminReduceCheck.message });

    const snap: OrderReductionSnapshot = {
      origAdults: row.adults,
      origChildren: row.children,
      unitPriceAdultUsd: row.unit_price_adult_usd,
      unitPriceChildUsd: row.unit_price_child_usd,
      subtotalUsd: row.subtotal_usd,
      transferRequested: row.transfer_requested,
      totalArs: row.total_ars,
      exchangeRateUsed: row.exchange_rate_used,
      commissionPercent: null, // efectivo: la comisión no es por % sino total − neto
    };
    const calc = computeOrderReduction(snap, {
      adults: parsed.data.adults,
      children: parsed.data.children,
      transferRequested: parsed.data.transfer_requested,
    });
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    // Comisión/neto recalculados para efectivo (solo si hay atribución).
    const hasAttribution = row.seller_id != null;
    const cash = hasAttribution
      ? recomputeCashCommission(row.net_total_usd, row.subtotal_usd, calc.newSubtotalUsd)
      : { newNetTotalUsd: null, newCommissionUsd: 0 };
    const newCommissionUsd = hasAttribution ? cash.newCommissionUsd : null;
    const newCommissionArs = newCommissionUsd != null ? Math.round(newCommissionUsd * row.exchange_rate_used * 100) / 100 : null;

    const newTransfer = parsed.data.transfer_requested;
    const noteLine = `[${new Date().toISOString()}] Reducción efectivo: ${row.adults}→${parsed.data.adults} ad, ${row.children}→${parsed.data.children} men${row.transfer_requested && !newTransfer ? ', traslado removido' : ''}. Devolución en efectivo USD ${calc.refundUsd}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`;
    await applyOrderReduction({
      orderId: row.order_id,
      itemId: row.item_id,
      origAdults: row.adults,
      origChildren: row.children,
      newAdults: parsed.data.adults,
      newChildren: parsed.data.children,
      newTransferRequested: newTransfer,
      newTransferHotel: newTransfer ? row.transfer_hotel : null,
      newSubtotalUsd: calc.newSubtotalUsd,
      newTotalArs: calc.newTotalArs,
      refundUsd: calc.refundUsd,
      refundArs: calc.refundArs,
      newCommissionUsd,
      newCommissionArs,
      newNetTotalUsd: hasAttribution ? cash.newNetTotalUsd : null,
      noteLine,
      actor: 'admin',
    });

    if (parsed.data.notify_customer !== false) {
      sendOrderModifiedNotifications(row.order_id, calc.refundUsd, calc.refundArs, parsed.data.reason, true).catch((e) =>
        console.error('[email] cash reduce notification failed for order', row.order_id, e),
      );
    }

    res.json({
      data: {
        ok: true,
        refund_usd: calc.refundUsd,
        refund_ars: calc.refundArs,
        new_total_usd: calc.newSubtotalUsd,
        new_adults: parsed.data.adults,
        new_children: parsed.data.children,
        new_transfer: newTransfer,
      },
    });
  } catch (err) { next(err); }
});

// ─── Ampliar reserva en efectivo → crea ampliación PENDIENTE de cobro ─────────
// El pasajero suma acompañantes: se registra una ampliación pendiente que reserva el
// cupo. El cobro se confirma después (flujo pendiente → cobrada, como la reserva
// original). Aumentar en MP va por link incremental (flujo aparte).
const increaseSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});

adminOrdersRouter.post('/:publicId/increase-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const parsed = increaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const result = await createCashAddonForOrder({
      orderPublicId: publicId, adults: parsed.data.adults, children: parsed.data.children,
    });
    if (!result.ok) return res.status(result.httpStatus).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) { next(err); }
});

// ─── Ampliaciones pendientes de una orden ─────────────────────────────────────
adminOrdersRouter.get('/:publicId/addons', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const addons = await listPendingAddonsByOrderPublicId(publicId);
    res.json({ data: addons });
  } catch (err) { next(err); }
});

// Confirmar cobro de una ampliación en EFECTIVO → la fusiona en la orden.
adminOrdersRouter.post('/addons/:addonPublicId/collect', async (req, res, next) => {
  try {
    const addonPublicId = req.params.addonPublicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(addonPublicId)) return res.status(400).json({ error: 'Invalid id' });
    const addon = await getAddonForAction(addonPublicId);
    if (!addon) return res.status(404).json({ error: 'Ampliación no encontrada' });
    if (addon.payment_method !== 'cash') return res.status(400).json({ error: 'Esta ampliación no es en efectivo.' });
    if (addon.status !== 'pending') return res.status(409).json({ error: 'La ampliación ya fue procesada.' });

    const r = await applyAddonPayment(addonPublicId, null);
    if (!r.applied) return res.status(409).json({ error: 'No se pudo aplicar la ampliación.' });
    if (!r.alreadyApplied && r.orderId != null) {
      sendOrderIncreasedNotifications(r.orderId, r.chargeUsd ?? 0, r.chargeArs ?? 0).catch((e) =>
        console.error('[email] cash addon collect notification failed', e));
    }
    res.json({ data: { ok: true, charge_usd: r.chargeUsd, charge_ars: r.chargeArs } });
  } catch (err) { next(err); }
});

// Cancelar una ampliación pendiente (libera el cupo).
adminOrdersRouter.post('/addons/:addonPublicId/cancel', async (req, res, next) => {
  try {
    const addonPublicId = req.params.addonPublicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(addonPublicId)) return res.status(400).json({ error: 'Invalid id' });
    const orderId = await cancelAddon(addonPublicId);
    if (orderId == null) return res.status(409).json({ error: 'La ampliación no está pendiente.' });
    await logPaymentEvent(orderId, 'addon_cancelled', null, { addon_public_id: addonPublicId });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ─── Ampliar reserva de MP: genera link incremental por la diferencia ─────────
// El pasajero suma acompañantes en una reserva pagada por MP: se genera un cobro NUEVO
// solo por el delta (link para el cliente). Reserva el cupo hasta que se pague o caduque.
const addMpSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});

adminOrdersRouter.post('/:publicId/add-mp', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const parsed = addMpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const result = await createAddonForOrder({
      orderPublicId: publicId,
      adults: parsed.data.adults,
      children: parsed.data.children,
    });
    if (!result.ok) return res.status(result.httpStatus).json({ error: result.error });
    res.json({ data: result.data });
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

// POST /api/admin/orders/:publicId/reschedule — reprograma la fecha de servicio.
const rescheduleSchema = z.object({
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
  notify_customer: z.boolean().optional(),
});

adminOrdersRouter.post('/:publicId/reschedule', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const { new_date, reason } = parsed.data;
    const newDateObj = new Date(`${new_date}T00:00:00`);
    if (Number.isNaN(newDateObj.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
    if (newDateObj.getTime() < Date.now() - 86_400_000) return res.status(400).json({ error: 'La fecha no puede ser pasada' });

    const { rows } = await pool.query<{
      order_id: number; status: string; item_id: number; option_id: number;
      adults: number; children: number; service_date: string;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status,
              oi.id AS item_id, oi.option_id, oi.adults, oi.children,
              to_char(oi.service_date, 'YYYY-MM-DD') AS service_date
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.public_id = $1
        ORDER BY oi.id LIMIT 1`,
      [publicId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!['pending', 'paid'].includes(row.status)) {
      return res.status(400).json({ error: `No se puede reprogramar una reserva en estado "${row.status}".` });
    }
    if (row.service_date === new_date) {
      return res.status(400).json({ error: 'La nueva fecha es igual a la fecha actual.' });
    }

    const { rows: optionRows } = await pool.query<{ default_capacity_per_day: number; available_days: number[] }>(
      `SELECT default_capacity_per_day, available_days FROM product_options WHERE id = $1 LIMIT 1`,
      [row.option_id],
    );
    const option = optionRows[0];
    if (!option) return res.status(404).json({ error: 'Opción no encontrada' });

    const isoDow = newDateObj.getDay() === 0 ? 7 : newDateObj.getDay();
    if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
      return res.status(400).json({ error: 'El servicio no opera ese día de la semana.' });
    }
    const availCheck = await checkSingleDateAvailability(
      row.option_id, option.default_capacity_per_day, new_date, row.adults + row.children,
    );
    if (!availCheck.ok) return res.status(409).json({ error: availCheck.message ?? 'Fecha no disponible' });

    await pool.query(`UPDATE order_items SET service_date = $1 WHERE id = $2`, [new_date, row.item_id]);
    await logPaymentEvent(row.order_id, 'order_rescheduled', null, {
      prev_date: row.service_date, new_date, actor: 'admin', reason: reason ?? null,
    });

    res.json({ data: { ok: true, prev_date: row.service_date, new_date } });
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
              cancelled_by   = CASE WHEN $1 = 'cancelled' THEN 'admin' ELSE cancelled_by END,
              cancelled_at   = CASE WHEN $1 = 'cancelled' AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
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

    // Disparar notificaciones por email según la transición de estado
    if (parsed.data.status === 'paid' && previousStatus !== 'paid') {
      sendOrderPaidNotifications(rows[0].id).catch((err) =>
        console.error('[email] manual paid notification failed for order', rows[0].id, err),
      );
    }
    if (parsed.data.status === 'cancelled' && previousStatus !== 'cancelled') {
      sendAdminCancelledNotifications(rows[0].id, parsed.data.note ?? null).catch((err) =>
        console.error('[email] admin cancel notification failed for order', rows[0].id, err),
      );
    }

    res.json({ data: { ok: true, status: rows[0].status } });
  } catch (err) { next(err); }
});

// POST /api/admin/orders/bulk-delete — eliminación masiva (hasta 100 órdenes de una vez).
adminOrdersRouter.post('/bulk-delete', async (req, res, next) => {
  try {
    const parsed = z.object({
      public_ids: z.array(z.string().regex(/^[0-9a-f-]{8,40}$/i)).min(1).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const result = await pool.query(
      `DELETE FROM orders WHERE public_id = ANY($1::uuid[]) RETURNING id`,
      [parsed.data.public_ids],
    );
    res.json({ data: { deleted: result.rowCount ?? 0 } });
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
