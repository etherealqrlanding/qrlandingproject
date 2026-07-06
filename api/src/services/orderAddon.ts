import { pool } from '../db.js';
import { config } from '../config.js';
import { createPreference } from './mercadopago.js';
import { computeOrderIncrease, type OrderIncreaseSnapshot } from './orderIncrease.js';
import { createOrderAddon, setAddonPreferenceId } from '../repos/addons.js';

export type AddonLinkResult =
  | {
      ok: true;
      data: {
        addon_public_id: string;
        order_public_id: string;
        init_point: string;
        sandbox_init_point: string;
        charge_usd: number;
        charge_ars: number;
        new_total_usd: number;
      };
    }
  | { ok: false; httpStatus: number; error: string };

/**
 * Genera un "addon" (agregado) con su propio link de Mercado Pago por la DIFERENCIA de
 * sumar pasajeros a una reserva ya pagada por MP. Reserva el cupo del pax extra. El link
 * es para que lo pague el PASAJERO; al aprobarse, el webhook fusiona el addon en la orden.
 * Puede lanzar AvailabilityError (→ 409) si no hay cupo para el pax extra.
 */
export async function createAddonForOrder(params: {
  orderPublicId: string;
  adults: number;
  children: number;
  restrictSellerId?: number;
}): Promise<AddonLinkResult> {
  const { rows } = await pool.query<{
    order_id: number; status: string; payment_method: string;
    exchange_rate_used: number;
    customer_name: string; customer_email: string; customer_phone: string | null;
    item_id: number; option_id: number; service_date: string;
    default_capacity_per_day: number;
    option_name: string; product_slug: string; product_name: string;
    adults: number; children: number;
    unit_price_adult_usd: number; unit_price_child_usd: number | null;
    subtotal_usd: number; transfer_requested: boolean;
    seller_id: number | null; seller_code: string | null;
  }>(
    `SELECT o.id AS order_id, o.status::text AS status, o.payment_method,
            o.exchange_rate_used::float AS exchange_rate_used,
            o.customer_name, o.customer_email, o.customer_phone,
            oi.id AS item_id, oi.option_id,
            to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
            po.default_capacity_per_day, po.name_es AS option_name,
            p.slug AS product_slug, p.name AS product_name,
            oi.adults, oi.children,
            oi.unit_price_adult_usd::float AS unit_price_adult_usd,
            oi.unit_price_child_usd::float AS unit_price_child_usd,
            oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested,
            a.seller_id, s.code AS seller_code
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN product_options po ON po.id = oi.option_id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN order_attributions a ON a.order_id = o.id
       LEFT JOIN sellers s ON s.id = a.seller_id
      WHERE o.public_id = $1
      ORDER BY oi.id
      LIMIT 1`,
    [params.orderPublicId],
  );
  const row = rows[0];
  if (!row) return { ok: false, httpStatus: 404, error: 'Reserva no encontrada' };
  if (params.restrictSellerId != null && row.seller_id !== params.restrictSellerId) {
    return { ok: false, httpStatus: 404, error: 'Reserva no encontrada' };
  }
  if (row.payment_method !== 'mercadopago') {
    return { ok: false, httpStatus: 400, error: 'Esta vía es solo para reservas de Mercado Pago. En efectivo se cobra en el momento.' };
  }
  if (row.status !== 'paid') {
    return { ok: false, httpStatus: 400, error: `Solo se pueden ampliar reservas pagadas. Estado actual: ${row.status}` };
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
  const calc = computeOrderIncrease(snap, { adults: params.adults, children: params.children });
  if (!calc.ok) return { ok: false, httpStatus: 400, error: calc.error ?? 'No se puede ampliar' };

  // Reserva de cupo + creación del addon pendiente (puede lanzar AvailabilityError → 409).
  const addon = await createOrderAddon({
    orderId: row.order_id,
    optionId: row.option_id,
    serviceDate: row.service_date,
    defaultCapacityPerDay: row.default_capacity_per_day,
    extraAdults: calc.extraAdults,
    extraChildren: calc.extraChildren,
    chargeUsd: calc.chargeUsd,
    chargeArs: calc.chargeArs,
    newSubtotalUsd: calc.newSubtotalUsd,
    newTotalArs: calc.newTotalArs,
    exchangeRateUsed: row.exchange_rate_used,
  });

  // Link de MP por la DIFERENCIA (charge_ars). external_reference = public_id del addon,
  // así el webhook lo reconoce y lo aplica a la orden correcta.
  const pref = await createPreference({
    orderPublicId: addon.public_id,
    title: `Ampliación (${calc.extraAdults + calc.extraChildren} pax) — ${row.option_name}`,
    totalArs: calc.chargeArs,
    quantityAdults: Math.max(1, calc.extraAdults),
    quantityChildren: calc.extraChildren,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone ?? undefined,
    },
    metadata: {
      order_id: row.order_id,
      seller_ref: row.seller_code,
      option_id: row.option_id,
      product_slug: row.product_slug,
      service_date: row.service_date,
    },
    webOrigin: config.WEB_ORIGIN,
  });

  await setAddonPreferenceId(addon.id, pref.id);

  return {
    ok: true,
    data: {
      addon_public_id: addon.public_id,
      order_public_id: params.orderPublicId,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
      charge_usd: calc.chargeUsd,
      charge_ars: calc.chargeArs,
      new_total_usd: calc.newSubtotalUsd,
    },
  };
}
