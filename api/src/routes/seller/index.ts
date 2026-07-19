import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import type { PoolClient } from 'pg';
import { RouteValidationError } from '../../errors.js';
import { requireSeller } from '../../middleware/requireSeller.js';
import { pool } from '../../db.js';
import { listSellerOrders } from '../../repos/sellers.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { config } from '../../config.js';
import { sendSellerPasswordReset, sendCashOrderNotifications, sendCashCollectedNotifications, sendOrderIncreasedNotifications, sendOrderModifiedNotifications, sendSellerCancelledNotifications, sendOrderRescheduledNotifications, sendPaymentLinkEmail } from '../../services/email.js';
import { computeOrderReduction, type OrderReductionSnapshot } from '../../services/orderReduction.js';
import { recomputeCashCommission } from '../../services/orderCommission.js';
import { createCashAddonForOrder } from '../../services/orderAddon.js';
import { listPendingAddonsByOrderPublicId, getAddonForAction, applyAddonPayment, cancelAddon, cancelPendingAddonsForOrder } from '../../repos/addons.js';
import { addConnection, removeConnection } from '../../services/sseNotifier.js';
import { createPreference } from '../../services/mercadopago.js';
import { getExchangeRate, convertUsdToArs, getModifyWindow, getCancelWindow, checkOperationWindow } from '../../services/settings.js';
import { createPendingOrder, setOrderPreferenceId, logPaymentEvent, applyOrderReduction, listSellerArchive, restoreFromSellerArchive, archiveBySeller, ConcurrentModificationError } from '../../repos/orders.js';
import { getSellerFaq } from '../../services/content.js';
import { listNotifications, markAllRead, getUnreadCount, deleteNotification, notifyAdminsNewOrderPaid } from '../../repos/notifications.js';
import { checkSingleDateAvailability, checkAvailabilityTxLocked } from '../../repos/availability.js';
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
         COALESCE(stats.revenue_paid_ars, 0)::float AS revenue_paid_ars,
         COALESCE(stats.commission_earned_usd, 0)::float AS commission_earned_usd,
         COALESCE(stats.commission_earned_ars, 0)::float AS commission_earned_ars,
         COALESCE(stats.commission_paid_usd, 0)::float   AS commission_paid_usd,
         COALESCE(stats.commission_paid_ars, 0)::float   AS commission_paid_ars,
         COALESCE(stats.commission_pending_usd, 0)::float AS commission_pending_usd,
         COALESCE(stats.commission_pending_ars, 0)::float AS commission_pending_ars,
         COALESCE(stats.net_pending_settlement_usd, 0)::float AS net_pending_settlement_usd,
         COALESCE(stats.net_pending_settlement_ars, 0)::float AS net_pending_settlement_ars,
         COALESCE(notifs.unread_count, 0)::int AS unread_notifications
       FROM sellers s
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE o.status = 'paid') AS orders_paid,
           -- Facturación y comisión: SOLO Mercado Pago. En efectivo (pago manual) el
           -- vendedor cobra el monto que decide y no lo trazamos: solo nos importa el
           -- neto a rendir (net_pending_settlement, abajo). Ver migración 016 / feature
           -- de monto abierto en efectivo.
           SUM(o.total_usd) FILTER (WHERE o.status = 'paid' AND o.payment_method = 'mercadopago') AS revenue_paid_usd,
           SUM(o.total_ars) FILTER (WHERE o.status = 'paid' AND o.payment_method = 'mercadopago') AS revenue_paid_ars,
           SUM(a.commission_amount_usd) FILTER (WHERE o.status = 'paid' AND o.payment_method = 'mercadopago') AS commission_earned_usd,
           SUM(a.commission_amount_ars) FILTER (WHERE o.status = 'paid' AND o.payment_method = 'mercadopago') AS commission_earned_ars,
           -- MP: comisión que ya te liquidamos
           SUM(a.commission_amount_usd) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NOT NULL
           ) AS commission_paid_usd,
           SUM(a.commission_amount_ars) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NOT NULL
           ) AS commission_paid_ars,
           -- MP: comisión que te debemos liquidar (pendiente)
           SUM(a.commission_amount_usd) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NULL
           ) AS commission_pending_usd,
           SUM(a.commission_amount_ars) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NULL
           ) AS commission_pending_ars,
           -- Efectivo: neto que tenés que rendirnos (pendiente)
           SUM(a.net_total_usd_snapshot) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'cash' AND a.net_settled_at IS NULL
           ) AS net_pending_settlement_usd,
           SUM(a.net_total_usd_snapshot * o.exchange_rate_used) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'cash' AND a.net_settled_at IS NULL
           ) AS net_pending_settlement_ars
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
    const rows = await listSellerOrders(req.seller!.sellerId, { status, hideAutoArchived: true });
    // El vendedor no ve links de Mercado Pago (ni para vender ni para reenviar).
    const sanitized = rows.map(({ mp_init_point: _mp_init_point, ...rest }) => rest);
    res.json({ data: sanitized });
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
    nationality: z.string().min(1, 'La nacionalidad es obligatoria').max(80),
    dni: z.string().max(40).optional().nullable(),
  }),
  payment_method: z.enum(['mercadopago', 'cash']),
  transfer_requested: z.boolean().optional(),
  transfer_hotel: z.string().max(200).optional().nullable(),
  transfer_room: z.string().max(80).optional().nullable(),
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
        transfer_room: (input.transfer_requested && input.transfer_room) ? input.transfer_room : null,
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

    await setOrderPreferenceId(order.id, pref.id, pref.init_point);
    await logPaymentEvent(order.id, 'preference_created_by_seller', pref.id, { init_point: pref.init_point });

    // El vendedor no ve ni reenvía el link de MP — se lo mandamos al cliente por email.
    sendPaymentLinkEmail(order.id, pref.init_point).catch((err) =>
      console.error('[email] sendPaymentLinkEmail failed for seller order', order.id, err),
    );

    res.json({
      data: {
        order_public_id: order.public_id,
        payment_method: 'mercadopago',
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
         o.total_ars::float        AS total_ars,
         o.payment_method,
         a.commission_amount_usd::float AS commission_amount_usd,
         a.commission_amount_ars::float AS commission_amount_ars,
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

const collectCashSchema = z.object({ currency: z.enum(['ARS', 'USD']).default('ARS') });

// POST /api/seller/me/orders/:publicId/collect — vendedor confirma que recibió el dinero en efectivo
sellerRouter.post('/me/orders/:publicId/collect', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!publicId) return res.status(400).json({ error: 'publicId requerido' });
    const parsedCurrency = collectCashSchema.safeParse(req.body ?? {});
    if (!parsedCurrency.success) return res.status(400).json({ error: 'Moneda inválida' });
    const { currency } = parsedCurrency.data;

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

    // Marcar como pagada de forma atómica: el WHERE status = 'pending' evita que un
    // doble clic (o el admin confirmando el mismo cobro en paralelo) dispare el email
    // de confirmación dos veces — solo una de las dos requests gana la carrera.
    const { rowCount } = await pool.query(
      `UPDATE orders
          SET status = 'paid',
              paid_at = NOW(),
              cash_collected_at = NOW(),
              cash_collected_currency = $2
        WHERE id = $1 AND status = 'pending'`,
      [order.id, currency],
    );
    if (!rowCount) {
      return res.status(409).json({ error: 'La orden ya fue procesada anteriormente' });
    }

    await logPaymentEvent(order.id, 'cash_collected_by_seller', null, { seller_id: req.seller!.sellerId, currency });

    // Aviso en vivo al panel de órdenes del admin — el vendedor confirmó el cobro,
    // no el admin, así que le sirve enterarse sin recargar.
    notifyAdminsNewOrderPaid(order.id).catch((e) =>
      console.error('[notif] notifyAdminsNewOrderPaid failed:', e),
    );

    // Enviar emails a todas las partes (cliente + admin + vendedor)
    sendCashCollectedNotifications(order.id).catch((e) =>
      console.error('[collect] email send failed:', e),
    );

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/increase-cash — el vendedor suma pasajeros a una
// reserva EN EFECTIVO suya: crea una ampliación PENDIENTE de cobro (reserva el cupo).
// Después confirma el cobro (flujo pendiente → cobrada, como la reserva original).
const sellerIncreaseSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});

sellerRouter.post('/me/orders/:publicId/increase-cash', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });
    const parsed = sellerIncreaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

    const result = await createCashAddonForOrder({
      orderPublicId: publicId, adults: parsed.data.adults, children: parsed.data.children,
      restrictSellerId: req.seller!.sellerId,
    });
    if (!result.ok) return res.status(result.httpStatus).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) { next(err); }
});

// GET /api/seller/me/orders/:publicId/addons — ampliaciones pendientes de una orden suya
sellerRouter.get('/me/orders/:publicId/addons', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });
    const addons = await listPendingAddonsByOrderPublicId(publicId, req.seller!.sellerId);
    // El vendedor no ve links de Mercado Pago de ampliaciones tampoco.
    const sanitized = addons.map(({ mp_init_point: _mp_init_point, ...rest }) => rest);
    res.json({ data: sanitized });
  } catch (err) { next(err); }
});

// POST /api/seller/me/addons/:addonPublicId/collect — confirma el cobro de una ampliación en efectivo
sellerRouter.post('/me/addons/:addonPublicId/collect', async (req, res, next) => {
  try {
    const addonPublicId = req.params.addonPublicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(addonPublicId)) return res.status(400).json({ error: 'ID inválido' });
    const addon = await getAddonForAction(addonPublicId);
    if (!addon || addon.seller_id !== req.seller!.sellerId) return res.status(404).json({ error: 'Ampliación no encontrada' });
    if (addon.payment_method !== 'cash') return res.status(400).json({ error: 'Esta ampliación no es en efectivo.' });
    if (addon.status !== 'pending') return res.status(409).json({ error: 'La ampliación ya fue procesada.' });

    const r = await applyAddonPayment(addonPublicId, null);
    if (!r.applied) return res.status(409).json({ error: 'No se pudo aplicar la ampliación.' });
    if (r.closedOrder) {
      return res.status(409).json({ error: 'La reserva ya se había cerrado (reintegrada/cancelada) antes de este cobro — no se sumó el pasajero extra. Queda registrado para revisión manual.' });
    }
    if (!r.alreadyApplied && r.orderId != null) {
      sendOrderIncreasedNotifications(r.orderId, r.chargeUsd ?? 0, r.chargeArs ?? 0).catch((e) =>
        console.error('[email] seller cash addon collect notification failed', e));
    }
    res.json({ data: { ok: true, charge_usd: r.chargeUsd, charge_ars: r.chargeArs } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/addons/:addonPublicId/cancel — cancela una ampliación pendiente suya
sellerRouter.post('/me/addons/:addonPublicId/cancel', async (req, res, next) => {
  try {
    const addonPublicId = req.params.addonPublicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(addonPublicId)) return res.status(400).json({ error: 'ID inválido' });
    const addon = await getAddonForAction(addonPublicId);
    if (!addon || addon.seller_id !== req.seller!.sellerId) return res.status(404).json({ error: 'Ampliación no encontrada' });
    const orderId = await cancelAddon(addonPublicId);
    if (orderId == null) return res.status(409).json({ error: 'La ampliación no está pendiente.' });
    await logPaymentEvent(orderId, 'addon_cancelled', null, { addon_public_id: addonPublicId });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/reduce-cash — el vendedor reduce una reserva
// SUYA en efectivo ya cobrada y le devuelve el delta en mano al pasajero.
const sellerReduceSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  transfer_requested: z.boolean(),
  notify_customer: z.boolean().optional().default(true),
  reason: z.string().max(500).nullish(),
  // Presentes solo cuando la misma acción también reprogramó la fecha (ver
  // ModifyReservationModal): permiten mandar un único email combinado.
  reschedule_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reschedule_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
      service_date: string | Date;
      net_total_usd: number | null; net_settled_at: string | null;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              o.total_ars::float AS total_ars, o.exchange_rate_used::float AS exchange_rate_used,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested, oi.transfer_hotel,
              oi.service_date,
              a.net_total_usd_snapshot::float AS net_total_usd, a.net_settled_at
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
    if (row.status !== 'paid' && row.status !== 'pending') {
      return res.status(400).json({ error: `No se puede reducir una reserva en estado ${row.status}` });
    }
    if (row.net_settled_at) {
      return res.status(409).json({ error: 'Esta orden ya fue rendida al operador. No se puede modificar una vez liquidada.' });
    }
    const sellerReduceCheck = checkOperationWindow(await getModifyWindow(), row.service_date);
    if (sellerReduceCheck.blocked) return res.status(409).json({ error: sellerReduceCheck.message });

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
    const noteLine = `[${new Date().toISOString()}] Reducción efectivo (vendedor): ${row.adults}→${parsed.data.adults} ad, ${row.children}→${parsed.data.children} men${row.transfer_requested && !newTransfer ? ', traslado removido' : ''}. Devolución en efectivo USD ${calc.refundUsd}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`;
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
      newCommissionUsd: cash.newCommissionUsd,
      newCommissionArs,
      newNetTotalUsd: cash.newNetTotalUsd,
      noteLine,
      actor: 'seller',
    });

    if (parsed.data.notify_customer !== false) {
      const dateChange = parsed.data.reschedule_from && parsed.data.reschedule_to
        ? { prevDate: parsed.data.reschedule_from, newDate: parsed.data.reschedule_to }
        : null;
      sendOrderModifiedNotifications(row.order_id, calc.refundUsd, calc.refundArs, parsed.data.reason ?? null, true, dateChange).catch((e) =>
        console.error('[email] seller cash reduce notification failed for order', row.order_id, e),
      );
    }

    res.json({ data: { ok: true, refund_usd: calc.refundUsd, refund_ars: calc.refundArs, new_total_usd: calc.newSubtotalUsd } });
  } catch (err) {
    if (err instanceof ConcurrentModificationError) return res.status(409).json({ error: err.message });
    next(err);
  }
});

// POST /api/seller/me/orders/:publicId/add-mp — deshabilitado: el vendedor no opera
// sobre órdenes de Mercado Pago. El admin gestiona los links de diferencia.
sellerRouter.post('/me/orders/:publicId/add-mp', async (_req, res) => {
  res.status(403).json({
    error: 'Las reservas de Mercado Pago las gestiona el administrador. Si el cliente necesita sumar pasajeros, coordinalo con nosotros.',
  });
});

// GET /api/seller/me/orders/:publicId/events — histórico de pasos de una orden suya
sellerRouter.get('/me/orders/:publicId/events', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });
    const { rows } = await pool.query(
      `SELECT pe.id, pe.event_type, pe.payload, pe.created_at
         FROM payment_events pe
         JOIN orders o ON o.id = pe.order_id
         JOIN order_attributions a ON a.order_id = o.id
        WHERE o.public_id = $1 AND a.seller_id = $2
        ORDER BY pe.created_at DESC
        LIMIT 50`,
      [publicId, req.seller!.sellerId],
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/cancel — el vendedor cancela una reserva
// SUYA pagada en efectivo, siempre que no esté liquidada ni dentro de la ventana de cancelación.
// Las órdenes de Mercado Pago las cancela el administrador (ver payment_method check abajo).
const sellerCancelSchema = z.object({
  reason: z.string().max(500).nullish(),
});

sellerRouter.post('/me/orders/:publicId/cancel', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });

    const parsed = sellerCancelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const reason = parsed.data.reason ?? null;

    const { rows } = await pool.query<{
      order_id: number; status: string; payment_method: string;
      net_settled_at: string | null; service_date: string;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              a.net_settled_at, oi.service_date
         FROM orders o
         JOIN order_attributions a ON a.order_id = o.id
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.public_id = $1 AND a.seller_id = $2
        ORDER BY oi.id LIMIT 1`,
      [publicId, req.seller!.sellerId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (row.payment_method === 'mercadopago') {
      return res.status(403).json({ error: 'Las reservas de Mercado Pago las cancela el administrador. Pedile al cliente que se contacte con nosotros.' });
    }
    if (!['pending', 'paid'].includes(row.status)) {
      return res.status(400).json({ error: `No se puede cancelar una reserva en estado "${row.status}".` });
    }
    if (row.net_settled_at) {
      return res.status(409).json({ error: 'Esta orden ya fue rendida al operador. No se puede cancelar una vez liquidada.' });
    }
    const cancelCheck = checkOperationWindow(await getCancelWindow(), row.service_date);
    if (cancelCheck.blocked) return res.status(409).json({ error: cancelCheck.message });

    // WHERE status IN (...) hace la transición atómica: evita que un doble clic dispare
    // el email de cancelación (y su aviso de "coordiná la devolución") dos veces.
    const { rowCount } = await pool.query(
      `UPDATE orders
          SET status = 'cancelled',
              cancelled_by = 'seller',
              cancel_reason = $2,
              cancelled_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status IN ('pending', 'paid')`,
      [row.order_id, reason],
    );
    if (!rowCount) {
      return res.status(409).json({ error: 'La reserva ya fue procesada anteriormente' });
    }
    await logPaymentEvent(row.order_id, 'order_cancelled', null, {
      actor: 'seller', seller_id: req.seller!.sellerId, reason,
    });

    // Notificar al cliente y al admin — el cliente debe coordinar devolución con el vendedor
    sendSellerCancelledNotifications(row.order_id, reason).catch((err) =>
      console.error('[email] seller cancel notifications failed:', err),
    );
    // La reserva completa se canceló: cualquier ampliación sin cobrar queda sin efecto.
    cancelPendingAddonsForOrder(row.order_id).catch((err) =>
      console.error('[addons] cancelPendingAddonsForOrder failed for order', row.order_id, err),
    );

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/reschedule — reprograma la fecha de servicio.
const sellerRescheduleSchema = z.object({
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).nullish(),
  notify_customer: z.boolean().optional(),
});

sellerRouter.post('/me/orders/:publicId/reschedule', async (req, res, next) => {
  const publicId = req.params.publicId;
  if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'ID inválido' });
  const parsed = sellerRescheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

  const { new_date, reason, notify_customer } = parsed.data;
  const newDateObj = new Date(`${new_date}T00:00:00`);
  if (Number.isNaN(newDateObj.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
  if (newDateObj.getTime() < Date.now() - 86_400_000) return res.status(400).json({ error: 'La fecha no puede ser pasada' });

  // Se resuelve ANTES de abrir la transacción: es una config global que no depende de la
  // orden, y no tiene sentido retener el lock de la fila mientras se espera esta consulta.
  const modifyWindowHours = await getModifyWindow();

  // Transaccional con advisory lock (mismo criterio que el reschedule del admin): evita
  // que dos reprogramaciones/reservas concurrentes a la misma fecha destino sobrevendan.
  // No se toma FOR UPDATE de la orden acá a propósito: applyOrderIncrease/createOrderAddon
  // toman el advisory lock ANTES que cualquier lock de fila, así que tomarlo al revés acá
  // invertía el orden entre rutas (riesgo de deadlock). El UPDATE final es optimista
  // (guarda `AND service_date = $3`) — si la orden cambió entre la lectura y la escritura,
  // no pisa nada, tira ConcurrentModificationError (409).
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      order_id: number; status: string; item_id: number; option_id: number;
      adults: number; children: number; service_date: string; net_settled_at: string | null;
      payment_method: string;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
              oi.id AS item_id, oi.option_id, oi.adults, oi.children,
              to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
              a.net_settled_at
         FROM orders o
         JOIN order_attributions a ON a.order_id = o.id
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.public_id = $1 AND a.seller_id = $2
        ORDER BY oi.id LIMIT 1`,
      [publicId, req.seller!.sellerId],
    );
    const row = rows[0];
    if (!row) throw new RouteValidationError(404, 'Reserva no encontrada');
    if (row.payment_method === 'mercadopago') {
      throw new RouteValidationError(403, 'Las reservas de Mercado Pago las reprograma el administrador. Pedile al cliente que se contacte con nosotros.');
    }
    if (!['pending', 'paid'].includes(row.status)) {
      throw new RouteValidationError(400, `No se puede reprogramar una reserva en estado "${row.status}".`);
    }
    if (row.net_settled_at) {
      throw new RouteValidationError(409, 'Esta orden ya fue rendida al operador. No se puede modificar una vez liquidada.');
    }
    if (row.service_date === new_date) {
      throw new RouteValidationError(400, 'La nueva fecha es igual a la fecha actual.');
    }

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
      prev_date: row.service_date, new_date, actor: 'seller',
      reason: reason ?? null, notify: notify_customer ?? true,
    });

    if (notify_customer !== false) {
      sendOrderRescheduledNotifications(row.order_id, row.service_date, new_date, reason ?? null, 'seller').catch((e) =>
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

// ─── Archivo del vendedor ─────────────────────────────────────────────────────
// Incluye automáticamente: canceladas, reintegradas, vencidas, fallidas y rendidas.

const sellerArchiveQuery = z.object({
  page:   z.coerce.number().int().min(1).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['cancelled', 'refunded', 'expired', 'settled']).optional(),
  search: z.string().max(120).optional(),
});

// GET /api/seller/me/orders/archive
sellerRouter.get('/me/orders/archive', async (req, res, next) => {
  try {
    const parsed = sellerArchiveQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Filtros inválidos', details: parsed.error.flatten() });
    const result = await listSellerArchive(req.seller!.sellerId, parsed.data);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/restore — restaura una orden archivada por el admin (solo si es propia)
sellerRouter.post('/me/orders/:publicId/restore', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const restored = await restoreFromSellerArchive(publicId, req.seller!.sellerId);
    if (restored === 0) return res.status(404).json({ error: 'No encontrada o no archivada' });

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// POST /api/seller/me/orders/:publicId/archive — archiva a mano una orden que el
// vendedor había restaurado, o una terminal (cancelada/reintegrada/vencida/fallida)
// que todavía no se archivó sola (ver archiveBySeller).
sellerRouter.post('/me/orders/:publicId/archive', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const archived = await archiveBySeller(publicId, req.seller!.sellerId);
    if (archived === 0) return res.status(404).json({ error: 'No encontrada o no se puede archivar en este estado' });

    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// GET /api/seller/me/orders/archive/download — CSV del archivo
sellerRouter.get('/me/orders/archive/download', async (req, res, next) => {
  try {
    const parsed = sellerArchiveQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Filtros inválidos' });
    const result = await listSellerArchive(req.seller!.sellerId, { ...parsed.data, page: 1, limit: 5000 });
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['public_id', 'status', 'customer_name', 'customer_email', 'total_usd', 'total_ars', 'payment_method', 'product_name', 'option_name', 'service_date', 'adults', 'children', 'created_at', 'archived_at'].join(',');
    const lines = result.orders.map((r) =>
      [r.public_id, r.status, r.customer_name, r.customer_email, r.total_usd, r.total_ars, r.payment_method, r.product_name, r.option_name, r.service_date, r.adults, r.children, r.created_at, r.archived_at]
        .map(escape).join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="archivo-mis-ventas.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { next(err); }
});

// GET /api/seller/me/faq — preguntas frecuentes para el portal del vendedor
sellerRouter.get('/me/faq', async (_req, res, next) => {
  try {
    res.json({ data: await getSellerFaq() });
  } catch (err) { next(err); }
});

// GET /api/seller/me/operation-windows — ventanas horarias de modificación y cancelación
sellerRouter.get('/me/operation-windows', async (_req, res, next) => {
  try {
    const [modify, cancel] = await Promise.all([getModifyWindow(), getCancelWindow()]);
    res.json({ data: { modify, cancel } });
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

// DELETE /api/seller/me/notifications/:id — elimina una notificación propia
sellerRouter.delete('/me/notifications/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    const deleted = await deleteNotification(id, req.seller!.sellerId);
    if (!deleted) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
