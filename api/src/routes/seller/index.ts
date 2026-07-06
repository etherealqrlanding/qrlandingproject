import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { requireSeller } from '../../middleware/requireSeller.js';
import { pool } from '../../db.js';
import { listSellerOrders } from '../../repos/sellers.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { config } from '../../config.js';
import { sendSellerPasswordReset, sendCashOrderNotifications, sendCashCollectedNotifications, sendOrderIncreasedNotifications, sendOrderModifiedNotifications } from '../../services/email.js';
import { computeOrderIncrease, type OrderIncreaseSnapshot } from '../../services/orderIncrease.js';
import { computeOrderReduction, type OrderReductionSnapshot } from '../../services/orderReduction.js';
import { cashIncreaseCommission, recomputeCashCommission } from '../../services/orderCommission.js';
import { createAddonForOrder } from '../../services/orderAddon.js';
import { addConnection, removeConnection } from '../../services/sseNotifier.js';
import { createPreference } from '../../services/mercadopago.js';
import { getExchangeRate, convertUsdToArs } from '../../services/settings.js';
import { createPendingOrder, setOrderPreferenceId, logPaymentEvent, applyOrderIncrease, applyOrderReduction } from '../../repos/orders.js';
import { listNotifications, markAllRead, getUnreadCount } from '../../repos/notifications.js';
import { checkSingleDateAvailability } from '../../repos/availability.js';
import { authLimiter } from '../../middleware/rateLimit.js';

export const sellerRouter = Router();

// ─── Rutas públicas (sin auth) ────────────────────────────
// POST /api/seller/auth/forgot-password
// Genera un link de recovery y lo envía por email. Siempre responde 200
// para no revelar si el email existe o no.
const forgotPasswordSchema = z.object({ email: z.string().email() });

sellerRouter.post('/auth/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email inválido' });

    const email = parsed.data.email.trim().toLowerCase();

    // Buscar el vendedor por email (fire-and-forget si no existe — mismo mensaje)
    const { rows } = await pool.query(
      `SELECT id, name, supabase_user_id FROM sellers WHERE LOWER(contact_email) = $1 AND is_active = true LIMIT 1`,
      [email],
    );
    const seller = rows[0] as { id: number; name: string; supabase_user_id: string | null } | undefined;

    if (seller?.supabase_user_id) {
      const portalUrl = `${config.WEB_ORIGIN.replace(/\/$/, '')}/seller/login`;
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: portalUrl },
      });
      if (!linkError && linkData) {
        sendSellerPasswordReset(seller.name, email, linkData.properties.action_link)
          .catch((e) => console.warn('[forgot-password] email send failed:', e));
      }
    }

    // Respuesta genérica siempre
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ─── Rutas protegidas ─────────────────────────────────────
sellerRouter.use(requireSeller);

// GET /api/seller/me — perfil del vendedor + stats agregados
sellerRouter.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         s.id, s.code, s.name, s.contact_email, s.contact_phone, s.kind,
         s.is_permanent,
         s.commission_percent::text AS commission_percent,
         COALESCE(stats.orders_paid, 0)::int       AS orders_paid,
         COALESCE(stats.revenue_paid_usd, 0)::float AS revenue_paid_usd,
         COALESCE(stats.commission_earned_usd, 0)::float AS commission_earned_usd,
         COALESCE(stats.commission_paid_usd, 0)::float   AS commission_paid_usd,
         COALESCE(stats.commission_pending_usd, 0)::float AS commission_pending_usd,
         COALESCE(stats.net_pending_settlement_usd, 0)::float AS net_pending_settlement_usd,
         COALESCE(notifs.unread_count, 0)::int AS unread_notifications
       FROM sellers s
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE o.status = 'paid') AS orders_paid,
           SUM(o.total_usd) FILTER (WHERE o.status = 'paid') AS revenue_paid_usd,
           SUM(a.commission_amount_usd) FILTER (WHERE o.status = 'paid') AS commission_earned_usd,
           -- MP: comisión que ya te liquidamos
           SUM(a.commission_amount_usd) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NOT NULL
           ) AS commission_paid_usd,
           -- MP: comisión que te debemos liquidar (pendiente)
           SUM(a.commission_amount_usd) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NULL
           ) AS commission_pending_usd,
           -- Efectivo: neto que tenés que rendirnos (pendiente)
           SUM(a.net_total_usd_snapshot) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'cash' AND a.net_settled_at IS NULL
           ) AS net_pending_settlement_usd
         FROM order_attributions a
         JOIN orders o ON o.id = a.order_id
        WHERE a.seller_id = s.id
       ) stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS unread_count
           FROM seller_notifications
          WHERE seller_id = s.id AND read_at IS NULL
       ) notifs ON TRUE
      WHERE s.id = $1`,
      [req.seller!.sellerId],
    );
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/seller/me/orders — ventas atribuidas al vendedor
sellerRouter.get('/me/orders', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await listSellerOrders(req.seller!.sellerId, { status });
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/seller/me/commissions — historial de liquidaciones (agrupado por fecha de pago)
sellerRouter.get('/me/commissions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         to_char(DATE(a.paid_to_seller_at), 'YYYY-MM-DD') AS paid_date,
         COUNT(*)::int                       AS orders_count,
         SUM(a.commission_amount_usd)::float AS total_usd,
         SUM(a.commission_amount_ars)::float AS total_ars
       FROM order_attributions a
       JOIN orders o ON o.id = a.order_id
      WHERE a.seller_id = $1
        AND o.status = 'paid'
        AND a.paid_to_seller_at IS NOT NULL
      GROUP BY DATE(a.paid_to_seller_at)
      ORDER BY paid_date DESC`,
      [req.seller!.sellerId],
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ─── POST /api/seller/me/checkout ────────────────────────
// El vendedor registra una reserva en nombre de un pasajero.
// Usa su propio código como ref_code y marca utm_source='seller_portal'.
// El pago en efectivo no requiere is_permanent (el vendedor está presente).
const sellerCheckoutSchema = z.object({
  option_id: z.number().int().positive(),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'service_date must be YYYY-MM-DD'),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(160),
    phone: z.string().max(40).optional().nullable(),
    nationality: z.string().max(80).optional().nullable(),
  }),
  payment_method: z.enum(['mercadopago', 'cash']),
  transfer_requested: z.boolean().optional(),
  transfer_hotel: z.string().max(200).optional().nullable(),
});

sellerRouter.post('/me/checkout', async (req, res, next) => {
  try {
    const parsed = sellerCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const input = parsed.data;

    // Obtener datos del vendedor autenticado
    const { rows: sellerRows } = await pool.query<{ id: number; code: string; name: string; is_permanent: boolean }>(
      `SELECT id, code, name, is_permanent FROM sellers WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [req.seller!.sellerId],
    );
    const seller = sellerRows[0];
    if (!seller) return res.status(403).json({ error: 'Vendedor no encontrado o inactivo' });

    // Pago en efectivo solo permitido para vendedores permanentes (is_permanent = true)
    if (input.payment_method === 'cash' && !seller.is_permanent) {
      return res.status(403).json({
        error: 'Tu perfil no tiene habilitado el cobro en efectivo. Usá Mercado Pago para procesar el pago.',
      });
    }

    // Cargar opción + producto (incluye netos para calcular la comisión en efectivo)
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

    // Validar día de operación
    const date = new Date(`${input.service_date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
    if (date.getTime() < Date.now() - 86_400_000) return res.status(400).json({ error: 'La fecha no puede ser pasada' });
    const isoDow = date.getDay() === 0 ? 7 : date.getDay();
    if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
      return res.status(400).json({ error: 'La opción no opera ese día', available_days: option.available_days });
    }

    // Validar disponibilidad puntual: fechas cerradas y capacidad real
    const availCheck = await checkSingleDateAvailability(
      option.id, option.default_capacity_per_day, input.service_date, input.adults + input.children,
    );
    if (!availCheck.ok) {
      return res.status(409).json({ error: availCheck.message ?? 'Fecha no disponible' });
    }

    // Calcular totales
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

    // Neto: monto mínimo que el operador debe recibir (para la comisión en efectivo).
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

    // Crear orden — ref_code = código del vendedor, utm marca origen
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
        net_total_usd: netTotalUsd,
      },
      total_usd: subtotalUsd,
      total_ars: totalArs,
      exchange_rate_used: rate,
      ref_code: seller.code,
      payment_method: input.payment_method,
      default_capacity_per_day: option.default_capacity_per_day,
      utm: { source: 'seller_portal', medium: seller.code, campaign: null },
    });

    // ── Pago en efectivo ──────────────────────────────────
    if (input.payment_method === 'cash') {
      await logPaymentEvent(order.id, 'cash_order_created_by_seller', null, { seller_code: seller.code });
      sendCashOrderNotifications(order.id).catch((err) =>
        console.error('[email] sendCashOrderNotifications failed for seller order', order.id, err),
      );
      return res.status(201).json({
        data: { order_public_id: order.public_id, payment_method: 'cash', total_usd: subtotalUsd },
      });
    }

    // ── Mercado Pago ──────────────────────────────────────
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

    await setOrderPreferenceId(order.id, pref.id);
    await logPaymentEvent(order.id, 'preference_created_by_seller', pref.id, { init_point: pref.init_point });

    res.json({
      data: {
        order_public_id: order.public_id,
        payment_method: 'mercadopago',
        preference_id: pref.id,
        init_point: pref.init_point,
        sandbox_init_point: pref.sandbox_init_point,
        total_usd: subtotalUsd,
        total_ars: totalArs,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/seller/me/qr — QR PNG del link de referido del vendedor autenticado
sellerRouter.get('/me/qr', async (req, res, next) => {
  try {
    const { rows } = await pool.query<{ code: string }>(
      `SELECT code FROM sellers WHERE id = $1 LIMIT 1`,
      [req.seller!.sellerId],
    );
    const seller = rows[0];
    if (!seller) return res.status(404).json({ error: 'Not found' });

    const target = `${config.WEB_ORIGIN.replace(/\/$/, '')}/?ref=${encodeURIComponent(seller.code)}`;
    const size = Math.min(1024, Math.max(128, Number(req.query.size ?? 512)));
    const buf = await QRCode.toBuffer(target, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size,
      color: { dark: '#0d0a0a', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${seller.code}.png"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// GET /api/seller/me/commissions/:date/orders — órdenes incluidas en una liquidación
sellerRouter.get('/me/commissions/:date/orders', async (req, res, next) => {
  try {
    const dateParam = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return res.status(400).json({ error: 'Fecha inválida. Formato esperado: YYYY-MM-DD' });
    }
    const { rows } = await pool.query(
      `SELECT
         o.public_id,
         oi.product_name_snapshot  AS product_name,
         oi.option_name_snapshot   AS option_name,
         to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
         oi.adults, oi.children,
         o.customer_name, o.customer_email, o.customer_phone, o.customer_nationality,
         o.total_usd::float        AS total_usd,
         o.payment_method,
         a.commission_amount_usd::float AS commission_amount_usd,
         o.created_at
       FROM order_attributions a
       JOIN orders o       ON o.id = a.order_id
       JOIN order_items oi ON oi.order_id = o.id
      WHERE a.seller_id = $1
        AND DATE(a.paid_to_seller_at) = $2::date
        AND o.status = 'paid'
      ORDER BY o.created_at DESC`,
      [req.seller!.sellerId, dateParam],
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/collect — vendedor confirma que recibió el dinero en efectivo
sellerRouter.post('/me/orders/:publicId/collect', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!publicId) return res.status(400).json({ error: 'publicId requerido' });

    // Verificar que la orden pertenece a este vendedor, es cash y está pendiente
    const { rows } = await pool.query<{
      id: number;
      status: string;
      payment_method: string;
    }>(
      `SELECT o.id, o.status, o.payment_method
         FROM orders o
         JOIN order_attributions a ON a.order_id = o.id
        WHERE o.public_id = $1
          AND a.seller_id = $2
        LIMIT 1`,
      [publicId, req.seller!.sellerId],
    );
    const order = rows[0];

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.payment_method !== 'cash') {
      return res.status(400).json({ error: 'Esta orden no es de tipo efectivo' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ error: 'La orden ya fue procesada anteriormente' });
    }

    // Marcar como pagada
    await pool.query(
      `UPDATE orders
          SET status = 'paid',
              paid_at = NOW(),
              cash_collected_at = NOW()
        WHERE id = $1`,
      [order.id],
    );

    await logPaymentEvent(order.id, 'cash_collected_by_seller', null, { seller_id: req.seller!.sellerId });

    // Enviar emails a todas las partes (cliente + admin + vendedor)
    sendCashCollectedNotifications(order.id).catch((e) =>
      console.error('[collect] email send failed:', e),
    );

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/increase-cash — el vendedor suma pasajeros a
// una reserva EN EFECTIVO suya ya cobrada y cobra la diferencia en el momento.
const sellerIncreaseSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  notify_customer: z.boolean().optional().default(true),
});

sellerRouter.post('/me/orders/:publicId/increase-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });

    const parsed = sellerIncreaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

    // La orden debe pertenecer a este vendedor (vía atribución), ser cash y estar cobrada.
    const { rows } = await pool.query<{
      order_id: number; status: string; payment_method: string;
      exchange_rate_used: number;
      item_id: number; option_id: number; service_date: string;
      default_capacity_per_day: number;
      adults: number; children: number;
      unit_price_adult_usd: number; unit_price_child_usd: number | null;
      subtotal_usd: number; transfer_requested: boolean;
      net_total_usd: number | null;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              o.exchange_rate_used::float AS exchange_rate_used,
              oi.id AS item_id, oi.option_id,
              to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
              po.default_capacity_per_day,
              oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested,
              a.net_total_usd_snapshot::float AS net_total_usd
         FROM orders o
         JOIN order_attributions a ON a.order_id = o.id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN product_options po ON po.id = oi.option_id
        WHERE o.public_id = $1 AND a.seller_id = $2
        ORDER BY oi.id
        LIMIT 1`,
      [publicId, req.seller!.sellerId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (row.payment_method !== 'cash') {
      return res.status(400).json({ error: 'Solo podés ampliar reservas en efectivo. Las de Mercado Pago se cobran con link.' });
    }
    if (row.status !== 'paid') {
      return res.status(400).json({ error: 'Solo se pueden ampliar reservas ya cobradas.' });
    }

    const snap: OrderIncreaseSnapshot = {
      origAdults: row.adults,
      origChildren: row.children,
      unitPriceAdultUsd: row.unit_price_adult_usd,
      unitPriceChildUsd: row.unit_price_child_usd,
      subtotalUsd: row.subtotal_usd,
      transferRequested: row.transfer_requested,
      exchangeRateUsed: row.exchange_rate_used,
    };
    const calc = computeOrderIncrease(snap, { adults: parsed.data.adults, children: parsed.data.children });
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const cash = cashIncreaseCommission(row.net_total_usd, row.subtotal_usd, calc.newSubtotalUsd);
    const newCommissionArs = Math.round(cash.newCommissionUsd * row.exchange_rate_used * 100) / 100;

    const noteLine = `[${new Date().toISOString()}] Ampliación efectivo (vendedor): ${row.adults}→${parsed.data.adults} ad, ${row.children}→${parsed.data.children} men. Cobro adicional USD ${calc.chargeUsd}`;

    await applyOrderIncrease({
      orderId: row.order_id,
      itemId: row.item_id,
      optionId: row.option_id,
      serviceDate: row.service_date,
      defaultCapacityPerDay: row.default_capacity_per_day,
      extraPax: calc.extraAdults + calc.extraChildren,
      newAdults: parsed.data.adults,
      newChildren: parsed.data.children,
      newSubtotalUsd: calc.newSubtotalUsd,
      newTotalArs: calc.newTotalArs,
      chargeUsd: calc.chargeUsd,
      chargeArs: calc.chargeArs,
      newCommissionUsd: cash.newCommissionUsd,
      newCommissionArs,
      newNetTotalUsd: cash.newNetTotalUsd,
      eventType: 'order_increased_cash',
      noteLine,
    });

    if (parsed.data.notify_customer !== false) {
      sendOrderIncreasedNotifications(row.order_id, calc.chargeUsd, calc.chargeArs).catch((e) =>
        console.error('[email] seller increase notification failed for order', row.order_id, e),
      );
    }

    res.json({ data: { ok: true, charge_usd: calc.chargeUsd, charge_ars: calc.chargeArs, new_total_usd: calc.newSubtotalUsd } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/reduce-cash — el vendedor reduce una reserva
// SUYA en efectivo ya cobrada y le devuelve el delta en mano al pasajero.
const sellerReduceSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  transfer_requested: z.boolean(),
  notify_customer: z.boolean().optional().default(true),
});

sellerRouter.post('/me/orders/:publicId/reduce-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });

    const parsed = sellerReduceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

    const { rows } = await pool.query<{
      order_id: number; status: string; payment_method: string;
      total_ars: number; exchange_rate_used: number;
      item_id: number; adults: number; children: number;
      unit_price_adult_usd: number; unit_price_child_usd: number | null;
      subtotal_usd: number; transfer_requested: boolean; transfer_hotel: string | null;
      net_total_usd: number | null;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              o.total_ars::float AS total_ars, o.exchange_rate_used::float AS exchange_rate_used,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested, oi.transfer_hotel,
              a.net_total_usd_snapshot::float AS net_total_usd
         FROM orders o
         JOIN order_attributions a ON a.order_id = o.id
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.public_id = $1 AND a.seller_id = $2
        ORDER BY oi.id
        LIMIT 1`,
      [publicId, req.seller!.sellerId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (row.payment_method !== 'cash') {
      return res.status(400).json({ error: 'Solo podés reducir reservas en efectivo. Las de Mercado Pago las reintegra el administrador.' });
    }
    if (row.status !== 'paid') {
      return res.status(400).json({ error: 'Solo se pueden reducir reservas ya cobradas.' });
    }

    const snap: OrderReductionSnapshot = {
      origAdults: row.adults,
      origChildren: row.children,
      unitPriceAdultUsd: row.unit_price_adult_usd,
      unitPriceChildUsd: row.unit_price_child_usd,
      subtotalUsd: row.subtotal_usd,
      transferRequested: row.transfer_requested,
      totalArs: row.total_ars,
      exchangeRateUsed: row.exchange_rate_used,
      commissionPercent: null,
    };
    const calc = computeOrderReduction(snap, {
      adults: parsed.data.adults,
      children: parsed.data.children,
      transferRequested: parsed.data.transfer_requested,
    });
    if (!calc.ok) return res.status(400).json({ error: calc.error });

    const cash = recomputeCashCommission(row.net_total_usd, row.subtotal_usd, calc.newSubtotalUsd);
    const newCommissionArs = Math.round(cash.newCommissionUsd * row.exchange_rate_used * 100) / 100;

    const newTransfer = parsed.data.transfer_requested;
    const noteLine = `[${new Date().toISOString()}] Reducción efectivo (vendedor): ${row.adults}→${parsed.data.adults} ad, ${row.children}→${parsed.data.children} men${row.transfer_requested && !newTransfer ? ', traslado removido' : ''}. Devolución en efectivo USD ${calc.refundUsd}`;
    await applyOrderReduction({
      orderId: row.order_id,
      itemId: row.item_id,
      newAdults: parsed.data.adults,
      newChildren: parsed.data.children,
      newTransferRequested: newTransfer,
      newTransferHotel: newTransfer ? row.transfer_hotel : null,
      newSubtotalUsd: calc.newSubtotalUsd,
      newTotalArs: calc.newTotalArs,
      refundUsd: calc.refundUsd,
      refundArs: calc.refundArs,
      newCommissionUsd: cash.newCommissionUsd,
      newCommissionArs,
      newNetTotalUsd: cash.newNetTotalUsd,
      noteLine,
    });

    if (parsed.data.notify_customer !== false) {
      sendOrderModifiedNotifications(row.order_id, calc.refundUsd, calc.refundArs, null, true).catch((e) =>
        console.error('[email] seller cash reduce notification failed for order', row.order_id, e),
      );
    }

    res.json({ data: { ok: true, refund_usd: calc.refundUsd, refund_ars: calc.refundArs, new_total_usd: calc.newSubtotalUsd } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/add-mp — el vendedor genera un link incremental
// de MP para sumar pasajeros a una reserva SUYA pagada por MP. El link es para el pasajero.
const sellerAddMpSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});

sellerRouter.post('/me/orders/:publicId/add-mp', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = sellerAddMpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

    const result = await createAddonForOrder({
      orderPublicId: publicId,
      adults: parsed.data.adults,
      children: parsed.data.children,
      restrictSellerId: req.seller!.sellerId,
    });
    if (!result.ok) return res.status(result.httpStatus).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) { next(err); }
});

// ─── Notificaciones del vendedor ─────────────────────────
// GET /api/seller/me/notifications/stream — SSE push en tiempo real
// Auth: token en query param (EventSource no admite headers custom)
sellerRouter.get('/me/notifications/stream', async (req, res, next) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { data: userData, error } = await (await import('../../services/supabase.js')).supabaseAdmin.auth.getUser(token);
    if (error || !userData?.user) return res.status(401).end();

    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM sellers WHERE supabase_user_id = $1 AND is_active = TRUE LIMIT 1`,
      [userData.user.id],
    );
    if (!rows[0]) return res.status(403).end();
    const sellerId = rows[0].id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Heartbeat cada 25s para mantener la conexión viva
    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch { /* cliente desconectado */ }
    }, 25_000);

    addConnection(sellerId, res);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeConnection(sellerId, res);
    });
  } catch (err) { next(err); }
});

// GET /api/seller/me/notifications — lista las últimas 50
sellerRouter.get('/me/notifications', async (req, res, next) => {
  try {
    const notifications = await listNotifications(req.seller!.sellerId);
    res.json({ data: notifications });
  } catch (err) { next(err); }
});

// PATCH /api/seller/me/notifications/read-all — marca todas como leídas
sellerRouter.patch('/me/notifications/read-all', async (req, res, next) => {
  try {
    const updated = await markAllRead(req.seller!.sellerId);
    res.json({ data: { updated } });
  } catch (err) { next(err); }
});

// GET /api/seller/me/notifications/unread-count — conteo rápido (sin marcar leído)
sellerRouter.get('/me/notifications/unread-count', async (req, res, next) => {
  try {
    const count = await getUnreadCount(req.seller!.sellerId);
    res.json({ data: { count } });
  } catch (err) { next(err); }
});
