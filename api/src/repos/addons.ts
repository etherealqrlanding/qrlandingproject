import { pool } from '../db.js';
import { checkAvailabilityTxLocked } from './availability.js';
import { computeOrderIncrease, type OrderIncreaseSnapshot } from '../services/orderIncrease.js';

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
         charge_usd, charge_ars, new_subtotal_usd, new_total_ars, exchange_rate_used
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, public_id`,
      [
        input.orderId, input.optionId, input.serviceDate, input.extraAdults, input.extraChildren,
        input.chargeUsd, input.chargeArs, input.newSubtotalUsd, input.newTotalArs, input.exchangeRateUsed,
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

export async function setAddonPreferenceId(addonId: number, preferenceId: string): Promise<void> {
  await pool.query(`UPDATE order_addons SET mp_preference_id = $1 WHERE id = $2`, [preferenceId, addonId]);
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
export async function applyAddonPayment(publicId: string, mpPaymentId: string | null): Promise<ApplyAddonResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: addonRows } = await client.query<{
      id: number; order_id: number; status: string;
      extra_adults: number; extra_children: number;
      charge_usd: number; charge_ars: number;
    }>(
      `SELECT id, order_id, status, extra_adults, extra_children,
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

    // Estado ACTUAL de la orden (por si cambió desde que se generó el link)
    const { rows: orderRows } = await client.query<{
      order_id: number; exchange_rate_used: number;
      item_id: number; adults: number; children: number;
      unit_price_adult_usd: number; unit_price_child_usd: number | null;
      subtotal_usd: number; transfer_requested: boolean;
      commission_percent: number | null;
    }>(
      `SELECT o.id AS order_id, o.exchange_rate_used::float AS exchange_rate_used,
              oi.id AS item_id, oi.adults, oi.children,
              oi.unit_price_adult_usd::float AS unit_price_adult_usd,
              oi.unit_price_child_usd::float AS unit_price_child_usd,
              oi.subtotal_usd::float AS subtotal_usd, oi.transfer_requested,
              a.commission_percent_snapshot::float AS commission_percent
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN order_attributions a ON a.order_id = o.id
        WHERE o.id = $1
        ORDER BY oi.id
        LIMIT 1`,
      [addon.order_id],
    );
    const cur = orderRows[0];
    if (!cur) { await client.query('ROLLBACK'); return { applied: false }; }

    const snap: OrderIncreaseSnapshot = {
      origAdults: cur.adults,
      origChildren: cur.children,
      unitPriceAdultUsd: cur.unit_price_adult_usd,
      unitPriceChildUsd: cur.unit_price_child_usd,
      subtotalUsd: cur.subtotal_usd,
      transferRequested: cur.transfer_requested,
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
    if (cur.commission_percent != null) {
      const newCommissionUsd = round2(calc.newSubtotalUsd * cur.commission_percent / 100);
      const newCommissionArs = round2(newCommissionUsd * cur.exchange_rate_used);
      await client.query(
        `UPDATE order_attributions SET commission_amount_usd = $1, commission_amount_ars = $2 WHERE order_id = $3`,
        [newCommissionUsd, newCommissionArs, addon.order_id],
      );
    }
    await client.query(
      `UPDATE order_addons SET status = 'paid', mp_payment_id = $1, paid_at = NOW() WHERE id = $2`,
      [mpPaymentId, addon.id],
    );
    await client.query(
      `INSERT INTO payment_events (order_id, event_type, mp_resource_id, payload)
       VALUES ($1, 'addon_paid', $2, $3::jsonb)`,
      [addon.order_id, mpPaymentId, JSON.stringify({
        addon_id: addon.id, new_adults: newAdults, new_children: newChildren,
        charge_usd: addon.charge_usd, charge_ars: addon.charge_ars,
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

/** Addons pendientes con más de `hours` horas (para el barrido de caducidad). */
export async function listStalePendingAddons(hours: number): Promise<Array<{ id: number; public_id: string; order_id: number }>> {
  const { rows } = await pool.query<{ id: number; public_id: string; order_id: number }>(
    `SELECT id, public_id, order_id FROM order_addons
      WHERE status = 'pending' AND mp_payment_id IS NULL
        AND created_at < NOW() - make_interval(hours => $1)`,
    [hours],
  );
  return rows;
}

export async function expireAddon(id: number): Promise<void> {
  await pool.query(`UPDATE order_addons SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [id]);
}
