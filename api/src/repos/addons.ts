import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { checkAvailabilityTxLocked } from './availability.js';
import { computeOrderIncrease, type OrderIncreaseSnapshot } from '../services/orderIncrease.js';
import { recomputeCashCommission } from '../services/orderCommission.js';

// Objeto con .query — sirve tanto para el pool como para un client dentro de una transacción.
type Queryable = Pick<PoolClient, 'query'>;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface CreateAddonInput {
  orderId: number;
  optionId: number;
  serviceDate: string;
  defaultCapacityPerDay: number;
  extraAdults: number;
  extraChildren: number;
  chargeUsd: number;
  chargeArs: number;
  newSubtotalUsd: number;
  newTotalArs: number;
  exchangeRateUsed: number;
  paymentMethod: 'mercadopago' | 'cash';
}

export interface CreatedAddon {
  id: number;
  public_id: string;
}

/**
 * Crea un addon PENDIENTE reservando el cupo del pax extra. Toma el advisory lock de la
 * fecha y verifica disponibilidad (que ya cuenta addons pendientes) → si no hay lugar,
 * lanza AvailabilityError (→ 409). El addon queda 'pending' hasta que se pague o caduque.
 */
export async function createOrderAddon(input: CreateAddonInput): Promise<CreatedAddon> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await checkAvailabilityTxLocked(
      client, input.optionId, input.defaultCapacityPerDay, input.serviceDate,
      input.extraAdults + input.extraChildren,
    );

    const { rows } = await client.query<{ id: number; public_id: string }>(
      `INSERT INTO order_addons (
         order_id, option_id, service_date, extra_adults, extra_children,
         charge_usd, charge_ars, new_subtotal_usd, new_total_ars, exchange_rate_used,
         payment_method
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, public_id`,
      [
        input.orderId, input.optionId, input.serviceDate, input.extraAdults, input.extraChildren,
        input.chargeUsd, input.chargeArs, input.newSubtotalUsd, input.newTotalArs, input.exchangeRateUsed,
        input.paymentMethod,
      ],
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setAddonPreferenceId(addonId: number, preferenceId: string, initPoint?: string): Promise<void> {
  await pool.query(
    `UPDATE order_addons SET mp_preference_id = $1, mp_init_point = COALESCE($2, mp_init_point) WHERE id = $3`,
    [preferenceId, initPoint ?? null, addonId],
  );
}

export interface AddonLookup {
  id: number;
  public_id: string;
  order_id: number;
  order_public_id: string;
  status: string;
  charge_usd: number;
  charge_ars: number;
  customer_name: string;
  customer_email: string;
}

export async function findAddonByPublicId(publicId: string): Promise<AddonLookup | null> {
  const { rows } = await pool.query(
    `SELECT ad.id, ad.public_id, ad.order_id, o.public_id AS order_public_id,
            ad.status, ad.charge_usd::float AS charge_usd, ad.charge_ars::float AS charge_ars,
            o.customer_name, o.customer_email
       FROM order_addons ad
       JOIN orders o ON o.id = ad.order_id
      WHERE ad.public_id = $1
      LIMIT 1`,
    [publicId],
  );
  return rows[0] ?? null;
}

export interface ApplyAddonResult {
  applied: boolean;
  alreadyApplied?: boolean;
  // El pago se cobró y el addon quedó 'paid', pero la orden principal ya estaba
  // refunded/cancelled — no se fusionó pax ni se debe notificar al pasajero como si su
  // reserva hubiera aumentado. Requiere reconciliación manual (ver payment_events).
  closedOrder?: boolean;
  orderId?: number;
  chargeUsd?: number;
  chargeArs?: number;
}

/**
 * Aplica el pago de un addon: fusiona el pax extra en la orden (sube pax/total, recalcula
 * comisión) y marca el addon 'paid'. Idempotente: si el addon ya no está 'pending', no
 * vuelve a aplicar. NO re-chequea cupo (ya estaba reservado por el addon pendiente); al
 * marcarlo 'paid' y subir order_items en la misma transacción, el cupo total no cambia.
 */
export async function applyAddonPayment(
  publicId: string,
  mpPaymentId: string | null,
  // Solo lo manda el portal de vendedores (cobro en efectivo con PIN) — el webhook
  // de MP y el admin panel no tienen a quién nombrar acá, siguen sin pasar nada.
  actorMember?: { id: number; name: string } | null,
): Promise<ApplyAddonResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: addonRows } = await client.query<{
      id: number; order_id: number; status: string; payment_method: string;
      extra_adults: number; extra_children: number;
      charge_usd: number; charge_ars: number;
    }>(
      `SELECT id, order_id, status, payment_method, extra_adults, extra_children,
              charge_usd::float AS charge_usd, charge_ars::float AS charge_ars
         FROM order_addons WHERE public_id = $1 FOR UPDATE`,
      [publicId],
    );
    const addon = addonRows[0];
    if (!addon) { await client.query('ROLLBACK'); return { applied: false }; }
    if (addon.status === 'paid') {
      await client.query('ROLLBACK');
      return { applied: true, alreadyApplied: true, orderId: addon.order_id };
    }
    if (addon.status !== 'pending') {
      // 'expired' o 'cancelled': el link ya no aplica. Se resuelve manualmente.
      await client.query('ROLLBACK');
      return { applied: false };
    }

    // Estado ACTUAL de la orden (por si cambió desde que se generó el link). FOR UPDATE OF o
    // toma el mismo lock de fila que updateOrderFromPayment (el webhook de pago de la orden
    // principal) — así, si un refund/cancelación de la orden está corriendo en paralelo
    // (ej. llegó casi al mismo tiempo que este pago de ampliación), una de las dos
    // transacciones espera a la otra en vez de correr con datos ya obsoletos: quien llegue
    // segundo ve el estado ya committeado, no el de antes.
    const { rows: orderRows } = await client.query<{
      order_id: number; status: string; exchange_rate_used: number; commission_exchange_rate_used: number; payment_method: string;
      item_id: number; adults: number; children: number;
      unit_price_adult_usd: number; unit_price_child_usd: number | null;
      subtotal_usd: number; transfer_qty: number;
      commission_percent: number | null; seller_id: number | null; net_total_usd: number | null;
    }>(
      `SELECT o.id AS order_id, o.status::text AS status,
              o.exchange_rate_used::float AS exchange_rate_used,
              COALESCE(o.commission_exchange_rate_used, o.exchange_rate_used)::float AS commission_exchange_rate_used,
              o.payment_method,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_qty,
              a.commission_percent_snapshot::float AS commission_percent,
              a.seller_id, a.net_total_usd_snapshot::float AS net_total_usd
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN order_attributions a ON a.order_id = o.id
        WHERE o.id = $1
        ORDER BY oi.id
        LIMIT 1
        FOR UPDATE OF o`,
      [addon.order_id],
    );
    const cur = orderRows[0];
    if (!cur) { await client.query('ROLLBACK'); return { applied: false }; }
    if (cur.status === 'refunded' || cur.status === 'cancelled') {
      // La orden se cerró (reintegro/cancelación) mientras este pago de ampliación estaba
      // en tránsito — no fusionamos pax a una reserva que ya no existe. El dinero cobrado
      // por MP queda registrado para reconciliar manualmente (mismo criterio que el
      // "[CRITICAL]" de checkout.ts para un pago principal tardío sobre orden cerrada).
      await client.query(
        `UPDATE order_addons SET status = 'paid', mp_payment_id = $1, paid_at = NOW() WHERE id = $2`,
        [mpPaymentId, addon.id],
      );
      await client.query(
        `INSERT INTO payment_events (order_id, event_type, payload)
         VALUES ($1, 'addon_paid_after_order_closed', $2::jsonb)`,
        [addon.order_id, JSON.stringify({ addon_id: addon.id, order_status: cur.status })],
      );
      await client.query('COMMIT');
      console.error(
        `[CRITICAL] Pago de ampliación aprobado para la orden ${addon.order_id} (addon=${addon.id}) ` +
        `pero la orden ya estaba "${cur.status}". Requiere reconciliación manual.`,
      );
      return { applied: true, closedOrder: true, orderId: addon.order_id, chargeUsd: addon.charge_usd, chargeArs: addon.charge_ars };
    }

    const snap: OrderIncreaseSnapshot = {
      origAdults: cur.adults,
      origChildren: cur.children,
      unitPriceAdultUsd: cur.unit_price_adult_usd,
      unitPriceChildUsd: cur.unit_price_child_usd,
      subtotalUsd: cur.subtotal_usd,
      transferQty: cur.transfer_qty,
      exchangeRateUsed: cur.exchange_rate_used,
    };
    const newAdults = cur.adults + addon.extra_adults;
    const newChildren = cur.children + addon.extra_children;
    const calc = computeOrderIncrease(snap, { adults: newAdults, children: newChildren });
    if (!calc.ok) {
      // La orden cambió de forma incompatible: no fusionamos automáticamente. Marcamos
      // el addon 'paid' (el cobro se hizo) y dejamos rastro para revisión manual.
      await client.query(
        `UPDATE order_addons SET status = 'paid', mp_payment_id = $1, paid_at = NOW() WHERE id = $2`,
        [mpPaymentId, addon.id],
      );
      await client.query(
        `INSERT INTO payment_events (order_id, event_type, payload)
         VALUES ($1, 'addon_apply_mismatch', $2::jsonb)`,
        [addon.order_id, JSON.stringify({ addon_id: addon.id, error: calc.error })],
      );
      await client.query('COMMIT');
      return { applied: true, orderId: addon.order_id, chargeUsd: addon.charge_usd, chargeArs: addon.charge_ars };
    }

    await client.query(
      `UPDATE order_items SET adults = $1, children = $2, subtotal_usd = $3 WHERE id = $4`,
      [newAdults, newChildren, calc.newSubtotalUsd, cur.item_id],
    );
    await client.query(
      `UPDATE orders SET total_usd = $1, total_ars = $2, updated_at = NOW() WHERE id = $3`,
      [calc.newSubtotalUsd, calc.newTotalArs, addon.order_id],
    );
    // Recalcular comisión según el medio de pago de la orden.
    if (cur.seller_id != null) {
      let newCommissionUsd: number;
      let newNetTotalUsd: number | null = null;
      if (cur.payment_method === 'cash') {
        const cash = recomputeCashCommission(cur.net_total_usd, cur.subtotal_usd, calc.newSubtotalUsd);
        newCommissionUsd = cash.newCommissionUsd;
        newNetTotalUsd = cash.newNetTotalUsd;
      } else {
        newCommissionUsd = round2(calc.newSubtotalUsd * (cur.commission_percent ?? 0) / 100);
      }
      const newCommissionArs = round2(newCommissionUsd * cur.commission_exchange_rate_used);
      await client.query(
        `UPDATE order_attributions
            SET commission_amount_usd = $1, commission_amount_ars = $2,
                net_total_usd_snapshot = COALESCE($3, net_total_usd_snapshot)
          WHERE order_id = $4`,
        [newCommissionUsd, newCommissionArs, newNetTotalUsd, addon.order_id],
      );
    }
    // Efectivo cobrado (cash_collected_at) o pago MP.
    const isCash = addon.payment_method === 'cash';
    await client.query(
      `UPDATE order_addons SET status = 'paid', mp_payment_id = $1, paid_at = NOW() WHERE id = $2`,
      [mpPaymentId, addon.id],
    );
    await client.query(
      `INSERT INTO payment_events (order_id, event_type, mp_resource_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [addon.order_id, isCash ? 'addon_cash_collected' : 'addon_paid', mpPaymentId, JSON.stringify({
        addon_id: addon.id,
        extra_adults: addon.extra_adults, extra_children: addon.extra_children,
        new_adults: newAdults, new_children: newChildren,
        charge_usd: addon.charge_usd, charge_ars: addon.charge_ars,
        ...(actorMember ? { seller_member_id: actorMember.id, seller_member_name: actorMember.name } : {}),
      })],
    );

    await client.query('COMMIT');
    return { applied: true, orderId: addon.order_id, chargeUsd: addon.charge_usd, chargeArs: addon.charge_ars };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface PendingAddon {
  public_id: string;
  payment_method: string;
  extra_adults: number;
  extra_children: number;
  charge_usd: number;
  charge_ars: number;
  mp_init_point: string | null;
  created_at: string;
}

/** Addons PENDIENTES de una orden (por public_id de la orden), para surface + cobro/cancelación. */
export async function listPendingAddonsByOrderPublicId(orderPublicId: string, sellerId?: number): Promise<PendingAddon[]> {
  const params: unknown[] = [orderPublicId];
  let sellerJoin = '';
  if (sellerId != null) {
    params.push(sellerId);
    sellerJoin = `JOIN order_attributions a ON a.order_id = o.id AND a.seller_id = $2`;
  }
  const { rows } = await pool.query<PendingAddon>(
    `SELECT ad.public_id, ad.payment_method, ad.extra_adults, ad.extra_children,
            ad.charge_usd::float AS charge_usd, ad.charge_ars::float AS charge_ars,
            ad.mp_init_point, ad.created_at
       FROM order_addons ad
       JOIN orders o ON o.id = ad.order_id
       ${sellerJoin}
      WHERE o.public_id = $1 AND ad.status = 'pending'
      ORDER BY ad.created_at DESC`,
    params,
  );
  return rows;
}

/** Datos mínimos de un addon para validar cobro/cancelación (con ownership del vendedor). */
export async function getAddonForAction(publicId: string): Promise<{
  order_id: number; seller_id: number | null; payment_method: string; status: string;
} | null> {
  const { rows } = await pool.query(
    `SELECT ad.order_id, ad.payment_method, ad.status, a.seller_id
       FROM order_addons ad
       LEFT JOIN order_attributions a ON a.order_id = ad.order_id
      WHERE ad.public_id = $1 LIMIT 1`,
    [publicId],
  );
  return rows[0] ?? null;
}

/** Cancela un addon pendiente (libera el cupo). Devuelve order_id si lo canceló. */
export async function cancelAddon(publicId: string): Promise<number | null> {
  const { rows } = await pool.query<{ order_id: number }>(
    `UPDATE order_addons SET status = 'cancelled'
      WHERE public_id = $1 AND status = 'pending'
      RETURNING order_id`,
    [publicId],
  );
  return rows[0]?.order_id ?? null;
}

/** Addons de MERCADO PAGO pendientes con más de `hours` horas (barrido de caducidad). */
export async function listStalePendingAddons(hours: number): Promise<Array<{ id: number; public_id: string; order_id: number }>> {
  const { rows } = await pool.query<{ id: number; public_id: string; order_id: number }>(
    `SELECT id, public_id, order_id FROM order_addons
      WHERE status = 'pending' AND payment_method = 'mercadopago' AND mp_payment_id IS NULL
        AND created_at < NOW() - make_interval(hours => $1)`,
    [hours],
  );
  return rows;
}

/** Ampliaciones en EFECTIVO no cobradas con más de `hours` horas → caducan y liberan cupo. */
export async function expireStaleCashAddons(hours: number): Promise<Array<{ id: number; order_id: number }>> {
  const { rows } = await pool.query<{ id: number; order_id: number }>(
    `UPDATE order_addons SET status = 'expired'
      WHERE status = 'pending' AND payment_method = 'cash'
        AND created_at < NOW() - make_interval(hours => $1)
      RETURNING id, order_id`,
    [hours],
  );
  return rows;
}

export async function expireAddon(id: number): Promise<void> {
  await pool.query(`UPDATE order_addons SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [id]);
}

/**
 * Cancela todos los addons PENDIENTES de una orden — se llama al reintegrar (total) o
 * cancelar la orden completa, para que un link de pago de una ampliación no cobrada no
 * quede huérfano cobrándose días después sobre una reserva que ya no existe. Acepta un
 * client opcional para correr dentro de la misma transacción que el refund/cancel.
 * Devuelve cuántos addons canceló.
 */
export async function cancelPendingAddonsForOrder(orderId: number, db: Queryable = pool): Promise<number> {
  const { rows } = await db.query(
    `UPDATE order_addons SET status = 'cancelled'
      WHERE order_id = $1 AND status = 'pending'
      RETURNING id`,
    [orderId],
  );
  return rows.length;
}
