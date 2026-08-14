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
import {
  createPixCharge,
  getNauttOrder,
  mapNauttStatusToOrderStatus,
  NauttError,
} from '../services/nautt.js';
import { getExchangeRate, convertUsdToArs, getSameDayCutoff } from '../services/settings.js';
import {
  createPendingOrder,
  createOrderFromHold,
  updateOrderFromPayment,
  logPaymentEvent,
  findOrderByPublicId,
  getOrderVerificationInfo,
} from '../repos/orders.js';
import {
  createCheckoutHold,
  setHoldPreference,
  setHoldPixCharge,
  findHoldById,
  findHoldOrOrderRefByNauttOrderUuid,
  releaseHold,
  type HoldRow,
} from '../repos/checkoutHolds.js';
import { sendOrderPaidNotifications, sendCashOrderNotifications, sendOrderIncreasedNotifications } from '../services/email.js';
import { createOrderPaidNotification, createCashBookingNotification, notifyAdminsNewOrderPaid } from '../repos/notifications.js';
import { checkSingleDateAvailability } from '../repos/availability.js';
import { findAddonByPublicId, applyAddonPayment, cancelPendingAddonsForOrder } from '../repos/addons.js';
import { checkoutLimiter, webhookLimiter } from '../middleware/rateLimit.js';
import { generateVoucherPdf } from '../services/voucherPdf.js';

// TTL inicial de los checkout_holds (cupo congelado del checkout público, antes de
// confirmarse el pago). PIX se ajusta después a la expiración real del QR de Nautt
// (verificado en vivo: ~30 min, pero viene siempre de la respuesta de Nautt, nunca
// hardcodeado — puede cambiar de su lado) vía setHoldPixCharge; este valor es solo el
// margen mientras se genera el cobro. MP no tiene ese ajuste posterior, así que su
// hold vive el TTL completo.
const PIX_HOLD_INITIAL_TTL_MINUTES = 20;
const MP_HOLD_TTL_MINUTES = 30;

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
    nationality: z.string().min(1, 'La nacionalidad es obligatoria').max(80),
    dni: z.string().max(40).optional().nullable(),
  }),
  // Exclusividad de venta: toda reserva debe venir de un vendedor autorizado.
  ref_code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Se requiere el código de un recomendador autorizado'),
  utm: z.object({
    source: z.string().max(80).optional().nullable(),
    medium: z.string().max(80).optional().nullable(),
    campaign: z.string().max(80).optional().nullable(),
  }).optional(),
  transfer_requested: z.boolean().optional(),
  transfer_hotel: z.string().max(200).optional().nullable(),
  transfer_room: z.string().max(80).optional().nullable(),
  // El check "Acepto los Términos y Condiciones" del checkout es obligatorio — z.literal(true)
  // rechaza cualquier otro valor (false, ausente, etc.), no solo lo marca opcional.
  terms_accepted: z.literal(true, {
    errorMap: () => ({ message: 'Tenés que aceptar los Términos y Condiciones para continuar.' }),
  }),
});

// Prepara un checkout_hold de cupo (MP o PIX): valida vendedor, opción, fecha,
// disponibilidad y precios (fuente de verdad = backend) y congela el cupo hasta que el
// pago se confirme — la orden real recién se crea al confirmarse (ver applyGatewayResolution
// → createOrderFromHold). Devuelve todo lo necesario para generar el cobro, o un error
// HTTP listo para responder. Compartida por /pix y /preferences.
type PreparedHold =
  | {
      ok: true; holdId: string; expiresAt: Date;
      option: { id: number; name_es: string; product_name: string; product_slug: string };
      subtotalUsd: number; totalArs: number; rate: number;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

async function prepareCheckoutHold(
  input: z.infer<typeof createCheckoutSchema>,
  paymentMethod: 'mercadopago' | 'pix',
  ttlMinutes: number,
): Promise<PreparedHold> {
  // 0) Exclusividad de venta: el ref_code debe pertenecer a un vendedor activo.
  const { rows: sellerCheck } = await pool.query<{ id: number; card_enabled: boolean }>(
    `SELECT id, card_enabled FROM sellers WHERE code = $1 AND is_active = TRUE LIMIT 1`,
    [input.ref_code],
  );
  if (sellerCheck.length === 0) return { ok: false, status: 403, body: { error: 'SELLER_REQUIRED' } };
  // Tarjeta (Mercado Pago + Pix) deshabilitada para esta cuenta -- lo apaga solo el
  // admin de la plataforma, nunca el propio vendedor (ver sellers.card_enabled).
  if (!sellerCheck[0].card_enabled) {
    return { ok: false, status: 403, body: { error: 'CARD_DISABLED' } };
  }

  // 1) Cargar option + product (precios autoritativos del backend)
  const { rows: optionRows } = await pool.query<{
    id: number; product_id: number;
    name_es: string; name_en: string;
    price_adult_usd: string; price_child_usd: string | null;
    net_price_adult_usd: string | null; net_price_child_usd: string | null;
    transfer_mode: 'none' | 'optional' | 'included';
    transfer_price_usd: string; net_transfer_price_usd: string | null;
    net_price_currency: string;
    net_price_adult_ars: string | null; net_price_child_ars: string | null;
    net_transfer_price_ars: string | null;
    available_days: number[];
    default_capacity_per_day: number;
    product_name: string; product_slug: string;
    is_active: boolean; product_active: boolean;
    accepts_children: boolean;
  }>(
    `SELECT o.id, o.product_id, o.name_es, o.name_en,
            o.price_adult_usd::text          AS price_adult_usd,
            o.price_child_usd::text          AS price_child_usd,
            o.net_price_adult_usd::text      AS net_price_adult_usd,
            o.net_price_child_usd::text      AS net_price_child_usd,
            o.transfer_mode,
            o.transfer_price_usd::text       AS transfer_price_usd,
            o.net_transfer_price_usd::text   AS net_transfer_price_usd,
            o.net_price_currency,
            o.net_price_adult_ars::text      AS net_price_adult_ars,
            o.net_price_child_ars::text      AS net_price_child_ars,
            o.net_transfer_price_ars::text   AS net_transfer_price_ars,
            o.available_days, o.default_capacity_per_day, o.is_active,
            p.name AS product_name, p.slug AS product_slug, p.is_active AS product_active,
            p.accepts_children
       FROM product_options o
       JOIN products p ON p.id = o.product_id
      WHERE o.id = $1 LIMIT 1`,
    [input.option_id],
  );
  const option = optionRows[0];
  if (!option || !option.is_active || !option.product_active) {
    return { ok: false, status: 404, body: { error: 'Option not found or inactive' } };
  }

  // 2) Validar día de operación
  const date = new Date(`${input.service_date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { ok: false, status: 400, body: { error: 'Invalid service_date' } };
  if (date.getTime() < Date.now() - 86_400_000) return { ok: false, status: 400, body: { error: 'service_date cannot be in the past' } };
  const cutoffTime = await getSameDayCutoff();
  if (cutoffTime) {
    const nowBA = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const todayBA = nowBA.toISOString().slice(0, 10);
    if (input.service_date === todayBA) {
      const currentMin = nowBA.getUTCHours() * 60 + nowBA.getUTCMinutes();
      const [ch, cm] = cutoffTime.split(':').map(Number);
      if (currentMin >= ch * 60 + cm) {
        return { ok: false, status: 409, body: { error: `Reservas para hoy se aceptan hasta las ${cutoffTime} (hora Buenos Aires)` } };
      }
    }
  }
  const isoDow = date.getDay() === 0 ? 7 : date.getDay();
  if (option.available_days.length > 0 && !option.available_days.includes(isoDow)) {
    return { ok: false, status: 400, body: { error: 'This option does not operate on the selected day', available_days: option.available_days } };
  }

  // 2b) Disponibilidad puntual (fechas cerradas y capacidad real)
  const availCheck = await checkSingleDateAvailability(
    option.id, option.default_capacity_per_day, input.service_date, input.adults + input.children,
  );
  if (!availCheck.ok) return { ok: false, status: 409, body: { error: availCheck.message ?? 'Fecha no disponible' } };

  // 3) Totales (USD)
  const priceAdult = Number.parseFloat(option.price_adult_usd);
  const priceChild = option.price_child_usd != null ? Number.parseFloat(option.price_child_usd) : 0;
  if (input.children > 0 && (option.price_child_usd == null || !option.accepts_children)) {
    return { ok: false, status: 400, body: { error: 'This option does not allow children pricing' } };
  }
  // 'optional' = con costo, el cliente elige sumarlo. 'included' = ya está en el
  // precio del servicio, siempre aplica y no se cobra aparte.
  const transferPriceUsd = option.transfer_mode === 'optional' ? Number.parseFloat(option.transfer_price_usd ?? '0') : 0;
  const transferRequested = option.transfer_mode === 'included'
    ? true
    : (option.transfer_mode === 'optional' && input.transfer_requested === true && transferPriceUsd > 0);
  const pax = input.adults + input.children;
  const transferSubtotal = (option.transfer_mode === 'optional' && transferRequested)
    ? Math.round(transferPriceUsd * pax * 100) / 100
    : 0;
  const subtotalUsd = Math.round((input.adults * priceAdult + input.children * priceChild) * 100) / 100 + transferSubtotal;

  // 4) Tipo de cambio (para totales en ARS y netos en ARS)
  const rate = await getExchangeRate();
  const totalArs = convertUsdToArs(subtotalUsd, rate);

  // Neto (mínimo a recibir por el operador), igual que en /preferences
  const netCurrency = option.net_price_currency ?? 'USD';
  let netTotalUsd: number | null = null;
  if (netCurrency === 'USD') {
    const netAdult = option.net_price_adult_usd != null ? Number.parseFloat(option.net_price_adult_usd) : null;
    const netChild = option.net_price_child_usd != null ? Number.parseFloat(option.net_price_child_usd) : null;
    const netTransfer = option.net_transfer_price_usd != null ? Number.parseFloat(option.net_transfer_price_usd) : null;
    if (netAdult != null) {
      netTotalUsd = Math.round((
        input.adults * netAdult + input.children * (netChild ?? netAdult)
        + (option.transfer_mode === 'optional' && transferRequested && netTransfer != null ? netTransfer * pax : 0)
      ) * 100) / 100;
    }
  } else {
    const netAdultArs = option.net_price_adult_ars != null ? Number.parseFloat(option.net_price_adult_ars) : null;
    const netChildArs = option.net_price_child_ars != null ? Number.parseFloat(option.net_price_child_ars) : null;
    const netTransferArs = option.net_transfer_price_ars != null ? Number.parseFloat(option.net_transfer_price_ars) : null;
    if (netAdultArs != null && rate > 0) {
      const netTotalArs = Math.round((
        input.adults * netAdultArs + input.children * (netChildArs ?? netAdultArs)
        + (option.transfer_mode === 'optional' && transferRequested && netTransferArs != null ? netTransferArs * pax : 0)
      ) * 100) / 100;
      netTotalUsd = Math.round((netTotalArs / rate) * 100) / 100;
    }
  }

  // 5) Congelar el cupo (hold) — la orden real se crea recién cuando se confirma el pago
  const hold = await createCheckoutHold({
    paymentMethod,
    optionId: option.id,
    serviceDate: input.service_date,
    pax: input.adults + input.children,
    ttlMinutes,
    defaultCapacityPerDay: option.default_capacity_per_day,
    payload: {
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
        transfer_room: (transferRequested && input.transfer_room) ? input.transfer_room : null,
        net_total_usd: netTotalUsd,
      },
      total_usd: subtotalUsd,
      total_ars: totalArs,
      exchange_rate_used: rate,
      ref_code: input.ref_code ?? null,
      payment_method: paymentMethod,
      default_capacity_per_day: option.default_capacity_per_day,
      utm: input.utm,
    },
  });

  return {
    ok: true,
    holdId: hold.id,
    expiresAt: hold.expiresAt,
    option: { id: option.id, name_es: option.name_es, product_name: option.product_name, product_slug: option.product_slug },
    subtotalUsd, totalArs, rate,
  };
}

// ─── POST /api/checkout/pix ───────────────────────────────
// Cobra en reales (BRL) con PIX vía Nautt: crea la orden pendiente, abre la orden on-ramp
// y devuelve el "copia e cola" para que el front renderice el QR. Confirmación por webhook
// + polling (POST /orders/:publicId/sync).
checkoutRouter.post('/pix', checkoutLimiter, async (req, res, next) => {
  try {
    const parsed = createCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const prep = await prepareCheckoutHold(parsed.data, 'pix', PIX_HOLD_INITIAL_TTL_MINUTES);
    if (!prep.ok) return res.status(prep.status).json(prep.body);

    try {
      const charge = await createPixCharge({
        amountUsd: prep.subtotalUsd,
        orderRef: prep.holdId,
        description: `${prep.option.name_es} — ${prep.option.product_name}`,
      });
      await setHoldPixCharge(prep.holdId, charge);
      await logPaymentEvent(null, 'pix_charge_created', charge.nauttOrderUuid, {
        hold_id: prep.holdId, fiat_brl: charge.fiatAmountBrl, pix_expires_at: charge.pixExpiresAt,
      });
      res.json({
        data: {
          order_public_id: prep.holdId,
          nautt_order_uuid: charge.nauttOrderUuid,
          pix_qrcode: charge.pixQrcode,
          pix_expires_at: charge.pixExpiresAt,
          fiat_brl: charge.fiatAmountBrl,
          total_usd: prep.subtotalUsd,
        },
      });
    } catch (err) {
      // El hold nunca llegó a mostrarse al cliente (no se generó ningún QR real) — se
      // libera el cupo al instante en vez de esperar a que venza el TTL.
      await releaseHold(prep.holdId);
      await logPaymentEvent(null, 'pix_charge_failed', null, {
        hold_id: prep.holdId, message: (err as Error).message, code: err instanceof NauttError ? err.code : undefined,
      }).catch(() => {});
      const status = err instanceof NauttError ? (err.status && err.status >= 500 ? 502 : 400) : 502;
      return res.status(status).json({ error: 'No se pudo generar el cobro con PIX. Probá con otro medio de pago.' });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/checkout/orders/:publicId/pix-refresh ──────
// Regenera el QR PIX de una orden pendiente cuyo "copia e cola" venció, sin recrear la
// orden. Reutiliza el monto original (total_usd). Solo aplica a órdenes PIX pendientes.
// Un hold vencido deja de contar en la disponibilidad (expires_at > NOW() lo filtra) —
// mientras estuvo vencido, otro checkout pudo haber tomado ese mismo cupo. Antes de
// revivirlo (extender su vencimiento en pix-refresh / mp-refresh) hay que re-verificar
// que el cupo siga entrando; si no vale la pena chequear (todavía no venció), se salta.
// Best-effort (sin lock): la ventana de una doble regeneración simultánea del MISMO
// hold es remota — no justifica la complejidad de un advisory lock acá.
async function checkHoldStillAvailableIfExpired(hold: HoldRow): Promise<{ ok: true } | { ok: false; message: string }> {
  if (new Date(hold.expires_at).getTime() >= Date.now()) return { ok: true };
  const result = await checkSingleDateAvailability(
    hold.option_id, hold.payload.default_capacity_per_day, hold.service_date, hold.pax,
  );
  if (!result.ok) {
    return { ok: false, message: result.message ?? 'Ese cupo ya no está disponible — probá con otra fecha.' };
  }
  return { ok: true };
}

checkoutRouter.post('/orders/:publicId/pix-refresh', checkoutLimiter, async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    // Si ya hay una orden con este id, el pago ya se confirmó (el checkout público de
    // PIX solo crea la orden al materializarse desde el hold) — no hay nada que refrescar.
    const existingOrder = await findOrderByPublicId(publicId);
    if (existingOrder) return res.status(409).json({ error: 'La orden ya está pagada' });

    const hold = await findHoldById(publicId);
    if (!hold) return res.status(404).json({ error: 'Not found' });
    if (hold.payment_method !== 'pix') return res.status(400).json({ error: 'La orden no es de PIX' });

    const availCheck = await checkHoldStillAvailableIfExpired(hold);
    if (!availCheck.ok) return res.status(409).json({ error: availCheck.message });

    try {
      const charge = await createPixCharge({
        amountUsd: hold.payload.total_usd,
        orderRef: publicId,
        description: `Reserva ${publicId.slice(0, 8)}`,
      });
      // También extiende expires_at del hold a la nueva expiración real del QR.
      await setHoldPixCharge(publicId, charge);
      await logPaymentEvent(null, 'pix_charge_refreshed', charge.nauttOrderUuid, {
        hold_id: publicId, fiat_brl: charge.fiatAmountBrl, pix_expires_at: charge.pixExpiresAt,
      });
      res.json({
        data: {
          order_public_id: publicId,
          nautt_order_uuid: charge.nauttOrderUuid,
          pix_qrcode: charge.pixQrcode,
          pix_expires_at: charge.pixExpiresAt,
          fiat_brl: charge.fiatAmountBrl,
          total_usd: hold.payload.total_usd,
        },
      });
    } catch (err) {
      const status = err instanceof NauttError ? (err.status && err.status >= 500 ? 502 : 400) : 502;
      return res.status(status).json({ error: 'No se pudo regenerar el QR de PIX.' });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/checkout/orders/:publicId/mp-refresh ───────
// Mirror de /pix-refresh para Mercado Pago: si la preference venció (expiration_date_to,
// mismo TTL que el hold), regenera una preference nueva para el MISMO hold — sin perder
// el cupo reservado ni tener que reiniciar el checkout desde cero — y extiende el
// vencimiento del hold al del nuevo link.
checkoutRouter.post('/orders/:publicId/mp-refresh', checkoutLimiter, async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const existingOrder = await findOrderByPublicId(publicId);
    if (existingOrder) return res.status(409).json({ error: 'La orden ya está pagada' });

    const hold = await findHoldById(publicId);
    if (!hold) return res.status(404).json({ error: 'Not found' });
    if (hold.payment_method !== 'mercadopago') return res.status(400).json({ error: 'La orden no es de Mercado Pago' });

    const availCheck = await checkHoldStillAvailableIfExpired(hold);
    if (!availCheck.ok) return res.status(409).json({ error: availCheck.message });

    const { rows: optionRows } = await pool.query<{ product_slug: string }>(
      `SELECT p.slug AS product_slug FROM product_options po JOIN products p ON p.id = po.product_id WHERE po.id = $1 LIMIT 1`,
      [hold.option_id],
    );
    const productSlug = optionRows[0]?.product_slug ?? '';

    try {
      const pref = await createPreference({
        orderPublicId: publicId,
        title: `${hold.payload.item.option_name_snapshot} — ${hold.payload.item.product_name_snapshot}`,
        totalArs: hold.payload.total_ars,
        quantityAdults: hold.payload.item.adults,
        quantityChildren: hold.payload.item.children,
        customer: {
          name: hold.payload.customer.name,
          email: hold.payload.customer.email,
          phone: hold.payload.customer.phone ?? undefined,
        },
        metadata: {
          order_id: publicId,
          seller_ref: hold.payload.ref_code,
          option_id: hold.option_id,
          product_slug: productSlug,
          service_date: hold.service_date,
        },
        webOrigin: config.WEB_ORIGIN,
        expiresInMinutes: MP_HOLD_TTL_MINUTES,
      });
      const newExpiresAt = new Date(Date.now() + MP_HOLD_TTL_MINUTES * 60_000);
      await setHoldPreference(publicId, pref.id, pref.init_point, newExpiresAt);
      await logPaymentEvent(null, 'preference_refreshed', pref.id, { hold_id: publicId, init_point: pref.init_point });
      res.json({
        data: {
          order_public_id: publicId,
          preference_id: pref.id,
          init_point: pref.init_point,
          sandbox_init_point: pref.sandbox_init_point,
          total_usd: hold.payload.total_usd,
          total_ars: hold.payload.total_ars,
          exchange_rate: hold.payload.exchange_rate_used,
        },
      });
    } catch (err) {
      await logPaymentEvent(null, 'preference_refresh_failed', null, {
        hold_id: publicId, message: (err as Error).message,
      }).catch(() => {});
      return res.status(502).json({ error: 'No se pudo regenerar el link de pago.' });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/checkout/preferences ───────────────────────
checkoutRouter.post('/preferences', checkoutLimiter, async (req, res, next) => {
  try {
    const parsed = createCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const input = parsed.data;

    const prep = await prepareCheckoutHold(input, 'mercadopago', MP_HOLD_TTL_MINUTES);
    if (!prep.ok) return res.status(prep.status).json(prep.body);

    try {
      const pref = await createPreference({
        orderPublicId: prep.holdId,
        title: `${prep.option.name_es} — ${prep.option.product_name}`,
        totalArs: prep.totalArs,
        quantityAdults: input.adults,
        quantityChildren: input.children,
        customer: {
          name: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone ?? undefined,
        },
        metadata: {
          order_id: prep.holdId,
          seller_ref: input.ref_code ?? null,
          option_id: prep.option.id,
          product_slug: prep.option.product_slug,
          service_date: input.service_date,
        },
        webOrigin: config.WEB_ORIGIN,
        expiresInMinutes: MP_HOLD_TTL_MINUTES,
      });

      await setHoldPreference(prep.holdId, pref.id, pref.init_point);
      await logPaymentEvent(null, 'preference_created', pref.id, { hold_id: prep.holdId, init_point: pref.init_point });

      res.json({
        data: {
          order_public_id: prep.holdId,
          preference_id: pref.id,
          init_point: pref.init_point,
          sandbox_init_point: pref.sandbox_init_point,
          total_usd: prep.subtotalUsd,
          total_ars: prep.totalArs,
          exchange_rate: prep.rate,
        },
      });
    } catch (err) {
      // Igual que /pix: el hold nunca llegó a mostrarse al cliente, se libera al instante.
      await releaseHold(prep.holdId);
      await logPaymentEvent(null, 'preference_creation_failed', null, {
        hold_id: prep.holdId, message: (err as Error).message,
      }).catch(() => {});
      next(err);
    }
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
    const { rows } = await pool.query<{
      name: string; kind: string | null; is_permanent: boolean; card_enabled: boolean; is_active: boolean;
      landing_customization_enabled: boolean; logo_url: string | null; tagline: string | null; public_phone: string | null;
    }>(
      `SELECT name, kind, is_permanent, card_enabled, is_active,
              landing_customization_enabled, logo_url, tagline, public_phone
         FROM sellers WHERE code = $1 LIMIT 1`,
      [code],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Seller not found' });
    if (!rows[0].is_active) return res.status(410).json({ error: 'SELLER_INACTIVE' });
    const s = rows[0];
    res.json({
      data: {
        name: s.name,
        kind: s.kind,
        is_permanent: s.is_permanent,
        card_enabled: s.card_enabled,
        // Solo viaja al público si el admin habilitó la personalización para este vendedor.
        branding: s.landing_customization_enabled
          ? { logo_url: s.logo_url, tagline: s.tagline, public_phone: s.public_phone }
          : null,
      },
    });
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
      transfer_mode: 'none' | 'optional' | 'included';
      transfer_price_usd: string; net_transfer_price_usd: string | null;
      net_price_currency: string;
      net_price_adult_ars: string | null; net_price_child_ars: string | null;
      net_transfer_price_ars: string | null;
      available_days: number[];
      default_capacity_per_day: number;
      product_name: string; product_slug: string;
      is_active: boolean; product_active: boolean;
      accepts_children: boolean;
    }>(
      `SELECT o.id, o.product_id, o.name_es,
              o.price_adult_usd::text        AS price_adult_usd,
              o.price_child_usd::text        AS price_child_usd,
              o.net_price_adult_usd::text    AS net_price_adult_usd,
              o.net_price_child_usd::text    AS net_price_child_usd,
              o.transfer_mode,
              o.transfer_price_usd::text     AS transfer_price_usd,
              o.net_transfer_price_usd::text AS net_transfer_price_usd,
              o.net_price_currency,
              o.net_price_adult_ars::text    AS net_price_adult_ars,
              o.net_price_child_ars::text    AS net_price_child_ars,
              o.net_transfer_price_ars::text AS net_transfer_price_ars,
              o.available_days, o.default_capacity_per_day, o.is_active,
              p.name AS product_name, p.slug AS product_slug,
              p.is_active AS product_active, p.accepts_children
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
    if (input.children > 0 && (option.price_child_usd == null || !option.accepts_children)) {
      return res.status(400).json({ error: 'This option does not allow children pricing' });
    }
    const transferPriceUsdCash = option.transfer_mode === 'optional' ? Number.parseFloat(option.transfer_price_usd ?? '0') : 0;
    const transferRequestedCash = option.transfer_mode === 'included'
      ? true
      : (option.transfer_mode === 'optional' && input.transfer_requested === true && transferPriceUsdCash > 0);
    const paxCash = input.adults + input.children;
    const transferSubtotalCash = (option.transfer_mode === 'optional' && transferRequestedCash)
      ? Math.round(transferPriceUsdCash * paxCash * 100) / 100
      : 0;
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
          + (option.transfer_mode === 'optional' && transferRequestedCash && netTransferCash != null ? netTransferCash * paxCash : 0)
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
          + (option.transfer_mode === 'optional' && transferRequestedCash && netTransferArsCash != null ? netTransferArsCash * paxCash : 0)
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
      return res.status(400).json({ error: 'Código de recomendador inválido o inactivo' });
    }
    if (!sellerCheck[0].is_permanent) {
      return res.status(403).json({ error: 'Este recomendador no tiene habilitado el cobro en efectivo' });
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
        transfer_room: (transferRequestedCash && input.transfer_room) ? input.transfer_room : null,
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
// 'paid' por primera vez, dispara las notificaciones. Idempotente y atómico —
// updateOrderFromPayment toma el lock de fila y aplica la guarda de estado terminal
// en un solo UPDATE, así dos entregas del webhook (o un webhook tardío que llega
// después de un refund manual) nunca pisan un estado ya resuelto.
async function applyPaymentToOrder(
  payment: { id?: number | string; status?: string; payment_method_id?: string; external_reference?: string | null },
  eventDataId?: string | null,
): Promise<{ applied: boolean; status?: string; orderId?: number }> {
  const externalRef = payment.external_reference;
  if (!externalRef) return { applied: false };
  const newStatus = mapMpStatusToOrderStatus(payment.status);
  return applyGatewayResolution(externalRef, newStatus, {
    label: 'Mercado Pago',
    paymentId: payment.id != null ? String(payment.id) : null,
    gatewayStatus: payment.status ?? null,
    gatewayMethod: payment.payment_method_id ?? null,
  }, eventDataId);
}

/**
 * Núcleo compartido MP/PIX: aplica un estado ya resuelto a la orden, respetando la guarda
 * de estado terminal (updateOrderFromPayment) y disparando notificaciones solo en la
 * transición real a 'paid'. Los datos del gateway se guardan en las columnas mp_* (que
 * funcionan como columnas genéricas de "pago del gateway": para PIX, paymentId = uuid de
 * la orden Nautt, gatewayMethod = 'pix'). `label` solo se usa en logs/mensajes.
 */
async function applyGatewayResolution(
  publicId: string,
  newStatus: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded',
  gateway: { label: string; paymentId: string | null; gatewayStatus: string | null; gatewayMethod: string | null },
  eventDataId?: string | null,
): Promise<{ applied: boolean; status?: string; orderId?: number }> {
  const updated = await updateOrderFromPayment(publicId, {
    status: newStatus,
    mp_payment_id: gateway.paymentId,
    mp_payment_status: gateway.gatewayStatus,
    mp_payment_method: gateway.gatewayMethod,
    paid_at: newStatus === 'paid' ? new Date() : null,
  });

  if (!updated) {
    // No hay orden con este id — puede ser un checkout_hold del checkout público (MP/PIX)
    // todavía sin pago confirmado, en vez de una orden ya materializada.
    if (newStatus !== 'paid') {
      // Pago no aprobado (pending/failed/etc.) sobre un hold: nada que materializar
      // todavía — el hold sigue vivo hasta que venza o llegue una confirmación real.
      await logPaymentEvent(null, `hold_gateway_${newStatus}`, eventDataId ?? gateway.paymentId, {
        hold_id: publicId, status: gateway.gatewayStatus,
      }).catch(() => {});
      return { applied: false };
    }

    const materialized = await createOrderFromHold(publicId, {
      mp_payment_id: gateway.paymentId,
      mp_payment_status: gateway.gatewayStatus,
      mp_payment_method: gateway.gatewayMethod,
    });

    if (!materialized) {
      // Ni orden ni hold: el pago llegó cuando el hold ya se había purgado (o el id
      // nunca existió). Requiere reconciliación manual — mismo criterio que hoy tiene una
      // orden 'expired' con un pago tardío, ahora bastante menos frecuente (ver purgeStaleHolds).
      console.error(
        `[CRITICAL] Pago aprobado en ${gateway.label} para "${publicId}" (payment_id=${gateway.paymentId ?? '?'}) ` +
        `no tiene orden ni hold asociado (probablemente ya purgado). Requiere reconciliación manual.`,
      );
      await logPaymentEvent(null, 'webhook_paid_no_hold_or_order', eventDataId ?? gateway.paymentId, {
        hold_id: publicId, status: gateway.gatewayStatus,
      }).catch(() => {});
      return { applied: false };
    }

    await logPaymentEvent(materialized.id, 'hold_materialized', eventDataId ?? gateway.paymentId, {
      hold_id: publicId, payment_id: gateway.paymentId, status: gateway.gatewayStatus,
      hold_expired_before_payment: materialized.holdExpiredBeforePayment,
    });
    if (materialized.holdExpiredBeforePayment) {
      // El pago llegó después de que el cupo ya se había dado por liberado (pudo
      // revenderse). La orden se crea igual — el cliente sí pagó — pero queda marcada
      // para que el admin verifique el cupo real.
      console.error(
        `[CRITICAL] Pago aprobado en ${gateway.label} para la orden ${materialized.public_id} llegó después de que ` +
        `su cupo (hold) ya había vencido. Se creó igual (hold_expired_before_payment=true) — revisar cupo real.`,
      );
    }

    sendOrderPaidNotifications(materialized.id).catch((err) =>
      console.error('[email] sendOrderPaidNotifications failed for order', materialized.id, err),
    );
    createOrderPaidNotification(materialized.id).catch((err) =>
      console.error('[notif] createOrderPaidNotification failed for order', materialized.id, err),
    );
    notifyAdminsNewOrderPaid(materialized.id).catch((err) =>
      console.error('[notif] notifyAdminsNewOrderPaid failed for order', materialized.id, err),
    );
    return { applied: true, status: 'paid', orderId: materialized.id };
  }

  if (updated.status !== newStatus) {
    // La guarda ignoró el intento de revertir un estado terminal — queda registrado
    // para que sea visible en el histórico, pero no se toca nada más ni se notifica.
    await logPaymentEvent(updated.id, 'webhook_ignored_terminal_state', eventDataId ?? gateway.paymentId, {
      payment_id: gateway.paymentId, status: gateway.gatewayStatus, current_status: updated.status, attempted_status: newStatus,
    });
    if (updated.status === 'expired' && newStatus === 'paid') {
      // El cliente sí pagó, pero la reserva ya se dio por caducada (y su cupo pudo haberse
      // revendido) — no hay forma segura de confirmar sola. Requiere reconciliación manual:
      // chequear cupo real y decidir si se confirma o se reintegra.
      console.error(
        `[CRITICAL] Pago aprobado en ${gateway.label} para la orden ${publicId} (payment_id=${gateway.paymentId ?? '?'}) ` +
        `llegó después de que la reserva ya había caducado. Requiere reconciliación manual.`,
      );
    }
    return { applied: false, status: updated.status, orderId: updated.id };
  }

  // Solo se loguea en el histórico cuando el estado REALMENTE cambió — el gateway puede
  // reenviar la misma notificación varias veces (reintentos de webhook) y antes cada
  // una agregaba un evento idéntico al histórico de la orden, aunque no cambiara nada.
  if (updated.status !== updated.priorStatus) {
    await logPaymentEvent(updated.id, `order_${updated.status}`, eventDataId ?? gateway.paymentId, {
      payment_id: gateway.paymentId, status: gateway.gatewayStatus,
    });
    if (updated.status === 'refunded' || updated.status === 'cancelled') {
      // Un refund/cancelación disparado del lado del gateway (chargeback, refund manual, etc.
      // — no por nuestro botón admin) también cierra la reserva por completo: cancelamos
      // ampliaciones sin cobrar por la misma razón que en /refund.
      cancelPendingAddonsForOrder(updated.id).catch((err) =>
        console.error('[addons] cancelPendingAddonsForOrder failed for order', updated.id, err),
      );
    }
  }
  // Notificar solo en la transición a 'paid' (primera vez) → nunca duplica emails.
  if (updated.status === 'paid' && updated.priorStatus !== 'paid') {
    sendOrderPaidNotifications(updated.id).catch((err) =>
      console.error('[email] sendOrderPaidNotifications failed for order', updated.id, err),
    );
    createOrderPaidNotification(updated.id).catch((err) =>
      console.error('[notif] createOrderPaidNotification failed for order', updated.id, err),
    );
    notifyAdminsNewOrderPaid(updated.id).catch((err) =>
      console.error('[notif] notifyAdminsNewOrderPaid failed for order', updated.id, err),
    );
  }
  return { applied: true, status: updated.status, orderId: updated.id };
}

// Respaldo del webhook de Nautt: consulta el estado en vivo de la orden PIX y la sincroniza.
// Se usa desde el retorno del checkout, el webhook y el barrido de caducidad.
export async function syncOrderWithNautt(publicId: string): Promise<{ found: boolean; status?: string; blockedByTerminalState?: boolean }> {
  const order = await findOrderByPublicId(publicId);
  let nauttOrderUuid = order?.nautt_order_uuid ?? null;
  if (!nauttOrderUuid) {
    // Todavía no hay orden — puede ser un checkout_hold de PIX en curso.
    const hold = await findHoldById(publicId);
    nauttOrderUuid = hold?.nautt_order_uuid ?? null;
  }
  if (!nauttOrderUuid) return { found: false };
  const nauttOrder = await getNauttOrder(nauttOrderUuid);
  const newStatus = mapNauttStatusToOrderStatus(nauttOrder.status);
  const result = await applyGatewayResolution(publicId, newStatus, {
    label: 'PIX/Nautt',
    paymentId: nauttOrderUuid,
    gatewayStatus: nauttOrder.status,
    gatewayMethod: 'pix',
  }, nauttOrderUuid);
  const blockedByTerminalState = !result.applied && result.status != null;
  return { found: result.applied, status: result.status, blockedByTerminalState };
}

// Respaldo del webhook: consulta MP por la referencia (public_id) de la orden y la
// sincroniza. Se usa desde el retorno del checkout y desde el admin.
export async function syncOrderWithMp(publicId: string): Promise<{ found: boolean; status?: string; blockedByTerminalState?: boolean }> {
  const payment = await searchPaymentByExternalRef(publicId);
  if (!payment) return { found: false };
  const result = await applyPaymentToOrder({ ...payment, external_reference: publicId });
  // MP sí tiene un pago para esta orden, pero la guarda de estado terminal
  // (updateOrderFromPayment) bloqueó aplicarlo — ej. la orden ya está 'expired' y el pago
  // llegó tarde. Distinto de "MP no tiene ningún pago": acá el caller (admin/orders.ts)
  // necesita poder distinguirlo para no decirle al admin "no hay nada" cuando sí lo hay.
  const blockedByTerminalState = !result.applied && result.status != null;
  return { found: result.applied, status: result.status, blockedByTerminalState };
}

// Aplica el pago aprobado de un addon a su orden y notifica (solo en la primera aplicación).
async function applyAddonAndNotify(publicId: string, mpPaymentId: string | null): Promise<void> {
  const r = await applyAddonPayment(publicId, mpPaymentId);
  if (r.applied && !r.alreadyApplied && !r.closedOrder && r.orderId != null) {
    sendOrderIncreasedNotifications(r.orderId, r.chargeUsd ?? 0, r.chargeArs ?? 0).catch((e) =>
      console.error('[email] addon increase notification failed for order', r.orderId, e),
    );
  }
}

// Respaldo del webhook para addons: consulta MP por la ref del addon y lo aplica si está aprobado.
export async function syncAddonWithMp(publicId: string): Promise<{ found: boolean; status: string; hasPayment: boolean }> {
  const addon = await findAddonByPublicId(publicId);
  if (!addon) return { found: false, status: 'not_found', hasPayment: false };
  if (addon.status === 'paid') return { found: true, status: 'paid', hasPayment: true };
  const payment = await searchPaymentByExternalRef(publicId);
  if (!payment) return { found: true, status: addon.status, hasPayment: false };
  if (mapMpStatusToOrderStatus(payment.status) === 'paid') {
    await applyAddonAndNotify(publicId, payment.id != null ? String(payment.id) : null);
    return { found: true, status: 'paid', hasPayment: true };
  }
  return { found: true, status: addon.status, hasPayment: true };
}

// ─── POST /api/checkout/webhook ──────────────────────────
// MP envía notificaciones cuando cambia el estado de un pago.
// Firma: header x-signature con HMAC-SHA256(`id:${data.id};request-id:${x-request-id};ts:${ts}`, secret)
checkoutRouter.post('/webhook', webhookLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventType = (req.body?.type ?? req.query?.type) as string | undefined;
    const dataId = (req.body?.data?.id ?? req.query?.['data.id']) as string | undefined;

    // Verificación de firma solo si MP envía el header x-signature (nuevo formato webhook).
    // IPN legacy (topic=payment, sin x-signature) se acepta sin firma — MP todavía manda
    // notificaciones en ese formato en algunos casos. Igual queda registrado quién llegó
    // sin firmar (webhook_unsigned abajo) para poder notar si se está abusando de esto;
    // la defensa real contra datos falsos es que el pago se re-consulta siempre a la API
    // de MP por su id, nunca se confía en el body de la request.
    const signatureHeader = req.header('x-signature');
    if (signatureHeader && config.MP_WEBHOOK_SECRET) {
      const requestId = req.header('x-request-id') ?? '';
      const isValid = verifyMpSignature(signatureHeader, requestId, dataId ?? '', config.MP_WEBHOOK_SECRET);
      if (!isValid) {
        await logPaymentEvent(null, 'webhook_invalid_signature', dataId ?? null, req.body);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (config.MP_WEBHOOK_SECRET) {
      await logPaymentEvent(null, 'webhook_unsigned', dataId ?? null, { eventType });
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

    // ¿La referencia es un ADDON (ampliación) o una orden normal?
    const addon = await findAddonByPublicId(externalRef);
    if (addon) {
      await logPaymentEvent(addon.order_id, `addon_webhook_${payment.status ?? 'unknown'}`, dataId, {
        addon_public_id: externalRef,
      });
      if (mapMpStatusToOrderStatus(payment.status) === 'paid') {
        await applyAddonAndNotify(externalRef, payment.id != null ? String(payment.id) : null);
      }
      return res.status(200).json({ received: true, addon: true });
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

// ─── POST /api/checkout/nautt-webhook ─────────────────────
// Nautt notifica cambios de estado de la orden PIX. El body no viene firmado: lo
// autenticamos con un token compartido (query ?token= o header x-webhook-token) que se
// configura al registrar la URL en el panel de Nautt. La defensa real contra datos falsos
// es que NUNCA confiamos en el body: re-consultamos el estado a Nautt por el uuid.
checkoutRouter.post('/nautt-webhook', webhookLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Autenticación: aceptamos si la FIRMA (Standard Webhooks/Svix) es válida O si el TOKEN
    // coincide. Así funciona tanto si Nautt firma el webhook como si registrás la URL con
    // ?token=. Igual, la defensa real es que el estado se re-consulta a Nautt por el uuid.
    const secret = config.NAUTT_WEBHOOK_SECRET;
    const expectedToken = config.NAUTT_WEBHOOK_TOKEN;
    const token = req.header('x-webhook-token') ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signatureOk = secret ? verifyStandardWebhookSignature(req, rawBody, secret) : false;
    const tokenOk = expectedToken != null && token === expectedToken;
    if ((secret || expectedToken) && !signatureOk && !tokenOk) {
      await logPaymentEvent(null, 'nautt_webhook_unauthenticated', null, {
        event: req.body?.event, had_signature: !!req.header('webhook-signature'),
      }).catch(() => {});
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const event = req.body?.event as string | undefined;
    const nauttOrderUuid = req.body?.data?.uuid as string | undefined;
    await logPaymentEvent(null, `nautt_webhook_${event ?? 'unknown'}`, nauttOrderUuid ?? null, req.body);
    if (!nauttOrderUuid) return res.status(200).json({ received: true });

    // Busca primero en orders (ya materializada) y si no, en checkout_holds — un webhook
    // que llega mientras la referencia todavía es un hold no debe descartarse.
    const ref = await findHoldOrOrderRefByNauttOrderUuid(nauttOrderUuid);
    if (!ref) {
      await logPaymentEvent(null, 'nautt_webhook_no_match', nauttOrderUuid, {});
      return res.status(200).json({ received: true, note: 'no matching order or hold' });
    }
    // syncOrderWithNautt re-consulta el estado real a Nautt y lo aplica (idempotente).
    await syncOrderWithNautt(ref.publicId);
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
    if (!order) {
      // Puede ser una ampliación (addon) con su propio link de pago.
      const addon = await findAddonByPublicId(publicId);
      if (addon) {
        return res.json({
          data: {
            public_id: publicId,
            status: addon.status === 'paid' ? 'paid' : 'pending',
            total_usd: addon.charge_usd,
            total_ars: addon.charge_ars,
            customer_email: addon.customer_email,
            customer_name: addon.customer_name,
            payment_method: 'mercadopago',
            is_addon: true,
          },
        });
      }

      // Todavía no hay orden — puede ser un checkout_hold (checkout público de MP/PIX en
      // curso). Devolvemos el mismo shape que una orden 'pending' para que la pantalla de
      // "esperando pago" siga funcionando sin cambios, con el vencimiento real del hold.
      const hold = await findHoldById(publicId);
      if (hold) {
        return res.json({
          data: {
            public_id: publicId,
            status: 'pending',
            is_hold: true,
            hold_expires_at: hold.expires_at,
            total_usd: hold.payload.total_usd,
            total_ars: hold.payload.total_ars,
            customer_email: hold.payload.customer.email,
            customer_name: hold.payload.customer.name,
            payment_method: hold.payment_method,
            pix_qrcode: hold.pix_qrcode,
            pix_expires_at: hold.expires_at,
            pix_fiat_amount_brl: hold.pix_fiat_amount_brl,
          },
        });
      }
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({
      data: {
        public_id: publicId,
        status: order.status,
        total_usd: order.total_usd,
        total_ars: order.total_ars,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        payment_method: order.payment_method,
        // Datos del cobro PIX (solo presentes en órdenes de PIX) para la página de pago.
        pix_qrcode: order.pix_qrcode,
        pix_expires_at: order.pix_expires_at,
        pix_fiat_amount_brl: order.pix_fiat_amount_brl,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/checkout/orders/:publicId/verify ────────────
// Estado EN VIVO de una reserva, para la página pública que abre el QR del voucher.
// Público (capability URL, mismo modelo que el voucher) — sin importar qué email o
// PDF viejo muestre el pasajero, esto siempre refleja la composición actual.
checkoutRouter.get('/orders/:publicId/verify', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const info = await getOrderVerificationInfo(publicId);
    if (!info) return res.status(404).json({ error: 'Not found' });
    res.json({ data: info });
  } catch (err) { next(err); }
});

// ─── GET /api/checkout/orders/:publicId/voucher.pdf ───────
// Voucher descargable para presentar en la casa de tango sin depender de internet
// en el momento. Público (capability URL por public_id, mismo modelo que el resto
// de los links de la orden) — solo disponible una vez que la orden está pagada.
checkoutRouter.get('/orders/:publicId/voucher.pdf', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });
    const order = await findOrderByPublicId(publicId);
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.status !== 'paid') {
      return res.status(409).json({ error: 'El voucher solo está disponible una vez confirmado el pago.' });
    }
    const pdf = await generateVoucherPdf(order.id);
    if (!pdf) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="voucher-${publicId.slice(0, 8)}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// ─── POST /api/checkout/orders/:publicId/sync ─────────────
// Respaldo del webhook: la pantalla de retorno lo llama para confirmar el pago
// consultando MP directamente (por si el webhook no llegó). Idempotente.
checkoutRouter.post('/orders/:publicId/sync', async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!/^[0-9a-f-]{8,40}$/i.test(publicId)) return res.status(400).json({ error: 'Invalid id' });

    const order = await findOrderByPublicId(publicId);
    if (!order) {
      // ¿Es una ampliación (addon)? Sincronizamos su pago aparte.
      const addon = await findAddonByPublicId(publicId);
      if (addon) {
        if (addon.status === 'paid') return res.json({ data: { status: 'paid', synced: false, is_addon: true } });
        const r = await syncAddonWithMp(publicId);
        return res.json({ data: { status: r.status, synced: true, is_addon: true } });
      }

      // Todavía no hay orden — puede ser un checkout_hold. Sincronizamos contra el
      // gateway correspondiente: si el pago ya estaba aprobado, esto materializa la
      // orden en el momento (mismo camino que usa el webhook).
      const hold = await findHoldById(publicId);
      if (!hold) return res.status(404).json({ error: 'Not found' });
      try {
        if (hold.payment_method === 'pix') await syncOrderWithNautt(publicId);
        else await syncOrderWithMp(publicId);
      } catch { /* dejamos el hold como está, se reintenta en el próximo poll/sweep */ }
      const maybeOrder = await findOrderByPublicId(publicId);
      return res.json({ data: { status: maybeOrder?.status ?? 'pending', synced: true } });
    }

    // Ya confirmada con payment_id → no hace falta consultar el gateway.
    if (order.status === 'paid' && order.mp_payment_id) {
      return res.json({ data: { status: 'paid', synced: false } });
    }
    // PIX (Nautt): consultamos la orden Nautt por su uuid.
    if (order.payment_method === 'pix') {
      try { await syncOrderWithNautt(publicId); } catch { /* dejamos el estado actual */ }
      const fresh = await findOrderByPublicId(publicId);
      return res.json({ data: { status: fresh?.status ?? order.status, synced: true } });
    }
    // El efectivo no pasa por ningún gateway.
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

// Verificación de firma de webhook estándar (Svix / "Standard Webhooks"), que es lo que usa
// Nautt (secreto con prefijo whsec_). Headers: webhook-id, webhook-timestamp, webhook-signature.
// Firma esperada = base64(HMAC_SHA256(secretBytes, bytes(`${id}.${ts}.` + rawBody))). El header
// trae una o más firmas separadas por espacio, cada una como "v1,<firma>". Tolerancia ±5 min
// contra replays. Devuelve false ante cualquier header faltante o inválido (nunca tira).
function verifyStandardWebhookSignature(req: Request, rawBody: Buffer | undefined, secret: string): boolean {
  try {
    const id = req.header('webhook-id');
    const ts = req.header('webhook-timestamp');
    const sigHeader = req.header('webhook-signature');
    if (!id || !ts || !sigHeader || !rawBody) return false;
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;
    // El secreto viene como (nautt_)?whsec_<base64>. La parte base64 son los bytes de la clave.
    const secretBytes = Buffer.from(secret.replace(/^(nautt_)?whsec_/, ''), 'base64');
    const signed = Buffer.concat([Buffer.from(`${id}.${ts}.`), rawBody]);
    const expected = crypto.createHmac('sha256', secretBytes).update(signed).digest('base64');
    const expectedBuf = Buffer.from(expected);
    for (const part of sigHeader.split(' ')) {
      const sig = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part;
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

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
