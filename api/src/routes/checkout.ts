import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import {
  createPreference,
  fetchPayment,
  searchPaymentByExternalRef,
  mapMpStatusToOrderStatus,
} from '../services/mercadopago.js';
import { getExchangeRate, convertUsdToArs, getSameDayCutoff } from '../services/settings.js';
import {
  createPendingOrder,
  setOrderPreferenceId,
  updateOrderFromPayment,
  logPaymentEvent,
  findOrderByPublicId,
} from '../repos/orders.js';
import { sendOrderPaidNotifications, sendCashOrderNotifications } from '../services/email.js';
import { createOrderPaidNotification, createCashBookingNotification } from '../repos/notifications.js';
import { checkSingleDateAvailability } from '../repos/availability.js';
import { checkoutLimiter } from '../middleware/rateLimit.js';

export const checkoutRouter = Router();

// ─── Validación del request ────────────────────────────────
const createCheckoutSchema = z.object({
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
  // Exclusividad de venta: toda reserva debe venir de un vendedor autorizado.
  ref_code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Se requiere el código de un vendedor autorizado'),
  utm: z.object({
    source: z.string().max(80).optional().nullable(),
    medium: z.string().max(80).optional().nullable(),
    campaign: z.string().max(80).optional().nullable(),
  }).optional(),
  transfer_requested: z.boolean().optional(),
  transfer_hotel: z.string().max(200).optional().nullable(),
});

// ─── POST /api/checkout/preferences ───────────────────────
checkoutRouter.post('/preferences', checkoutLimiter, async (req, res, next) => {
  try {
    const parsed = createCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const input = parsed.data;

    // 0) Exclusividad de venta: el ref_code debe pertenecer a un vendedor activo.
    //    Sin esto, cualquiera podría reservar por fuera de la red de vendedores.
    const { rows: sellerCheck } = await pool.query<{ id: number }>(
      `SELECT id FROM sellers WHERE code = $1 AND is_active = TRUE LIMIT 1`,
      [input.ref_code],
    );
    if (sellerCheck.length === 0) {
      return res.status(403).json({ error: 'SELLER_REQUIRED' });
    }

    // 1) Cargar option + product (precios autoritativos del backend, NO confiar en el cliente)
    const { rows: optionRows } = await pool.query<{
      id: number; product_id: number;
      name_es: string; name_en: string;
      price_adult_usd: string; price_child_usd: string | null;
      net_price_adult_usd: string | null; net_price_child_usd: string | null;
      transfer_price_usd: string; net_transfer_price_usd: string | null;
      net_price_currency: string;
      net_price_adult_ars: string | null; net_price_child_ars: string | null;
      net_transfer_price_ars: string | null;
      available_days: number[];
      default_capacity_per_day: number;
      product_name: string; product_slug: string;
      is_active: boolean; product_active: boolean;
    }>(
      `SELECT
         o.id, o.product_id,
         o.name_es, o.name_en,
         o.price_adult_usd::text          AS price_adult_usd,
         o.price_child_usd::text          AS price_child_usd,
         o.net_price_adult_usd::text      AS net_price_adult_usd,
         o.net_price_child_usd::text      AS net_price_child_usd,
         o.transfer_price_usd::text       AS transfer_price_usd,
         o.net_transfer_price_usd::text   AS net_transfer_price_usd,
         o.net_price_currency,
         o.net_price_adult_ars::text      AS net_price_adult_ars,
         o.net_price_child_ars::text      AS net_price_child_ars,
         o.net_transfer_price_ars::text   AS net_transfer_price_ars,
         o.available_days,
         o.default_capacity_per_day,
         o.is_active,
         p.name AS product_name, p.slug AS product_slug,
         p.is_active AS product_active
         FROM product_options o
         JOIN products p ON p.id = o.product_id
        WHERE o.id = $1
        LIMIT 1`,
      [input.option_id],
    );
    const option = optionRows[0];
    if (!option || !option.is_active || !option.product_active) {
      return res.status(404).json({ error: 'Option not found or inactive' });
    }

    // 2) Validar día de operación
    const date = new Date(`${input.service_date}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid service_date' });
    }
    if (date.getTime() < Date.now() - 86_400_000) {
      return res.status(400).json({ error: 'service_date cannot be in the past' });
    }
    // Validar horario límite global para reservas del mismo día (hora Buenos Aires = UTC-3)
    const cutoffTime = await getSameDayCutoff();
    if (cutoffTime) {
      const nowBA = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const todayBA = nowBA.toISOString().slice(0, 10);
      if (input.service_date === todayBA) {
        const currentMin = nowBA.getUTCHours() * 60 + nowBA.getUTCMinutes();
        const [ch, cm] = cutoffTime.split(':').map(Number);
        if (currentMin >= ch * 60 + cm) {
          return res.status(409).json({
            error: `Reservas para hoy se aceptan hasta las ${cutoffTime} (hora Buenos Aires)`,
          });
        }
      }
    }
    // JS: 0=Domingo. Nuestro schema: 1=Lun..7=Dom
    const isoDow = date.getDay() === 0 ? 7 : date.getDay();
    if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
      return res.status(400).json({
        error: 'This option does not operate on the selected day',
        available_days: option.available_days,
      });
    }

    // 2b) Validar disponibilidad puntual: fechas cerradas y capacidad real
    const availCheck = await checkSingleDateAvailability(
      option.id, option.default_capacity_per_day, input.service_date, input.adults + input.children,
    );
    if (!availCheck.ok) {
      return res.status(409).json({ error: availCheck.message ?? 'Fecha no disponible' });
    }

    // 3) Cálculo de totales (USD) — fuente de verdad: backend
    const priceAdult = Number.parseFloat(option.price_adult_usd);
    const priceChild = option.price_child_usd != null ? Number.parseFloat(option.price_child_usd) : 0;
    if (input.children > 0 && option.price_child_usd == null) {
      return res.status(400).json({ error: 'This option does not allow children pricing' });
    }
    const transferPriceUsd = Number.parseFloat(option.transfer_price_usd ?? '0');
    const transferRequested = input.transfer_requested === true && transferPriceUsd > 0;
    const pax = input.adults + input.children;
    const transferSubtotal = transferRequested ? Math.round(transferPriceUsd * pax * 100) / 100 : 0;
    const subtotalUsd = Math.round((input.adults * priceAdult + input.children * priceChild) * 100) / 100 + transferSubtotal;

    // 4) Tipo de cambio (se necesita antes del neto para convertir netos en ARS)
    const rate = await getExchangeRate();
    const totalArs = convertUsdToArs(subtotalUsd, rate);

    // Neto: monto mínimo que el operador debe recibir (si está configurado en la opción)
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
          + (transferRequested && netTransfer != null ? netTransfer * pax : 0)
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
          + (transferRequested && netTransferArs != null ? netTransferArs * pax : 0)
        ) * 100) / 100;
        netTotalUsd = Math.round((netTotalArs / rate) * 100) / 100;
      }
    }

    // 5) Crear orden pendiente en DB
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
        transfer_requested: transferRequested,
        transfer_hotel: input.transfer_hotel ?? null,
        net_total_usd: netTotalUsd,
      },
      total_usd: subtotalUsd,
      total_ars: totalArs,
      exchange_rate_used: rate,
      ref_code: input.ref_code ?? null,
      default_capacity_per_day: option.default_capacity_per_day,
      utm: input.utm,
    });

    // 6) Crear preference en MP
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
        seller_ref: input.ref_code ?? null,
        option_id: option.id,
        product_slug: option.product_slug,
        service_date: input.service_date,
      },
      webOrigin: config.WEB_ORIGIN,
    });

    await setOrderPreferenceId(order.id, pref.id);
    await logPaymentEvent(order.id, 'preference_created', pref.id, { init_point: pref.init_point });

    res.json({
      data: {
        order_public_id: order.public_id,
        preference_id: pref.id,
        init_point: pref.init_point,
        sandbox_init_point: pref.sandbox_init_point,
        total_usd: subtotalUsd,
        total_ars: totalArs,
        exchange_rate: rate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/checkout/seller-info?code=XXX ──────────────
// Endpoint público: devuelve si el vendedor existe, está activo y es permanente.
// Usado por el frontend para mostrar/ocultar la opción de pago en efectivo.
checkoutRouter.get('/seller-info', async (req, res, next) => {
  try {
    const code = req.query.code;
    if (!code || typeof code !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid code' });
    }
    res.set('Cache-Control', 'no-store');
    const { rows } = await pool.query<{ name: string; kind: string | null; is_permanent: boolean; is_active: boolean }>(
      `SELECT name, kind, is_permanent, is_active FROM sellers WHERE code = $1 LIMIT 1`,
      [code],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Seller not found' });
    if (!rows[0].is_active) return res.status(410).json({ error: 'SELLER_INACTIVE' });
    res.json({ data: { name: rows[0].name, kind: rows[0].kind, is_permanent: rows[0].is_permanent } });
  } catch (err) { next(err); }
});

// ─── POST /api/checkout/cash ──────────────────────────────
// Reserva directa con pago al vendedor. No genera preferencia de MP.
// Requiere ref_code válido (el vendedor cobra en efectivo).
const cashCheckoutSchema = createCheckoutSchema.extend({
  ref_code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'ref_code is required for cash payment'),
});

checkoutRouter.post('/cash', checkoutLimiter, async (req, res, next) => {
  try {
    const parsed = cashCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const input = parsed.data;

    // Cargar option + product
    const { rows: optionRows } = await pool.query<{
      id: number; product_id: number;
      name_es: string; price_adult_usd: string; price_child_usd: string | null;
      net_price_adult_usd: string | null; net_price_child_usd: string | null;
      transfer_price_usd: string; net_transfer_price_usd: string | null;
      net_price_currency: string;
      net_price_adult_ars: string | null; net_price_child_ars: string | null;
      net_transfer_price_ars: string | null;
      available_days: number[];
      default_capacity_per_day: number;
      product_name: string; product_slug: string;
      is_active: boolean; product_active: boolean;
    }>(
      `SELECT o.id, o.product_id, o.name_es,
              o.price_adult_usd::text        AS price_adult_usd,
              o.price_child_usd::text        AS price_child_usd,
              o.net_price_adult_usd::text    AS net_price_adult_usd,
              o.net_price_child_usd::text    AS net_price_child_usd,
              o.transfer_price_usd::text     AS transfer_price_usd,
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
      return res.status(404).json({ error: 'Option not found or inactive' });
    }

    // Validar día de operación
    const date = new Date(`${input.service_date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Invalid service_date' });
    if (date.getTime() < Date.now() - 86_400_000) return res.status(400).json({ error: 'service_date cannot be in the past' });
    const isoDow = date.getDay() === 0 ? 7 : date.getDay();
    if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
      return res.status(400).json({ error: 'This option does not operate on the selected day', available_days: option.available_days });
    }
    // Validar horario límite global para reservas del mismo día (hora Buenos Aires = UTC-3)
    const cutoffTimeCash = await getSameDayCutoff();
    if (cutoffTimeCash) {
      const nowBA = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const todayBA = nowBA.toISOString().slice(0, 10);
      if (input.service_date === todayBA) {
        const currentMin = nowBA.getUTCHours() * 60 + nowBA.getUTCMinutes();
        const [ch, cm] = cutoffTimeCash.split(':').map(Number);
        if (currentMin >= ch * 60 + cm) {
          return res.status(409).json({
            error: `Reservas para hoy se aceptan hasta las ${cutoffTimeCash} (hora Buenos Aires)`,
          });
        }
      }
    }

    // Validar disponibilidad puntual: fechas cerradas y capacidad real
    const availCheckCash = await checkSingleDateAvailability(
      option.id, option.default_capacity_per_day, input.service_date, input.adults + input.children,
    );
    if (!availCheckCash.ok) {
      return res.status(409).json({ error: availCheckCash.message ?? 'Fecha no disponible' });
    }

    // Cálculo de totales
    const priceAdult = Number.parseFloat(option.price_adult_usd);
    const priceChild = option.price_child_usd != null ? Number.parseFloat(option.price_child_usd) : 0;
    if (input.children > 0 && option.price_child_usd == null) {
      return res.status(400).json({ error: 'This option does not allow children pricing' });
    }
    const transferPriceUsdCash = Number.parseFloat(option.transfer_price_usd ?? '0');
    const transferRequestedCash = input.transfer_requested === true && transferPriceUsdCash > 0;
    const paxCash = input.adults + input.children;
    const transferSubtotalCash = transferRequestedCash ? Math.round(transferPriceUsdCash * paxCash * 100) / 100 : 0;
    const subtotalUsd = Math.round((input.adults * priceAdult + input.children * priceChild) * 100) / 100 + transferSubtotalCash;

    const rate = await getExchangeRate();
    const totalArs = convertUsdToArs(subtotalUsd, rate);

    // Neto para efectivo
    const netCurrencyCash = option.net_price_currency ?? 'USD';
    let netTotalUsdCash: number | null = null;
    if (netCurrencyCash === 'USD') {
      const netAdultCash = option.net_price_adult_usd != null ? Number.parseFloat(option.net_price_adult_usd) : null;
      const netChildCash = option.net_price_child_usd != null ? Number.parseFloat(option.net_price_child_usd) : null;
      const netTransferCash = option.net_transfer_price_usd != null ? Number.parseFloat(option.net_transfer_price_usd) : null;
      if (netAdultCash != null) {
        netTotalUsdCash = Math.round((
          input.adults * netAdultCash
          + input.children * (netChildCash ?? netAdultCash)
          + (transferRequestedCash && netTransferCash != null ? netTransferCash * paxCash : 0)
        ) * 100) / 100;
      }
    } else {
      const netAdultArsCash = option.net_price_adult_ars != null ? Number.parseFloat(option.net_price_adult_ars) : null;
      const netChildArsCash = option.net_price_child_ars != null ? Number.parseFloat(option.net_price_child_ars) : null;
      const netTransferArsCash = option.net_transfer_price_ars != null ? Number.parseFloat(option.net_transfer_price_ars) : null;
      if (netAdultArsCash != null && rate > 0) {
        const netTotalArs = Math.round((
          input.adults * netAdultArsCash
          + input.children * (netChildArsCash ?? netAdultArsCash)
          + (transferRequestedCash && netTransferArsCash != null ? netTransferArsCash * paxCash : 0)
        ) * 100) / 100;
        netTotalUsdCash = Math.round((netTotalArs / rate) * 100) / 100;
      }
    }

    // Verificar que el ref_code pertenece a un vendedor activo y permanente
    const { rows: sellerCheck } = await pool.query<{ id: number; is_permanent: boolean }>(
      `SELECT id, is_permanent FROM sellers WHERE code = $1 AND is_active = TRUE LIMIT 1`,
      [input.ref_code],
    );
    if (sellerCheck.length === 0) {
      return res.status(400).json({ error: 'Código de vendedor inválido o inactivo' });
    }
    if (!sellerCheck[0].is_permanent) {
      return res.status(403).json({ error: 'Este vendedor no tiene habilitado el cobro en efectivo' });
    }

    // Crear la orden con payment_method = 'cash'
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
        transfer_requested: transferRequestedCash,
        transfer_hotel: input.transfer_hotel ?? null,
        net_total_usd: netTotalUsdCash,
      },
      total_usd: subtotalUsd,
      total_ars: totalArs,
      exchange_rate_used: rate,
      ref_code: input.ref_code,
      payment_method: 'cash',
      default_capacity_per_day: option.default_capacity_per_day,
      utm: input.utm,
    });

    await logPaymentEvent(order.id, 'cash_order_created', null, { ref_code: input.ref_code });

    // Notificaciones: fire-and-forget
    sendCashOrderNotifications(order.id).catch((err) =>
      console.error('[email] sendCashOrderNotifications failed for order', order.id, err),
    );
    createCashBookingNotification(order.id).catch((err) =>
      console.error('[notif] createCashBookingNotification failed for order', order.id, err),
    );

    res.status(201).json({ data: { order_public_id: order.public_id, total_usd: subtotalUsd } });
  } catch (err) {
    next(err);
  }
});

// Aplica un pago de MP a su orden: actualiza estado + payment_id y, si pasa a
// 'paid' por primera vez, dispara las notificaciones. Idempotente: chequea el
// estado previo, así no re-envía emails si la orden ya estaba pagada.
async function applyPaymentToOrder(
  payment: { id?: number | string; status?: string; payment_method_id?: string; external_reference?: string | null },
  eventDataId?: string | null,
): Promise<{ applied: boolean; status?: string; orderId?: number }> {
  const externalRef = payment.external_reference;
  if (!externalRef) return { applied: false };
  const newStatus = mapMpStatusToOrderStatus(payment.status);
  const paymentIdStr = payment.id != null ? String(payment.id) : null;
  const client = await pool.connect();
  try {
    const prior = await client.query<{ status: string }>(
      `SELECT status::text AS status FROM orders WHERE public_id = $1 LIMIT 1`, [externalRef],
    );
    const wasPaid = prior.rows[0]?.status === 'paid';
    const updated = await updateOrderFromPayment(client, externalRef, {
      status: newStatus,
      mp_payment_id: paymentIdStr,
      mp_payment_status: payment.status ?? null,
      mp_payment_method: payment.payment_method_id ?? null,
      paid_at: newStatus === 'paid' ? new Date() : null,
    });
    if (!updated) return { applied: false };
    await logPaymentEvent(updated.id, `order_${newStatus}`, eventDataId ?? paymentIdStr, {
      payment_id: payment.id, status: payment.status,
    });
    // Notificar solo en la transición a 'paid' (primera vez) → nunca duplica emails.
    if (newStatus === 'paid' && !wasPaid) {
      sendOrderPaidNotifications(updated.id).catch((err) =>
        console.error('[email] sendOrderPaidNotifications failed for order', updated.id, err),
      );
      createOrderPaidNotification(updated.id).catch((err) =>
        console.error('[notif] createOrderPaidNotification failed for order', updated.id, err),
      );
    }
    return { applied: true, status: newStatus, orderId: updated.id };
  } finally {
    client.release();
  }
}

// Respaldo del webhook: consulta MP por la referencia (public_id) de la orden y la
// sincroniza. Se usa desde el retorno del checkout y desde el admin.
export async function syncOrderWithMp(publicId: string): Promise<{ found: boolean; status?: string }> {
  const payment = await searchPaymentByExternalRef(publicId);
  if (!payment) return { found: false };
  const result = await applyPaymentToOrder({ ...payment, external_reference: publicId });
  return { found: result.applied, status: result.status };
}

// ─── POST /api/checkout/webhook ──────────────────────────
// MP envía notificaciones cuando cambia el estado de un pago.
// Firma: header x-signature con HMAC-SHA256(`id:${data.id};request-id:${x-request-id};ts:${ts}`, secret)
checkoutRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventType = (req.body?.type ?? req.query?.type) as string | undefined;
    const dataId = (req.body?.data?.id ?? req.query?.['data.id']) as string | undefined;

    // Verificación de firma solo si MP envía el header x-signature (nuevo formato webhook).
    // IPN legacy (topic=payment, sin x-signature) se acepta sin firma.
    const signatureHeader = req.header('x-signature');
    if (signatureHeader && config.MP_WEBHOOK_SECRET && config.MP_WEBHOOK_SECRET !== 'change-me-when-configured-in-mp-panel') {
      const requestId = req.header('x-request-id') ?? '';
      const isValid = verifyMpSignature(signatureHeader, requestId, dataId ?? '', config.MP_WEBHOOK_SECRET);
      if (!isValid) {
        await logPaymentEvent(null, 'webhook_invalid_signature', dataId ?? null, req.body);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    await logPaymentEvent(null, `webhook_${eventType ?? 'unknown'}`, dataId ?? null, req.body);

    // Solo procesamos eventos de tipo 'payment'
    if (eventType !== 'payment' || !dataId) {
      return res.status(200).json({ received: true });
    }

    // Consultar el pago en MP
    let payment;
    try {
      payment = await fetchPayment(dataId);
    } catch (err) {
      const isNotFound = (err as { status?: number; error?: string })?.status === 404
        || (err as { error?: string })?.error === 'not_found';
      if (isNotFound) {
        await logPaymentEvent(null, 'webhook_payment_not_found', dataId, req.body);
        return res.status(200).json({ received: true, note: 'payment not found in MP' });
      }
      throw err;
    }
    const externalRef = payment.external_reference;
    if (!externalRef) {
      await logPaymentEvent(null, 'webhook_no_external_ref', dataId, payment);
      return res.status(200).json({ received: true, note: 'no external_reference' });
    }

    await applyPaymentToOrder(
      {
        id: payment.id,
        status: payment.status,
        payment_method_id: payment.payment_method_id,
        external_reference: externalRef,
      },
      dataId,
    );

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/checkout/orders/:publicId ───────────────────
// Endpoint público para que las páginas de retorno muestren info del pago.
// No expone datos sensibles, solo lo necesario para el "thanks" page.
checkoutRouter.get('/orders/:publicId', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const order = await findOrderByPublicId(publicId);
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json({
      data: {
        public_id: publicId,
        status: order.status,
        total_usd: order.total_usd,
        total_ars: order.total_ars,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        payment_method: order.payment_method,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/checkout/orders/:publicId/sync ─────────────
// Respaldo del webhook: la pantalla de retorno lo llama para confirmar el pago
// consultando MP directamente (por si el webhook no llegó). Idempotente.
checkoutRouter.post('/orders/:publicId/sync', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const order = await findOrderByPublicId(publicId);
    if (!order) return res.status(404).json({ error: 'Not found' });

    // Ya confirmada con payment_id → no hace falta consultar MP.
    if (order.status === 'paid' && order.mp_payment_id) {
      return res.json({ data: { status: 'paid', synced: false } });
    }
    // El efectivo no pasa por MP.
    if (order.payment_method !== 'mercadopago') {
      return res.json({ data: { status: order.status, synced: false } });
    }

    await syncOrderWithMp(publicId);
    const fresh = await findOrderByPublicId(publicId);
    res.json({ data: { status: fresh?.status ?? order.status, synced: true } });
  } catch (err) {
    next(err);
  }
});

// HMAC-SHA256 según docs MP: el manifest es `id:{data.id};request-id:{x-request-id};ts:{ts}`
// donde ts y v1 vienen en el header x-signature como "ts=...,v1=..."
function verifyMpSignature(
  signatureHeader: string,
  requestId: string,
  dataId: string,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.trim().split('=') as [string, string]),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  // Comparación constant-time
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
