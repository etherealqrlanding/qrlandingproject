import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { RouteValidationError } from '../../errors.js';
import { refundPayment, createPreference } from '../../services/mercadopago.js';
import { createPixCharge } from '../../services/nautt.js';
import { sendOrderPaidNotifications, sendOrderRefundedNotifications, sendOrderModifiedNotifications, sendOrderIncreasedNotifications, sendCashCollectedNotifications, sendAdminCancelledNotifications, sendOrderRescheduledNotifications, sendCashOrderNotifications, sendPaymentLinkEmail } from '../../services/email.js';
import { logPaymentEvent, applyOrderReduction, archiveOrders, restoreFromArchive, listAdminArchive, ConcurrentModificationError, createPendingOrder, setOrderPreferenceId, setOrderPixCharge } from '../../repos/orders.js';
import { computeOrderReduction, type OrderReductionSnapshot } from '../../services/orderReduction.js';
import { recomputeCashCommission } from '../../services/orderCommission.js';
import { createAddonForOrder, createCashAddonForOrder } from '../../services/orderAddon.js';
import { listPendingAddonsByOrderPublicId, getAddonForAction, applyAddonPayment, cancelAddon, cancelPendingAddonsForOrder } from '../../repos/addons.js';
import { syncOrderWithMp } from '../checkout.js';
import { getModifyWindow, getCancelWindow, checkOperationWindow, getExchangeRate, convertUsdToArs } from '../../services/settings.js';
import { checkAvailabilityTxLocked, checkSingleDateAvailability } from '../../repos/availability.js';
import { createOrderReducedByAdminNotification, createCashAddonCreatedByAdminNotification, createOrderCreatedByAdminNotification } from '../../repos/notifications.js';
import { config } from '../../config.js';

export const adminOrdersRouter = Router();

const round2 = (n: number): number => Math.round(n * 100) / 100;

const collectCashCurrencySchema = z.object({ currency: z.enum(['ARS', 'USD']).default('ARS') });

const listQuery = z.object({
  status: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired']).optional(),
  ref: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// POST /api/admin/orders — reserva manual cargada por el equipo y asignada a un
// vendedor puntual (ej. el vendedor le pidió al equipo que se la cargue). Mirror
// de sellerRouter.post('/me/checkout', ...) pero el vendedor viene del body (elegido
// en el admin) en vez de req.seller, y la trazabilidad queda en payment_events con
// email del admin + datos del vendedor asignado — así el histórico de la orden deja
// claro que no la cargó ni el cliente ni el propio vendedor.
const adminCreateOrderSchema = z.object({
  seller_id: z.number().int().positive(),
  option_id: z.number().int().positive(),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'service_date must be YYYY-MM-DD'),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(160),
    phone: z.string().max(40).optional().nullable(),
    nationality: z.string().min(1, 'La nacionalidad es obligatoria').max(80),
    dni: z.string().max(40).optional().nullable(),
  }),
  payment_method: z.enum(['mercadopago', 'cash', 'pix']),
  transfer_requested: z.boolean().optional(),
  transfer_hotel: z.string().max(200).optional().nullable(),
  transfer_room: z.string().max(80).optional().nullable(),
});

adminOrdersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = adminCreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const input = parsed.data;

    // Revalidamos el vendedor server-side: el selector del admin solo lista activos,
    // pero no podemos confiar únicamente en lo que mandó el cliente.
    const { rows: sellerRows } = await pool.query<{ id: number; code: string; name: string; is_permanent: boolean }>(
      `SELECT id, code, name, is_permanent FROM sellers WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [input.seller_id],
    );
    const seller = sellerRows[0];
    if (!seller) return res.status(404).json({ error: 'Vendedor no encontrado o inactivo' });

    // Mismo gate que el portal del vendedor: efectivo solo si es permanente.
    if (input.payment_method === 'cash' && !seller.is_permanent) {
      return res.status(403).json({
        error: 'Ese vendedor no tiene habilitado el cobro en efectivo. Usá Mercado Pago para esta reserva.',
      });
    }

    const { rows: optionRows } = await pool.query<{
      id: number; product_id: number;
      name_es: string; name_en: string;
      price_adult_usd: string; price_child_usd: string | null;
      transfer_price_usd: string;
      net_price_adult_usd: string | null; net_price_child_usd: string | null;
      net_transfer_price_usd: string | null; net_price_currency: string;
      net_price_adult_ars: string | null; net_price_child_ars: string | null;
      net_transfer_price_ars: string | null;
      available_days: number[];
      default_capacity_per_day: number;
      product_name: string; product_slug: string;
      is_active: boolean; product_active: boolean;
    }>(
      `SELECT
         o.id, o.product_id, o.name_es, o.name_en,
         o.price_adult_usd::text AS price_adult_usd,
         o.price_child_usd::text  AS price_child_usd,
         o.transfer_price_usd::text AS transfer_price_usd,
         o.net_price_adult_usd::text    AS net_price_adult_usd,
         o.net_price_child_usd::text    AS net_price_child_usd,
         o.net_transfer_price_usd::text AS net_transfer_price_usd,
         o.net_price_currency,
         o.net_price_adult_ars::text    AS net_price_adult_ars,
         o.net_price_child_ars::text    AS net_price_child_ars,
         o.net_transfer_price_ars::text AS net_transfer_price_ars,
         o.available_days, o.default_capacity_per_day, o.is_active,
         p.name AS product_name, p.slug AS product_slug,
         p.is_active AS product_active
       FROM product_options o
       JOIN products p ON p.id = o.product_id
      WHERE o.id = $1 LIMIT 1`,
      [input.option_id],
    );
    const option = optionRows[0];
    if (!option || !option.is_active || !option.product_active) {
      return res.status(404).json({ error: 'Opción no encontrada o inactiva' });
    }

    const date = new Date(`${input.service_date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
    if (date.getTime() < Date.now() - 86_400_000) return res.status(400).json({ error: 'La fecha no puede ser pasada' });
    const isoDow = date.getDay() === 0 ? 7 : date.getDay();
    if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
      return res.status(400).json({ error: 'La opción no opera ese día', available_days: option.available_days });
    }

    const availCheck = await checkSingleDateAvailability(
      option.id, option.default_capacity_per_day, input.service_date, input.adults + input.children,
    );
    if (!availCheck.ok) {
      return res.status(409).json({ error: availCheck.message ?? 'Fecha no disponible' });
    }

    const priceAdult = Number.parseFloat(option.price_adult_usd);
    const priceChild = option.price_child_usd != null ? Number.parseFloat(option.price_child_usd) : 0;
    if (input.children > 0 && option.price_child_usd == null) {
      return res.status(400).json({ error: 'Esta opción no tiene precio para menores' });
    }
    const transferPriceUsd = Number.parseFloat(option.transfer_price_usd ?? '0');
    const transferSubtotal = (input.transfer_requested && transferPriceUsd > 0)
      ? Math.round(transferPriceUsd * (input.adults + input.children) * 100) / 100
      : 0;
    const subtotalUsd = Math.round((input.adults * priceAdult + input.children * priceChild) * 100) / 100 + transferSubtotal;

    const rate = await getExchangeRate();
    const totalArs = convertUsdToArs(subtotalUsd, rate);

    const pax = input.adults + input.children;
    const transferReq = (input.transfer_requested && transferPriceUsd > 0);
    const netCurrency = option.net_price_currency ?? 'USD';
    let netTotalUsd: number | null = null;
    if (netCurrency === 'USD') {
      const netAdult = option.net_price_adult_usd != null ? Number.parseFloat(option.net_price_adult_usd) : null;
      const netChild = option.net_price_child_usd != null ? Number.parseFloat(option.net_price_child_usd) : null;
      const netTransfer = option.net_transfer_price_usd != null ? Number.parseFloat(option.net_transfer_price_usd) : null;
      if (netAdult != null) {
        netTotalUsd = Math.round((
          input.adults * netAdult
          + input.children * (netChild ?? netAdult)
          + (transferReq && netTransfer != null ? netTransfer * pax : 0)
        ) * 100) / 100;
      }
    } else {
      const netAdultArs = option.net_price_adult_ars != null ? Number.parseFloat(option.net_price_adult_ars) : null;
      const netChildArs = option.net_price_child_ars != null ? Number.parseFloat(option.net_price_child_ars) : null;
      const netTransferArs = option.net_transfer_price_ars != null ? Number.parseFloat(option.net_transfer_price_ars) : null;
      if (netAdultArs != null && rate > 0) {
        const netTotalArs = Math.round((
          input.adults * netAdultArs
          + input.children * (netChildArs ?? netAdultArs)
          + (transferReq && netTransferArs != null ? netTransferArs * pax : 0)
        ) * 100) / 100;
        netTotalUsd = Math.round((netTotalArs / rate) * 100) / 100;
      }
    }

    const order = await createPendingOrder({
      customer: input.customer,
      item: {
        product_id: option.product_id,
        option_id: option.id,
        product_name_snapshot: option.product_name,
        option_name_snapshot: option.name_es,
        service_date: input.service_date,
        adults: input.adults,
        children: input.children,
        unit_price_adult_usd: priceAdult,
        unit_price_child_usd: option.price_child_usd != null ? priceChild : null,
        subtotal_usd: subtotalUsd,
        transfer_requested: input.transfer_requested ?? false,
        transfer_hotel: input.transfer_hotel ?? null,
        transfer_room: (input.transfer_requested && input.transfer_room) ? input.transfer_room : null,
        net_total_usd: netTotalUsd,
      },
      total_usd: subtotalUsd,
      total_ars: totalArs,
      exchange_rate_used: rate,
      ref_code: seller.code,
      payment_method: input.payment_method,
      default_capacity_per_day: option.default_capacity_per_day,
      utm: { source: 'admin_manual', medium: seller.code, campaign: null },
    });

    const eventPayload = {
      admin_email: req.admin!.email,
      admin_id: req.admin!.id,
      seller_code: seller.code,
      seller_name: seller.name,
    };

    if (input.payment_method === 'cash') {
      await logPaymentEvent(order.id, 'cash_order_created_by_admin', null, eventPayload);
      sendCashOrderNotifications(order.id).catch((err) =>
        console.error('[email] sendCashOrderNotifications failed for admin-created order', order.id, err),
      );
      createOrderCreatedByAdminNotification({
        sellerId: seller.id,
        orderId: order.id,
        orderPublicId: order.public_id,
        paymentMethod: 'cash',
        customerName: input.customer.name,
        optionName: option.name_es,
        serviceDate: input.service_date,
        totalArs,
      }).catch((err) => console.error('[notif] createOrderCreatedByAdminNotification failed', order.id, err));

      return res.status(201).json({
        data: {
          order_public_id: order.public_id, payment_method: 'cash', total_usd: subtotalUsd,
          seller: { id: seller.id, code: seller.code, name: seller.name },
        },
      });
    }

    // ── PIX (Nautt) ───────────────────────────────────────
    if (input.payment_method === 'pix') {
      try {
        const charge = await createPixCharge({
          amountUsd: subtotalUsd,
          orderRef: order.public_id,
          description: `${option.name_es} — ${option.product_name}`,
        });
        await setOrderPixCharge(order.id, charge);
        await logPaymentEvent(order.id, 'pix_charge_created_by_admin', charge.nauttOrderUuid, { ...eventPayload, fiat_brl: charge.fiatAmountBrl });
        const pixUrl = `${config.WEB_ORIGIN}/checkout/pix?order=${order.public_id}`;
        sendPaymentLinkEmail(order.id, pixUrl).catch((err) =>
          console.error('[email] sendPaymentLinkEmail (PIX) failed for admin-created order', order.id, err),
        );
        createOrderCreatedByAdminNotification({
          sellerId: seller.id, orderId: order.id, orderPublicId: order.public_id,
          paymentMethod: 'pix', customerName: input.customer.name,
          optionName: option.name_es, serviceDate: input.service_date, totalArs,
        }).catch((err) => console.error('[notif] createOrderCreatedByAdminNotification failed', order.id, err));

        return res.status(201).json({
          data: {
            order_public_id: order.public_id, payment_method: 'pix',
            total_usd: subtotalUsd, total_ars: totalArs,
            seller: { id: seller.id, code: seller.code, name: seller.name },
          },
        });
      } catch (err) {
        await logPaymentEvent(order.id, 'pix_charge_failed', null, { message: (err as Error).message }).catch(() => {});
        return res.status(502).json({ error: 'No se pudo generar el cobro con PIX. Probá con otro medio de pago.' });
      }
    }

    const pref = await createPreference({
      orderPublicId: order.public_id,
      title: `${option.name_es} — ${option.product_name}`,
      totalArs,
      quantityAdults: input.adults,
      quantityChildren: input.children,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone ?? undefined,
      },
      metadata: {
        order_id: order.id,
        seller_ref: seller.code,
        option_id: option.id,
        product_slug: option.product_slug,
        service_date: input.service_date,
      },
      webOrigin: config.WEB_ORIGIN,
    });

    await setOrderPreferenceId(order.id, pref.id, pref.init_point);
    await logPaymentEvent(order.id, 'preference_created_by_admin', pref.id, { ...eventPayload, init_point: pref.init_point });

    sendPaymentLinkEmail(order.id, pref.init_point).catch((err) =>
      console.error('[email] sendPaymentLinkEmail failed for admin-created order', order.id, err),
    );
    createOrderCreatedByAdminNotification({
      sellerId: seller.id,
      orderId: order.id,
      orderPublicId: order.public_id,
      paymentMethod: 'mercadopago',
      customerName: input.customer.name,
      optionName: option.name_es,
      serviceDate: input.service_date,
      totalArs,
    }).catch((err) => console.error('[notif] createOrderCreatedByAdminNotification failed', order.id, err));

    res.status(201).json({
      data: {
        order_public_id: order.public_id, payment_method: 'mercadopago',
        total_usd: subtotalUsd, total_ars: totalArs,
        seller: { id: seller.id, code: seller.code, name: seller.name },
      },
    });
  } catch (err) { next(err); }
});

adminOrdersRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() });

    const where: string[] = ['o.archived_at IS NULL'];
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
         o.customer_name, o.customer_email, o.customer_phone, o.customer_nationality,
         o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
         o.exchange_rate_used::float AS exchange_rate_used,
         o.ref_code, o.mp_payment_id, o.mp_payment_status, o.payment_method,
         o.created_at, o.paid_at, o.admin_viewed_at, o.cash_collected_currency,
         oi.product_name_snapshot AS product_name,
         oi.option_name_snapshot AS option_name,
         to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
         oi.adults, oi.children,
         a.seller_id, s.code AS seller_code, s.name AS seller_name,
         a.commission_amount_usd::float AS commission_amount_usd,
         a.commission_amount_ars::float AS commission_amount_ars,
         a.net_total_usd_snapshot::float AS net_total_usd,
         a.paid_to_seller_at, a.net_settled_at
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

// ─── Rutas de archivo ─────────────────────────────────────────────────────────

const archiveListQuery = z.object({
  page:   z.coerce.number().int().min(1).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(120).optional(),
  status: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired']).optional(),
});

// GET /api/admin/orders/archive — lista paginada del archivo
adminOrdersRouter.get('/archive', async (req, res, next) => {
  try {
    const parsed = archiveListQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() });
    const result = await listAdminArchive(parsed.data);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/admin/orders/archive/restore — restaura órdenes al panel activo
adminOrdersRouter.post('/archive/restore', async (req, res, next) => {
  try {
    const parsed = z.object({
      public_ids: z.array(z.string().regex(/^[0-9a-f-]{8,40}$/i)).min(1).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const restored = await restoreFromArchive(parsed.data.public_ids);
    res.json({ data: { restored } });
  } catch (err) { next(err); }
});

// GET /api/admin/orders/archive/download — CSV del archivo
adminOrdersRouter.get('/archive/download', async (req, res, next) => {
  try {
    const parsed = archiveListQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() });
    const result = await listAdminArchive({ ...parsed.data, page: 1, limit: 5000 });

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['public_id', 'status', 'customer_name', 'customer_email', 'total_usd', 'total_ars', 'payment_method', 'product_name', 'option_name', 'service_date', 'adults', 'children', 'seller_name', 'seller_code', 'created_at', 'archived_at'].join(',');
    const lines = result.orders.map((r) =>
      [r.public_id, r.status, r.customer_name, r.customer_email, r.total_usd, r.total_ars, r.payment_method, r.product_name, r.option_name, r.service_date, r.adults, r.children, r.seller_name, r.seller_code, r.created_at, r.archived_at]
        .map(escape).join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="archivo-ordenes.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { next(err); }
});

// ─── Detalle de una orden ─────────────────────────────────────────────────────

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

    // Primera vez que se abre esta orden: marcamos admin_viewed_at para que deje de
    // aparecer como "Nueva" en el listado. No bloqueamos la respuesta por esto.
    if (!order.admin_viewed_at) {
      order.admin_viewed_at = new Date().toISOString();
      pool.query(`UPDATE orders SET admin_viewed_at = NOW() WHERE id = $1 AND admin_viewed_at IS NULL`, [order.id])
        .catch((e) => console.error('[admin_viewed_at] update failed:', e));
    }

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
  reason: z.string().max(500).nullish(),
  notify_customer: z.boolean().optional().default(true),
  // Si se especifica amount_usd, hace refund parcial. Si se omite, refund total.
  amount_usd: z.number().positive().optional(),
});

adminOrdersRouter.post('/:publicId/refund', async (req, res, next) => {
  const publicId = req.params.publicId;
  if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = refundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  // Refund transaccional: el lock de fila (FOR UPDATE) se toma ANTES de llamar a MP y
  // se sostiene hasta después de persistir el resultado, para que ninguna otra
  // modificación concurrente quede pisando datos a mitad de un reintegro real (ver
  // auditoría pre-prod — antes el refund en MP se disparaba sin ningún lock).
  const client: PoolClient = await pool.connect();
  let refundResponse: Awaited<ReturnType<typeof refundPayment>> | undefined;
  let refundAlreadyIssued = false;
  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query<{
      id: number; status: string; mp_payment_id: string | null; payment_method: string;
      total_usd: number; total_ars: number; exchange_rate_used: number;
      service_date: string | Date; commission_percent: number | null;
    }>(
      `SELECT o.id, o.status::text AS status, o.mp_payment_id, o.payment_method,
              o.total_usd::float AS total_usd, o.total_ars::float AS total_ars,
              o.exchange_rate_used::float AS exchange_rate_used,
              oi.service_date,
              a.commission_percent_snapshot::float AS commission_percent
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN order_attributions a ON a.order_id = o.id
        WHERE o.public_id = $1
        ORDER BY oi.id LIMIT 1
        FOR UPDATE OF o, oi`,
      [publicId],
    );
    const order = orderRows[0];
    if (!order) throw new RouteValidationError(404, 'Not found');

    // PIX no tiene refund automático (Nautt no lo expone): el reintegro se hace a mano por
    // off-ramp desde el panel de Nautt. Cortamos acá para no llamar a MP con el uuid de
    // Nautt (que vive en mp_payment_id) y devolver un error confuso de Mercado Pago.
    if (order.payment_method === 'pix') {
      throw new RouteValidationError(400,
        'Los reintegros de PIX no se procesan automáticamente. Hacé la devolución manualmente desde el panel de Nautt (transferencia PIX a la clave del cliente) y, si corresponde, marcá la orden como "cancelled" desde el detalle.',
      );
    }

    const cancelCheck = checkOperationWindow(await getCancelWindow(), order.service_date);
    if (cancelCheck.blocked) throw new RouteValidationError(409, cancelCheck.message ?? 'Fuera de la ventana permitida.');

    if (order.status === 'refunded') {
      throw new RouteValidationError(409, 'Esta orden ya fue reintegrada');
    }
    if (order.status !== 'paid') {
      throw new RouteValidationError(400, `Solo se pueden reintegrar órdenes pagadas. Estado actual: ${order.status}`);
    }
    if (!order.mp_payment_id) {
      throw new RouteValidationError(400,
        'La orden no tiene un payment_id de Mercado Pago (el webhook no llegó a confirmarla todavía). Si el cobro fue por fuera de MP, marcala como "cancelled" desde el detalle.',
      );
    }

    // Refund parcial: validar y convertir USD → ARS con el rate de la orden
    let amountArs: number | undefined;
    let amountUsdToRefund: number | undefined;
    const isPartial = parsed.data.amount_usd != null && parsed.data.amount_usd < order.total_usd;
    if (parsed.data.amount_usd != null) {
      if (parsed.data.amount_usd > order.total_usd) {
        throw new RouteValidationError(400, `El monto a reintegrar (USD ${parsed.data.amount_usd}) supera el total de la orden (USD ${order.total_usd}).`);
      }
      amountUsdToRefund = parsed.data.amount_usd;
      amountArs = Math.round(parsed.data.amount_usd * order.exchange_rate_used * 100) / 100;
    }

    // 2) Disparar el refund en MP con idempotency key determinística (todavía con el
    //    lock sostenido). Así, si se reintenta (doble clic, timeout, reproceso), MP NO
    //    reintegra dos veces.
    const idempotencyKey = `refund:${order.id}:${isPartial ? amountArs : 'full'}`;
    try {
      refundResponse = await refundPayment(order.mp_payment_id, amountArs, idempotencyKey);
      refundAlreadyIssued = true;
    } catch (err) {
      await client.query('ROLLBACK');
      const message = (err as Error).message ?? 'Refund failed';
      await logPaymentEvent(order.id, 'refund_failed', order.mp_payment_id, {
        error: message, reason: parsed.data.reason, amount_usd: amountUsdToRefund,
      });
      return res.status(502).json({ error: `Mercado Pago rechazó el refund: ${message}` });
    }

    // 3) Actualizar la orden:
    //    - Refund total → status = 'refunded'
    //    - Refund parcial → orden sigue 'paid', pero el total y la comisión del
    //      vendedor bajan proporcionalmente (antes quedaban intactos, ver auditoría).
    const newStatus = isPartial ? 'paid' : 'refunded';
    const noteLine = `[${new Date().toISOString()}] ${isPartial ? `Refund parcial USD ${amountUsdToRefund}` : 'Refund total procesado'}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`;

    const newTotalUsd = isPartial ? round2(order.total_usd - (amountUsdToRefund ?? 0)) : null;
    const newTotalArs = isPartial ? round2(order.total_ars - (amountArs ?? 0)) : null;
    const newCommissionUsd = (isPartial && order.commission_percent != null)
      ? round2((newTotalUsd ?? 0) * order.commission_percent / 100) : null;
    const newCommissionArs = newCommissionUsd != null ? round2(newCommissionUsd * order.exchange_rate_used) : null;

    await client.query(
      `UPDATE orders
          SET status = $1::order_status,
              internal_notes = COALESCE(internal_notes || E'\\n', '') || $2,
              refunded_at = CASE WHEN $1::order_status = 'refunded' THEN NOW() ELSE refunded_at END,
              total_usd = COALESCE($4, total_usd),
              total_ars = COALESCE($5, total_ars),
              refunded_amount_usd = refunded_amount_usd + COALESCE($6, 0),
              refunded_amount_ars = refunded_amount_ars + COALESCE($7, 0),
              updated_at = NOW()
        WHERE id = $3`,
      [newStatus, noteLine, order.id, newTotalUsd, newTotalArs, isPartial ? (amountUsdToRefund ?? 0) : 0, isPartial ? (amountArs ?? 0) : 0],
    );

    if (newCommissionUsd != null) {
      await client.query(
        `UPDATE order_attributions SET commission_amount_usd = $1, commission_amount_ars = $2 WHERE order_id = $3`,
        [newCommissionUsd, newCommissionArs, order.id],
      );
    }

    await client.query(
      `INSERT INTO payment_events (order_id, event_type, mp_resource_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [order.id, isPartial ? 'refund_partial_processed' : 'refund_processed', order.mp_payment_id, JSON.stringify({
        reason: parsed.data.reason ?? null,
        refund_id: refundResponse?.id ?? null,
        amount_ars: refundResponse?.amount ?? amountArs ?? null,
        amount_usd: amountUsdToRefund ?? order.total_usd,
      })],
    );

    // Refund total = la reserva completa deja de existir: cancelamos cualquier
    // ampliación todavía sin cobrar para que su link de pago no quede huérfano
    // cobrándose días después sobre una orden ya reintegrada.
    if (!isPartial) {
      await cancelPendingAddonsForOrder(order.id, client);
    }

    await client.query('COMMIT');

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
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { /* la conexión puede haber quedado inservible */ });
    if (err instanceof RouteValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (refundAlreadyIssued) {
      // El reintegro YA se ejecutó en Mercado Pago — no hay forma de deshacerlo. Si
      // el guardado local falló igual (con el lock ya tomado, debería ser rarísimo),
      // esto tiene que quedar imposible de pasar por alto en vez de perderse en silencio.
      console.error(
        `[CRITICAL] Refund procesado en MP para la orden ${publicId} (refund_id=${refundResponse?.id ?? '?'}, ` +
        `monto=${refundResponse?.amount ?? '?'}) pero el guardado local falló. Requiere reconciliación manual.`, err,
      );
      return res.status(500).json({
        error: 'El reintegro se procesó en Mercado Pago pero no se pudo guardar en el sistema. Contactá a soporte técnico con el número de esta orden para reconciliar manualmente.',
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

// ─── Modificar reserva reduciendo pax/traslado + reintegro parcial (MP) ───────
// El cliente se baja pasajeros o quita el traslado: se reintegra el delta por MP,
// se ajusta la reserva (pax/totales), se libera el cupo y se recalcula la comisión.
// Para AGREGAR algo o cambiar de servicio: cancelar + crear una reserva nueva.
const modifySchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  transfer_requested: z.boolean(),
  reason: z.string().max(500).nullish(),
  notify_customer: z.boolean().optional().default(true),
  // Presentes solo cuando la misma acción también reprogramó la fecha (ver
  // ModifyReservationModal): permiten mandar un único email combinado.
  reschedule_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reschedule_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

adminOrdersRouter.post('/:publicId/modify', async (req, res, next) => {
  const publicId = req.params.publicId;
  if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = modifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  // Igual que /refund: lock de fila sostenido desde antes de leer los datos hasta
  // después de persistir el resultado, así el refund en MP y la reducción quedan
  // atómicos entre sí — antes el chequeo de concurrencia de applyOrderReduction podía
  // fallar DESPUÉS de que el dinero ya se hubiera reintegrado (ver auditoría pre-prod).
  const client: PoolClient = await pool.connect();
  let refundAlreadyIssued = false;
  let refundArsIssued: number | undefined;
  try {
    await client.query('BEGIN');

    // 1) Cargar orden + item + atribución CON LOCK (todo lo congelado que necesita el cálculo)
    const { rows } = await client.query<{
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
        LIMIT 1
        FOR UPDATE OF o, oi`,
      [publicId],
    );
    const row = rows[0];
    if (!row) throw new RouteValidationError(404, 'Not found');

    const modifyCheck = checkOperationWindow(await getModifyWindow(), row.service_date);
    if (modifyCheck.blocked) throw new RouteValidationError(409, modifyCheck.message ?? 'Fuera de la ventana permitida.');

    // 2) Validaciones de estado
    if (row.status !== 'paid') {
      throw new RouteValidationError(400, `Solo se pueden modificar reservas pagadas. Estado actual: ${row.status}`);
    }
    if (row.payment_method !== 'mercadopago') {
      throw new RouteValidationError(400, row.payment_method === 'pix'
        ? 'Las reservas de PIX no se pueden modificar automáticamente (PIX no tiene reintegro ni link incremental). Gestioná el cambio manualmente y, si hay que devolver, hacé la transferencia PIX desde el panel de Nautt.'
        : 'Esta reserva es en efectivo. La devolución en efectivo se gestiona desde su vía correspondiente.');
    }
    if (!row.mp_payment_id) {
      throw new RouteValidationError(400, 'La orden no tiene un pago de Mercado Pago confirmado. Sincronizala con MP primero.');
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
    if (!calc.ok) throw new RouteValidationError(400, calc.error ?? 'No se pudo calcular la reducción.');

    // 4) Refund en MP (todavía con el lock sostenido). Idempotency key atada a la
    //    composición DESTINO: reintentar el mismo cambio devuelve el mismo refund;
    //    reducciones sucesivas (que apuntan a composiciones distintas) nunca colisionan.
    const idempotencyKey = `refund:${row.order_id}:to:${parsed.data.adults}a${parsed.data.children}n${parsed.data.transfer_requested ? 'T' : 'F'}`;
    try {
      await refundPayment(row.mp_payment_id, calc.refundArs, idempotencyKey);
      refundAlreadyIssued = true;
      refundArsIssued = calc.refundArs;
    } catch (err) {
      await client.query('ROLLBACK');
      const message = (err as Error).message ?? 'Refund failed';
      await logPaymentEvent(row.order_id, 'modify_refund_failed', row.mp_payment_id, {
        error: message, target: parsed.data, refund_ars: calc.refundArs,
      });
      return res.status(502).json({ error: `Mercado Pago rechazó el reintegro: ${message}` });
    }

    // 5) Persistir la reducción en la MISMA transacción (mismo client, mismo lock) —
    //    applyOrderReduction ya no abre/cierra su propia transacción cuando se le pasa un client.
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
    }, client);

    await client.query('COMMIT');

    // 6) Notificar (fire-and-forget)
    if (parsed.data.notify_customer !== false) {
      const dateChange = parsed.data.reschedule_from && parsed.data.reschedule_to
        ? { prevDate: parsed.data.reschedule_from, newDate: parsed.data.reschedule_to }
        : null;
      sendOrderModifiedNotifications(row.order_id, calc.refundUsd, calc.refundArs, parsed.data.reason, false, dateChange).catch((e) =>
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
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { /* la conexión puede haber quedado inservible */ });
    if (err instanceof RouteValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    // Con el lock sostenido desde antes de leer los datos, este chequeo de
    // concurrencia debería ser inalcanzable en la práctica — queda como red de
    // seguridad. Si de todos modos ocurre DESPUÉS de un refund exitoso, el dinero
    // ya se movió y no se puede deshacer: hay que dejarlo bien visible.
    if (err instanceof ConcurrentModificationError && !refundAlreadyIssued) {
      return res.status(409).json({ error: err.message });
    }
    if (refundAlreadyIssued) {
      console.error(
        `[CRITICAL] Refund de ARS ${refundArsIssued} procesado en MP para la orden ${publicId} pero la modificación no se pudo guardar. Requiere reconciliación manual.`, err,
      );
      return res.status(500).json({
        error: 'El reintegro se procesó en Mercado Pago pero no se pudo guardar la modificación. Contactá a soporte técnico con el número de esta orden para reconciliar manualmente.',
      });
    }
    next(err);
  } finally {
    client.release();
  }
});

// ─── Confirmar cobro en efectivo (admin en nombre del vendedor) ────────────────
// El admin marca como cobrada una orden pendiente en efectivo atribuida a un vendedor,
// cuando el vendedor no puede operar el portal por su cuenta.
adminOrdersRouter.post('/:publicId/collect-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const parsedCurrency = collectCashCurrencySchema.safeParse(req.body ?? {});
    if (!parsedCurrency.success) return res.status(400).json({ error: 'Moneda inválida' });
    const { currency } = parsedCurrency.data;

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

    // WHERE status = 'pending' hace la transición atómica: evita que un doble clic (o
    // el vendedor confirmando el mismo cobro en paralelo) dispare el email dos veces.
    const { rowCount } = await pool.query(
      `UPDATE orders SET status = 'paid', paid_at = NOW(), cash_collected_at = NOW(), cash_collected_currency = $2 WHERE id = $1 AND status = 'pending'`,
      [order.id, currency],
    );
    if (!rowCount) {
      return res.status(409).json({ error: 'La orden ya fue procesada anteriormente.' });
    }
    await pool.query(
      `INSERT INTO payment_events (order_id, event_type, payload)
       VALUES ($1, 'cash_collected_by_admin', $2::jsonb)`,
      [order.id, JSON.stringify({ actor: 'admin', currency })],
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
      service_date: string | Date; service_date_fmt: string;
      seller_id: number | null; net_total_usd: number | null; net_settled_at: string | null;
      customer_name: string; option_name: string;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              o.total_ars::float AS total_ars, o.exchange_rate_used::float AS exchange_rate_used,
              o.customer_name,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested, oi.transfer_hotel,
              oi.service_date, to_char(oi.service_date, 'YYYY-MM-DD') AS service_date_fmt,
              oi.option_name_snapshot AS option_name,
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
    if (row.status !== 'paid' && row.status !== 'pending') {
      return res.status(400).json({ error: `No se puede reducir una reserva en estado ${row.status}` });
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

    // Aviso in-app + push en vivo al vendedor: la modificación la hizo el admin, así que
    // no se entera solo mirando la orden — necesita la misma señal que liquidar/rendir.
    if (hasAttribution) {
      createOrderReducedByAdminNotification({
        sellerId: row.seller_id!,
        orderId: row.order_id,
        orderPublicId: publicId,
        customerName: row.customer_name,
        optionName: row.option_name,
        serviceDate: row.service_date_fmt,
        newAdults: parsed.data.adults,
        newChildren: parsed.data.children,
        refundArs: calc.refundArs,
      }).catch((e) => console.error('[notif] createOrderReducedByAdminNotification failed:', e));
    }

    if (parsed.data.notify_customer !== false) {
      const dateChange = parsed.data.reschedule_from && parsed.data.reschedule_to
        ? { prevDate: parsed.data.reschedule_from, newDate: parsed.data.reschedule_to }
        : null;
      sendOrderModifiedNotifications(row.order_id, calc.refundUsd, calc.refundArs, parsed.data.reason, true, dateChange).catch((e) =>
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
  } catch (err) {
    if (err instanceof ConcurrentModificationError) return res.status(409).json({ error: err.message });
    next(err);
  }
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

    // Aviso in-app + push en vivo: el vendedor tiene una ampliación nueva para cobrar
    // que no creó él mismo — necesita enterarse aunque no esté mirando el email.
    if (result.sellerId != null) {
      createCashAddonCreatedByAdminNotification({
        sellerId: result.sellerId,
        orderId: result.orderId,
        orderPublicId: publicId,
        customerName: result.customerName,
        optionName: result.optionName,
        serviceDate: result.serviceDate,
        extraAdults: result.extraAdults,
        extraChildren: result.extraChildren,
        chargeArs: result.data.charge_ars,
      }).catch((e) => console.error('[notif] createCashAddonCreatedByAdminNotification failed:', e));
    }

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
    if (r.closedOrder) {
      return res.status(409).json({ error: 'La reserva ya se había cerrado (reintegrada/cancelada) antes de este cobro — no se sumó el pasajero extra. Queda registrado para revisión manual.' });
    }
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
      if (result.blockedByTerminalState) {
        return res.status(409).json({
          error: `Mercado Pago tiene un pago para esta orden, pero quedó en estado "${result.status}" y no se puede confirmar sola (por seguridad de cupo). Revisá el historial de eventos de la orden y resolvé manualmente (confirmar si hay cupo real, o reintegrar el pago).`,
        });
      }
      return res.status(404).json({ error: 'No se encontró ningún pago en Mercado Pago para esta orden. Si el cobro no se completó, la orden no debería figurar como pagada.' });
    }
    res.json({ data: { ok: true, status: result.status } });
  } catch (err) { next(err); }
});

// POST /api/admin/orders/:publicId/reschedule — reprograma la fecha de servicio.
const rescheduleSchema = z.object({
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).nullish(),
  notify_customer: z.boolean().optional(),
});

adminOrdersRouter.post('/:publicId/reschedule', async (req, res, next) => {
  const publicId = req.params.publicId;
  if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const { new_date, reason, notify_customer } = parsed.data;
  const newDateObj = new Date(`${new_date}T00:00:00`);
  if (Number.isNaN(newDateObj.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
  if (newDateObj.getTime() < Date.now() - 86_400_000) return res.status(400).json({ error: 'La fecha no puede ser pasada' });

  // Se resuelve ANTES de abrir la transacción: es una config global que no depende de la
  // orden, y no tiene sentido retener el lock de la fila mientras se espera esta consulta.
  const modifyWindowHours = await getModifyWindow();

  // Transaccional con el mismo advisory lock que usa la creación de órdenes/addons: sin
  // esto, dos reprogramaciones (o una reprogramación y una reserva nueva) al mismo
  // tier+fecha podían pasar ambas el chequeo de cupo antes de que ninguna escribiera,
  // y sobrevender la fecha destino (ver auditoría). No se toma FOR UPDATE de la orden acá
  // a propósito: applyOrderIncrease/createOrderAddon toman el advisory lock ANTES que
  // cualquier lock de fila sobre la orden, así que tomar el lock de fila primero (como se
  // hacía antes) invertía ese orden entre rutas y era una receta de deadlock. En su lugar,
  // el UPDATE final es optimista (guarda `AND service_date = $3`) — si la orden cambió
  // entre la lectura y la escritura, no pisa nada, tira ConcurrentModificationError (409).
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
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
    if (!row) throw new RouteValidationError(404, 'Not found');
    if (!['pending', 'paid'].includes(row.status)) {
      throw new RouteValidationError(400, `No se puede reprogramar una reserva en estado "${row.status}".`);
    }
    if (row.service_date === new_date) {
      throw new RouteValidationError(400, 'La nueva fecha es igual a la fecha actual.');
    }

    // Misma ventana que ya rige refund (getCancelWindow) y reducir pax (getModifyWindow)
    // en este archivo — reprogramar no tenía este chequeo y quedaba como única excepción.
    const windowCheck = checkOperationWindow(modifyWindowHours, row.service_date);
    if (windowCheck.blocked) throw new RouteValidationError(409, windowCheck.message ?? 'Fuera de la ventana permitida.');

    const { rows: optionRows } = await client.query<{ default_capacity_per_day: number; available_days: number[] }>(
      `SELECT default_capacity_per_day, available_days FROM product_options WHERE id = $1 LIMIT 1`,
      [row.option_id],
    );
    const option = optionRows[0];
    if (!option) throw new RouteValidationError(404, 'Opción no encontrada');

    const isoDow = newDateObj.getDay() === 0 ? 7 : newDateObj.getDay();
    if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
      throw new RouteValidationError(400, 'El servicio no opera ese día de la semana.');
    }

    // Ampliaciones pendientes (sin cobrar todavía): hoy reservan cupo en la fecha VIEJA.
    // Si no las movemos junto con la orden, ese pax queda reservado en la fecha vieja (cupo
    // fantasma) y cuando se cobre el link se fusiona a la fecha nueva sin haber pasado por
    // ningún chequeo de cupo ahí — hay que contarlas en el chequeo de la fecha nueva y
    // moverlas junto con la orden.
    const { rows: pendingAddons } = await client.query<{ extra_adults: number; extra_children: number }>(
      `SELECT extra_adults, extra_children FROM order_addons WHERE order_id = $1 AND status = 'pending'`,
      [row.order_id],
    );
    const addonPax = pendingAddons.reduce((sum, a) => sum + a.extra_adults + a.extra_children, 0);

    // Chequeo autoritativo con lock — reemplaza el pre-chequeo no transaccional de antes.
    await checkAvailabilityTxLocked(client, row.option_id, option.default_capacity_per_day, new_date, row.adults + row.children + addonPax);

    const { rowCount } = await client.query(
      `UPDATE order_items SET service_date = $1 WHERE id = $2 AND service_date = $3`,
      [new_date, row.item_id, row.service_date],
    );
    if (!rowCount) throw new ConcurrentModificationError();

    if (pendingAddons.length > 0) {
      await client.query(
        `UPDATE order_addons SET service_date = $1 WHERE order_id = $2 AND status = 'pending'`,
        [new_date, row.order_id],
      );
    }

    await client.query('COMMIT');

    await logPaymentEvent(row.order_id, 'order_rescheduled', null, {
      prev_date: row.service_date, new_date, actor: 'admin', reason: reason ?? null,
    });

    if (notify_customer !== false) {
      sendOrderRescheduledNotifications(row.order_id, row.service_date, new_date, reason ?? null, 'admin').catch((e) =>
        console.error('[email] reschedule notification failed for order', row.order_id, e),
      );
    }

    res.json({ data: { ok: true, prev_date: row.service_date, new_date } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { /* la conexión puede haber quedado inservible */ });
    if (err instanceof RouteValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof ConcurrentModificationError) {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  } finally {
    client.release();
  }
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
      // La reserva completa se canceló: cualquier ampliación sin cobrar queda sin efecto,
      // para que su link de pago no se cobre después sobre una orden ya cancelada.
      cancelPendingAddonsForOrder(rows[0].id).catch((err) =>
        console.error('[addons] cancelPendingAddonsForOrder failed for order', rows[0].id, err),
      );
    }

    res.json({ data: { ok: true, status: rows[0].status } });
  } catch (err) { next(err); }
});

// POST /api/admin/orders/bulk-archive — mueve hasta 100 órdenes al archivo.
adminOrdersRouter.post('/bulk-archive', async (req, res, next) => {
  try {
    const parsed = z.object({
      public_ids: z.array(z.string().regex(/^[0-9a-f-]{8,40}$/i)).min(1).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const adminId = (req as unknown as { admin: { id: string } }).admin.id;
    const archived = await archiveOrders(parsed.data.public_ids, adminId);
    res.json({ data: { archived } });
  } catch (err) { next(err); }
});

// POST /api/admin/orders/:publicId/archive — archiva una orden.
adminOrdersRouter.post('/:publicId/archive', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const adminId = (req as unknown as { admin: { id: string } }).admin.id;
    const archived = await archiveOrders([publicId], adminId);
    if (archived === 0) return res.status(404).json({ error: 'Not found or already archived' });

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
