import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { checkAvailabilityTxLocked } from './availability.js';
import { getArchiveRetentionDays } from '../services/settings.js';

export interface CreateOrderInput {
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    nationality?: string | null;
    dni?: string | null;
  };
  item: {
    product_id: number;
    option_id: number;
    product_name_snapshot: string;
    option_name_snapshot: string;
    service_date: string;          // ISO yyyy-mm-dd
    adults: number;
    children: number;
    unit_price_adult_usd: number;
    unit_price_child_usd: number | null;
    subtotal_usd: number;
    transfer_qty?: number;
    transfer_hotel?: string | null;
    transfer_room?: string | null;
    // Net prices snapshot (optional: only set when option has them configured)
    net_total_usd?: number | null;
  };
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  ref_code: string | null;
  payment_method?: 'mercadopago' | 'cash' | 'pix';
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
  // Capacidad efectiva de la opción para el día: se usa para el chequeo autoritativo
  // de cupo (con lock) dentro de la transacción, evitando sobreventa por concurrencia.
  default_capacity_per_day: number;
  // Sub-vendedor (ej. conserje) que cerró la venta dentro de la cuenta del vendedor —
  // solo viene del checkout del portal de vendedores, nunca del checkout público.
  seller_member_id?: number | null;
}

export interface CreatedOrder {
  id: number;
  public_id: string;
}

/**
 * Se lanza cuando applyOrderReduction detecta que la composición de pax cambió entre
 * que se leyó la orden y que se escribió el resultado (dos modificaciones concurrentes
 * sobre la misma reserva). El caller debe responder 409 y pedir reintentar con datos
 * frescos, en vez de pisar silenciosamente el cambio del otro request.
 */
export class ConcurrentModificationError extends Error {
  constructor() {
    super('La reserva fue modificada por otra acción justo antes. Volvé a intentarlo.');
    this.name = 'ConcurrentModificationError';
  }
}

/**
 * Inserta order_items y (si vino ref_code de un vendedor activo) order_attributions con
 * su comisión calculada. Compartido por createPendingOrder (cash/vendedor/admin) y
 * createOrderFromHold (materialización de MP/PIX desde un checkout_hold) — la lógica de
 * comisión es intrincada (difiere cash vs MP) y no queremos dos copias que puedan divergir.
 */
async function insertOrderItemAndAttribution(
  client: PoolClient,
  orderId: number,
  item: CreateOrderInput['item'],
  ctx: { total_usd: number; exchange_rate_used: number; ref_code: string | null; payment_method?: 'mercadopago' | 'cash' | 'pix'; seller_member_id?: number | null },
): Promise<void> {
  await client.query(
    `INSERT INTO order_items (
       order_id, product_id, option_id,
       product_name_snapshot, option_name_snapshot, service_date,
       adults, children, unit_price_adult_usd, unit_price_child_usd, subtotal_usd,
       transfer_qty, transfer_hotel, transfer_room
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      orderId, item.product_id, item.option_id,
      item.product_name_snapshot, item.option_name_snapshot, item.service_date,
      item.adults, item.children,
      item.unit_price_adult_usd, item.unit_price_child_usd, item.subtotal_usd,
      item.transfer_qty ?? 0,
      item.transfer_hotel ?? null,
      item.transfer_room ?? null,
    ],
  );

  // Atribución a vendedor si vino ref válido
  if (ctx.ref_code) {
    const { rows: sellerRows } = await client.query<{ id: number; commission_percent: string }>(
      `SELECT id, commission_percent::text FROM sellers WHERE code = $1 AND is_active = TRUE LIMIT 1`,
      [ctx.ref_code],
    );
    const seller = sellerRows[0];
    if (seller) {
      let netTotalUsd = item.net_total_usd ?? null;
      const commissionPercent = Number.parseFloat(seller.commission_percent);
      let commissionUsd = 0;

      if (ctx.payment_method === 'cash') {
        // Efectivo: el vendedor cobra el total y se queda con (total − neto).
        // Nos debe liquidar el neto. Su "comisión" (ganancia) = total − neto.
        if (netTotalUsd != null) {
          commissionUsd = Math.max(0, Math.round((ctx.total_usd - netTotalUsd) * 100) / 100);
        } else if (commissionPercent > 0) {
          // Sin precio neto: derivamos comisión desde el % y guardamos el neto implícito.
          // Así las modificaciones futuras pueden recalcular via recomputeCashCommission.
          commissionUsd = Math.max(0, Math.round((ctx.total_usd * commissionPercent / 100) * 100) / 100);
          netTotalUsd = Math.max(0, Math.round((ctx.total_usd - commissionUsd) * 100) / 100);
        }
      } else {
        // Mercado Pago / PIX: nosotros cobramos y le liquidamos su comisión = % × total.
        commissionUsd = Math.max(0, Math.round((ctx.total_usd * commissionPercent / 100) * 100) / 100);
      }

      const commissionArs = Math.round(commissionUsd * ctx.exchange_rate_used * 100) / 100;
      await client.query(
        `INSERT INTO order_attributions (
           order_id, seller_id,
           net_total_usd_snapshot, commission_percent_snapshot,
           commission_amount_usd, commission_amount_ars, seller_member_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, seller.id, netTotalUsd, commissionPercent, commissionUsd, commissionArs, ctx.seller_member_id ?? null],
      );
    }
  }
}

export async function createPendingOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Guarda autoritativa contra sobreventa: toma un advisory lock por opción+fecha y
    // re-verifica el cupo dentro de la transacción. Si no hay lugar, lanza AvailabilityError
    // (→ 409) y el ROLLBACK del catch revierte la orden. Serializa reservas simultáneas
    // del mismo día sin bloquear el resto del catálogo.
    await checkAvailabilityTxLocked(
      client,
      input.item.option_id,
      input.default_capacity_per_day,
      input.item.service_date,
      input.item.adults + input.item.children,
    );

    const { rows: orderRows } = await client.query<{ id: number; public_id: string }>(
      `INSERT INTO orders (
         status, customer_name, customer_email, customer_phone, customer_nationality, customer_dni,
         total_usd, total_ars, exchange_rate_used, currency,
         ref_code, payment_method, utm_source, utm_medium, utm_campaign
       ) VALUES (
         'pending', $1, $2, $3, $4, $5, $6, $7, $8, 'ARS', $9, $10, $11, $12, $13
       )
       RETURNING id, public_id`,
      [
        input.customer.name, input.customer.email, input.customer.phone ?? null,
        input.customer.nationality ?? null, input.customer.dni ?? null,
        input.total_usd, input.total_ars, input.exchange_rate_used,
        input.ref_code, input.payment_method ?? 'mercadopago',
        input.utm?.source ?? null, input.utm?.medium ?? null, input.utm?.campaign ?? null,
      ],
    );
    const order = orderRows[0];

    await insertOrderItemAndAttribution(client, order.id, input.item, {
      total_usd: input.total_usd,
      exchange_rate_used: input.exchange_rate_used,
      ref_code: input.ref_code,
      payment_method: input.payment_method,
      seller_member_id: input.seller_member_id,
    });

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Materializa un checkout_hold (MP/PIX del checkout público, pago ya confirmado) en una
 * orden 'paid' real. Atómico: lock del hold + INSERT orden/item/atribución + DELETE del
 * hold, todo o nada. `public_id` de la orden queda igual al `id` del hold (continuidad de
 * links/voucher/página de gracias que el cliente ya pudo haber visto). Sin re-chequeo de
 * disponibilidad: el hold ya reservó el cupo desde que se creó (ver checkAvailabilityTxLocked
 * en createCheckoutHold). Si el hold ya no existe (purgado o nunca existió) devuelve null —
 * el caller decide cómo escalarlo (log CRITICAL para reconciliación manual).
 */
export async function createOrderFromHold(
  holdId: string,
  gateway: { mp_payment_id: string | null; mp_payment_status: string | null; mp_payment_method: string | null },
): Promise<{ id: number; public_id: string; holdExpiredBeforePayment: boolean } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [holdId]);

    const { rows: holdRows } = await client.query<{
      id: string; payment_method: string; expires_at: string; payload: CreateOrderInput;
    }>(
      `SELECT id, payment_method, expires_at, payload FROM checkout_holds WHERE id = $1 FOR UPDATE`,
      [holdId],
    );
    const hold = holdRows[0];
    if (!hold) {
      await client.query('ROLLBACK');
      return null;
    }
    const payload = hold.payload;
    const holdExpiredBeforePayment = new Date(hold.expires_at).getTime() < Date.now();

    const { rows: orderRows } = await client.query<{ id: number; public_id: string }>(
      `INSERT INTO orders (
         public_id, status, customer_name, customer_email, customer_phone, customer_nationality, customer_dni,
         total_usd, total_ars, exchange_rate_used, currency,
         ref_code, payment_method, utm_source, utm_medium, utm_campaign,
         mp_payment_id, mp_payment_status, mp_payment_method, paid_at,
         hold_expired_before_payment
       ) VALUES (
         $1::uuid, 'paid', $2, $3, $4, $5, $6, $7, $8, $9, 'ARS', $10, $11, $12, $13, $14,
         $15, $16, $17, NOW(), $18
       )
       RETURNING id, public_id`,
      [
        holdId,
        payload.customer.name, payload.customer.email, payload.customer.phone ?? null,
        payload.customer.nationality ?? null, payload.customer.dni ?? null,
        payload.total_usd, payload.total_ars, payload.exchange_rate_used,
        payload.ref_code, payload.payment_method ?? hold.payment_method,
        payload.utm?.source ?? null, payload.utm?.medium ?? null, payload.utm?.campaign ?? null,
        gateway.mp_payment_id, gateway.mp_payment_status, gateway.mp_payment_method,
        holdExpiredBeforePayment,
      ],
    );
    const order = orderRows[0];

    await insertOrderItemAndAttribution(client, order.id, payload.item, {
      total_usd: payload.total_usd,
      exchange_rate_used: payload.exchange_rate_used,
      ref_code: payload.ref_code,
      payment_method: payload.payment_method,
    });

    await client.query(`DELETE FROM checkout_holds WHERE id = $1`, [holdId]);

    await client.query('COMMIT');
    return { id: order.id, public_id: order.public_id, holdExpiredBeforePayment };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setOrderPreferenceId(orderId: number, preferenceId: string, initPoint?: string): Promise<void> {
  await pool.query(
    `UPDATE orders SET mp_preference_id = $1, mp_init_point = COALESCE($2, mp_init_point), updated_at = NOW() WHERE id = $3`,
    [preferenceId, initPoint ?? null, orderId],
  );
}

/**
 * Guarda (o refresca) los datos del cobro PIX de Nautt en la orden: el uuid de la orden
 * Nautt (clave de mapeo del webhook), el "copia e cola" y su expiración. Se llama al crear
 * la orden PIX y también al regenerar el QR cuando venció (pix-refresh).
 */
export async function setOrderPixCharge(orderId: number, pix: {
  nauttOrderUuid: string;
  pixQrcode: string;
  pixExpiresAt: Date | null;
  fiatAmountBrl: number;
}): Promise<void> {
  await pool.query(
    `UPDATE orders
        SET nautt_order_uuid = $1,
            pix_qrcode = $2,
            pix_expires_at = $3,
            pix_fiat_amount_brl = $4,
            updated_at = NOW()
      WHERE id = $5`,
    [pix.nauttOrderUuid, pix.pixQrcode, pix.pixExpiresAt, pix.fiatAmountBrl, orderId],
  );
}

/** Mapeo inverso para el webhook de Nautt: de la orden Nautt a nuestra orden. */
export async function findOrderByNauttOrderUuid(nauttOrderUuid: string): Promise<{ id: number; public_id: string; status: string } | null> {
  const { rows } = await pool.query<{ id: number; public_id: string; status: string }>(
    `SELECT id, public_id, status::text AS status FROM orders WHERE nautt_order_uuid = $1 LIMIT 1`,
    [nauttOrderUuid],
  );
  return rows[0] ?? null;
}

/**
 * Aplica un cambio de estado proveniente de MP (webhook o sync) de forma atómica:
 * la CTE toma el lock de fila (FOR UPDATE) y la guarda de la misma UPDATE evita que
 * un evento tardío o duplicado revierta un estado terminal (refunded/cancelled, que
 * ya implica un movimiento real de fondos resuelto) de vuelta a 'paid'/'failed'. Un
 * solo statement SQL es atómico en Postgres, no hace falta BEGIN/COMMIT manual acá.
 *
 * 'expired' también está blindado: el cron de expiración (expireOrders.ts) solo caduca
 * pending sin pago encontrado en MP, así que un pago aprobado tardío sobre una orden ya
 * expirada llega DESPUÉS de que su cupo se dio por liberado (pudo revenderse). Si se
 * dejara pisar silenciosamente a 'paid', quedaría una reserva "confirmada" sin garantía
 * real de cupo. El caller (applyPaymentToOrder) detecta que la guarda bloqueó el cambio
 * (updated.status !== newStatus) y lo deja registrado en payment_events sin notificar,
 * para reconciliación manual (el cliente sí fue cobrado en MP).
 *
 * Devuelve también el estado PREVIO para que el caller decida si notificar.
 */
export async function updateOrderFromPayment(
  publicId: string,
  fields: {
    status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
    mp_payment_id?: string | null;
    mp_payment_status?: string | null;
    mp_payment_method?: string | null;
    paid_at?: Date | null;
  },
): Promise<{ id: number; status: string; priorStatus: string } | null> {
  const { rows } = await pool.query<{ id: number; status: string; prior_status: string }>(
    `WITH prior AS (
       SELECT id, status::text AS status FROM orders WHERE public_id = $6 FOR UPDATE
     )
     UPDATE orders o
        SET status = (CASE
                        WHEN prior.status IN ('refunded','cancelled','expired') AND $1::text NOT IN ('refunded','cancelled')
                        THEN prior.status
                        ELSE $1::text
                      END)::order_status,
            mp_payment_id = COALESCE($2, o.mp_payment_id),
            mp_payment_status = COALESCE($3, o.mp_payment_status),
            mp_payment_method = COALESCE($4, o.mp_payment_method),
            paid_at = COALESCE($5, o.paid_at),
            updated_at = NOW()
       FROM prior
      WHERE o.id = prior.id
      RETURNING o.id AS id, o.status::text AS status, prior.status AS prior_status`,
    [
      fields.status,
      fields.mp_payment_id ?? null,
      fields.mp_payment_status ?? null,
      fields.mp_payment_method ?? null,
      fields.paid_at ?? null,
      publicId,
    ],
  );
  const row = rows[0];
  return row ? { id: row.id, status: row.status, priorStatus: row.prior_status } : null;
}

export interface OrderReductionInput {
  orderId: number;
  itemId: number;
  origAdults: number;
  origChildren: number;
  newAdults: number;
  newChildren: number;
  newTransferQty: number;
  newTransferHotel: string | null;
  newSubtotalUsd: number;
  newTotalArs: number;
  refundUsd: number;
  refundArs: number;
  // Comisión recalculada sobre el nuevo total (null = no hay atribución que actualizar).
  newCommissionUsd: number | null;
  newCommissionArs: number | null;
  // Neto recalculado (solo relevante para efectivo; null = no tocar).
  newNetTotalUsd: number | null;
  noteLine: string;
  actor?: 'admin' | 'seller';
  actorMemberId?: number | null;
  actorMemberName?: string | null;
}

/**
 * Aplica una REDUCCIÓN de reserva de forma transaccional: ajusta el item (pax/traslado/
 * subtotal), baja los totales de la orden, acumula lo reintegrado y recalcula la comisión
 * atribuida. Al bajar los pax en order_items, el cupo se libera automáticamente (la
 * disponibilidad se calcula desde ahí). NO llama a Mercado Pago: el refund real (o la
 * devolución en efectivo) se resuelve antes en la capa de ruta.
 *
 * Si se pasa `externalClient`, lo usa directo y NO abre/cierra su propia transacción
 * (el caller la maneja) — así el caso de MP puede sostener el mismo lock de fila desde
 * antes de llamar a Mercado Pago hasta después de persistir el resultado, sin la ventana
 * donde el refund ya se ejecutó pero la reducción todavía no se guardó. Sin ese parámetro
 * se comporta exactamente igual que antes (usado por las reducciones en efectivo, que no
 * llaman a ningún gateway externo y no tienen ese riesgo).
 */
export async function applyOrderReduction(input: OrderReductionInput, externalClient?: PoolClient): Promise<void> {
  const client = externalClient ?? await pool.connect();
  const ownsTransaction = !externalClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');

    // AND adults = $7 AND children = $8 es un chequeo de concurrencia optimista: si
    // otra modificación ya cambió la composición desde que esta request la leyó, el
    // UPDATE afecta 0 filas en vez de pisar silenciosamente el resultado del otro.
    const { rowCount } = await client.query(
      `UPDATE order_items
          SET adults = $1, children = $2,
              subtotal_usd = $3,
              transfer_qty = $4,
              transfer_hotel = $5
        WHERE id = $6 AND adults = $7 AND children = $8`,
      [input.newAdults, input.newChildren, input.newSubtotalUsd,
       input.newTransferQty, input.newTransferHotel, input.itemId,
       input.origAdults, input.origChildren],
    );
    if (!rowCount) throw new ConcurrentModificationError();

    await client.query(
      `UPDATE orders
          SET total_usd = $1,
              total_ars = $2,
              refunded_amount_usd = refunded_amount_usd + $3,
              refunded_amount_ars = refunded_amount_ars + $4,
              internal_notes = COALESCE(internal_notes || E'\\n', '') || $5,
              updated_at = NOW()
        WHERE id = $6`,
      [input.newSubtotalUsd, input.newTotalArs, input.refundUsd, input.refundArs,
       input.noteLine, input.orderId],
    );

    if (input.newCommissionUsd != null) {
      await client.query(
        `UPDATE order_attributions
            SET commission_amount_usd = $1,
                commission_amount_ars = $2,
                net_total_usd_snapshot = COALESCE($3, net_total_usd_snapshot)
          WHERE order_id = $4`,
        [input.newCommissionUsd, input.newCommissionArs ?? 0, input.newNetTotalUsd, input.orderId],
      );
    }

    await client.query(
      `INSERT INTO payment_events (order_id, event_type, payload)
       VALUES ($1, 'order_modified', $2::jsonb)`,
      [input.orderId, JSON.stringify({
        orig_adults: input.origAdults, orig_children: input.origChildren,
        new_adults: input.newAdults, new_children: input.newChildren,
        new_transfer_qty: input.newTransferQty,
        refund_usd: input.refundUsd, refund_ars: input.refundArs,
        actor: input.actor ?? null,
        seller_member_id: input.actorMemberId ?? null,
        seller_member_name: input.actorMemberName ?? null,
      })],
    );

    if (ownsTransaction) await client.query('COMMIT');
  } catch (err) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export interface OrderIncreaseInput {
  orderId: number;
  itemId: number;
  optionId: number;
  serviceDate: string;
  defaultCapacityPerDay: number;
  extraPax: number;               // pax que se suman (para el chequeo de cupo)
  newAdults: number;
  newChildren: number;
  newSubtotalUsd: number;
  newTotalArs: number;
  chargeUsd: number;
  chargeArs: number;
  newCommissionUsd: number | null;
  newCommissionArs: number | null;
  newNetTotalUsd: number | null;
  eventType: string;              // 'order_increased_cash' | 'order_increased_mp'
  noteLine: string;
}

/**
 * Aplica un AUMENTO de reserva de forma transaccional. Antes de subir los pax, verifica
 * el cupo con advisory lock (el pax extra debe entrar en la capacidad de la fecha); si no,
 * lanza AvailabilityError (→ 409). Recalcula comisión/neto. No cobra: el cobro (efectivo en
 * el momento, o pago del link incremental ya aprobado) se resuelve fuera.
 */
export async function applyOrderIncrease(input: OrderIncreaseInput): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Guarda de cupo para el pax extra (serializa contra reservas simultáneas de la fecha).
    await checkAvailabilityTxLocked(
      client, input.optionId, input.defaultCapacityPerDay, input.serviceDate, input.extraPax,
    );

    await client.query(
      `UPDATE order_items
          SET adults = $1, children = $2, subtotal_usd = $3
        WHERE id = $4`,
      [input.newAdults, input.newChildren, input.newSubtotalUsd, input.itemId],
    );

    await client.query(
      `UPDATE orders
          SET total_usd = $1, total_ars = $2,
              internal_notes = COALESCE(internal_notes || E'\\n', '') || $3,
              updated_at = NOW()
        WHERE id = $4`,
      [input.newSubtotalUsd, input.newTotalArs, input.noteLine, input.orderId],
    );

    if (input.newCommissionUsd != null) {
      await client.query(
        `UPDATE order_attributions
            SET commission_amount_usd = $1,
                commission_amount_ars = $2,
                net_total_usd_snapshot = COALESCE($3, net_total_usd_snapshot)
          WHERE order_id = $4`,
        [input.newCommissionUsd, input.newCommissionArs ?? 0, input.newNetTotalUsd, input.orderId],
      );
    }

    await client.query(
      `INSERT INTO payment_events (order_id, event_type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [input.orderId, input.eventType, JSON.stringify({
        new_adults: input.newAdults, new_children: input.newChildren,
        charge_usd: input.chargeUsd, charge_ars: input.chargeArs,
      })],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function logPaymentEvent(
  orderId: number | null,
  eventType: string,
  mpResourceId: string | null,
  payload: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO payment_events (order_id, event_type, mp_resource_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [orderId, eventType, mpResourceId, JSON.stringify(payload)],
  );
}


// ─── Archivo ──────────────────────────────────────────────────────────────────

export interface ArchivedOrder {
  id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  total_usd: number;
  total_ars: number;
  payment_method: string;
  created_at: string;
  archived_at: string | null;
  net_settled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  commission_amount_ars: number | null;
  paid_to_seller_at: string | null;
  seller_name: string | null;
  seller_code: string | null;
  product_name: string | null;
  option_name: string | null;
  service_date: string | null;
  adults: number | null;
  children: number | null;
  seller_member_id: number | null;
  seller_member_name: string | null;
}

export interface ArchivePage {
  orders: ArchivedOrder[];
  total: number;
  page: number;
  total_pages: number;
  limit: number;
}

const ARCHIVE_SELECT = `
  o.id, o.public_id, o.status::text AS status,
  o.customer_name, o.customer_email, o.customer_phone, o.customer_nationality,
  o.total_usd::float AS total_usd,
  o.total_ars::float AS total_ars,
  o.payment_method,
  o.created_at, o.archived_at,
  o.cancelled_by, o.cancel_reason, o.cancelled_at,
  a.net_settled_at, a.commission_amount_ars::float AS commission_amount_ars, a.paid_to_seller_at,
  s.name AS seller_name, s.code AS seller_code,
  oi.product_name_snapshot AS product_name,
  oi.option_name_snapshot AS option_name,
  to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
  oi.adults, oi.children,
  a.seller_member_id, m.name AS seller_member_name`;

export async function archiveOrders(publicIds: string[], adminId: string): Promise<number> {
  if (publicIds.length === 0) return 0;
  const result = await pool.query(
    `UPDATE orders
        SET archived_at = NOW(),
            archived_by_admin_id = $1::uuid,
            restored_at = NULL,
            updated_at = NOW()
      WHERE public_id = ANY($2::uuid[])
        AND archived_at IS NULL`,
    [adminId, publicIds],
  );
  return result.rowCount ?? 0;
}

export async function restoreFromArchive(publicIds: string[]): Promise<number> {
  if (publicIds.length === 0) return 0;
  const result = await pool.query(
    `UPDATE orders
        SET archived_at = NULL,
            archived_by_admin_id = NULL,
            restored_at = NOW(),
            updated_at = NOW()
      WHERE public_id = ANY($1::uuid[])
        AND archived_at IS NOT NULL`,
    [publicIds],
  );
  return result.rowCount ?? 0;
}

export async function listAdminArchive(params: {
  search?: string;
  status?: string;
  ref?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<ArchivePage> {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  const where: string[] = ['o.archived_at IS NOT NULL'];
  const args: unknown[] = [];
  const add = (sql: string, ...vals: unknown[]) => {
    vals.forEach((v) => args.push(v));
    where.push(sql);
  };

  if (params.status) add(`o.status = $${args.length + 1}`, params.status);
  if (params.ref) add(`o.ref_code = $${args.length + 1}`, params.ref);
  if (params.from) add(`o.created_at >= $${args.length + 1}::date`, params.from);
  if (params.to) add(`o.created_at < ($${args.length + 1}::date + INTERVAL '1 day')`, params.to);
  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    args.push(term);
    where.push(`(LOWER(o.customer_name) LIKE $${args.length} OR LOWER(o.customer_email) LIKE $${args.length})`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  args.push(limit, offset);

  const { rows } = await pool.query<ArchivedOrder & { total_count: number }>(
    `SELECT COUNT(*) OVER() AS total_count, ${ARCHIVE_SELECT}
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN order_attributions a ON a.order_id = o.id
       LEFT JOIN sellers s ON s.id = a.seller_id
       LEFT JOIN seller_members m ON m.id = a.seller_member_id
      ${whereSql}
      ORDER BY o.archived_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );

  const total = rows[0]?.total_count ?? 0;
  return { orders: rows, total, page, limit, total_pages: Math.ceil(total / limit) };
}

export async function listSellerArchive(sellerId: number, params: {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  memberId?: number;
  from?: string;
  to?: string;
}): Promise<ArchivePage> {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  // Una rendida que el vendedor restauró deja de "vivir" en el archivo — pasa a
  // Mis Órdenes hasta que la vuelva a archivar (ver listSellerOrders/hideAutoArchived).
  const args: unknown[] = [sellerId];
  // Canceladas/reintegradas/vencidas/fallidas: espejo exacto de listSellerOrders — solo
  // caen acá después de archive_retention_days, para que la orden no aparezca a la vez
  // en "Mis Órdenes" y en "Archivo" mientras está dentro de la ventana. Con el archivado
  // automático desactivado (null), mantiene el comportamiento previo (aparecen al instante).
  const retentionDays = await getArchiveRetentionDays();
  let terminalStatusCondition = `o.status IN ('cancelled', 'refunded', 'expired', 'failed')`;
  if (retentionDays != null) {
    args.push(retentionDays);
    terminalStatusCondition = `(
      o.status IN ('cancelled', 'refunded', 'expired', 'failed')
      AND COALESCE(o.cancelled_at, o.refunded_at, o.updated_at) < NOW() - make_interval(days => $${args.length})
    )`;
  }
  const baseWhere = `a.seller_id = $1
    AND (
      ${terminalStatusCondition}
      OR (a.net_settled_at IS NOT NULL AND o.restored_at IS NULL)
      OR o.archived_at IS NOT NULL
    )`;
  const extra: string[] = [];

  if (params.status === 'cancelled') extra.push(`o.status = 'cancelled'`);
  else if (params.status === 'refunded') extra.push(`o.status = 'refunded'`);
  else if (params.status === 'expired')  extra.push(`o.status IN ('expired', 'failed')`);
  else if (params.status === 'settled')  extra.push(`a.net_settled_at IS NOT NULL AND o.restored_at IS NULL`);

  if (params.search) {
    const term = `%${params.search.toLowerCase()}%`;
    args.push(term);
    extra.push(`(LOWER(o.customer_name) LIKE $${args.length} OR LOWER(o.customer_email) LIKE $${args.length})`);
  }
  if (params.memberId) {
    args.push(params.memberId);
    extra.push(`a.seller_member_id = $${args.length}`);
  }
  if (params.from) {
    args.push(params.from);
    extra.push(`o.created_at >= $${args.length}::date`);
  }
  if (params.to) {
    args.push(params.to);
    extra.push(`o.created_at < ($${args.length}::date + INTERVAL '1 day')`);
  }

  const whereSql = `WHERE ${baseWhere}${extra.length ? ' AND ' + extra.join(' AND ') : ''}`;
  args.push(limit, offset);

  const { rows } = await pool.query<ArchivedOrder & { total_count: number }>(
    `SELECT COUNT(*) OVER() AS total_count, ${ARCHIVE_SELECT}
       FROM order_attributions a
       JOIN orders o ON o.id = a.order_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN sellers s ON s.id = a.seller_id
       LEFT JOIN seller_members m ON m.id = a.seller_member_id
      ${whereSql}
      ORDER BY COALESCE(o.archived_at, o.cancelled_at, o.updated_at) DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );

  const total = rows[0]?.total_count ?? 0;
  return { orders: rows, total, page, limit, total_pages: Math.ceil(total / limit) };
}

// listSellerTrashedOrders kept for backwards compat — remove after migration
export async function listSellerTrashedOrders(sellerId: number): Promise<ArchivedOrder[]> {
  const result = await listSellerArchive(sellerId, { limit: 100 });
  return result.orders;
}

// Restaura a "Mis Órdenes" una orden del archivo del vendedor: ya sea archivada
// explícitamente por el admin (archived_at) o rendida y auto-archivada (net_settled_at).
// Excluye estados terminales (cancelada/reintegrada/vencida/fallida): esas nunca
// vuelven a Mis Órdenes porque su resolución no se puede deshacer con un simple restore.
export async function restoreFromSellerArchive(publicId: string, sellerId: number): Promise<number> {
  const result = await pool.query(
    `UPDATE orders o
        SET archived_at = NULL,
            archived_by_admin_id = NULL,
            restored_at = NOW(),
            updated_at = NOW()
       FROM order_attributions a
      WHERE o.id = a.order_id
        AND o.public_id = $1
        AND a.seller_id = $2
        AND (o.archived_at IS NOT NULL OR a.net_settled_at IS NOT NULL)
        AND o.status NOT IN ('cancelled', 'refunded', 'expired', 'failed')`,
    [publicId, sellerId],
  );
  return result.rowCount ?? 0;
}

// Archiva manualmente una orden desde "Mis Órdenes" del vendedor. Cubre dos casos:
//  (a) una rendida que el vendedor había restaurado y quiere volver a archivar, y
//  (b) una orden en estado terminal (cancelada/reintegrada/vencida/fallida) que
//      todavía sigue en "Mis Órdenes" porque no pasaron los días configurados de
//      archive_retention_days — el vendedor no tiene por qué esperar esa ventana.
export async function archiveBySeller(publicId: string, sellerId: number): Promise<number> {
  const result = await pool.query(
    `UPDATE orders o
        SET archived_at = NOW(),
            restored_at = NULL,
            updated_at = NOW()
       FROM order_attributions a
      WHERE o.id = a.order_id
        AND o.public_id = $1
        AND a.seller_id = $2
        AND o.archived_at IS NULL
        AND (
          o.restored_at IS NOT NULL
          OR o.status IN ('cancelled', 'refunded', 'expired', 'failed')
        )`,
    [publicId, sellerId],
  );
  return result.rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface OrderVerificationInfo {
  public_id: string;
  status: string;
  customer_name: string;
  product_name: string;
  option_name: string;
  service_date: string;
  adults: number;
  children: number;
  transfer_qty: number;
  updated_at: string;
}

// Estado EN VIVO de una reserva, para la página pública de verificación (QR del
// voucher). A diferencia de un email o un PDF ya generado, esto siempre refleja la
// composición actual (post modificaciones): así no importa qué versión vieja del
// comprobante muestre el pasajero en la puerta, escanear el QR dice la verdad.
export async function getOrderVerificationInfo(publicId: string): Promise<OrderVerificationInfo | null> {
  const { rows } = await pool.query<OrderVerificationInfo>(
    `SELECT o.public_id, o.status::text AS status, o.customer_name,
            oi.product_name_snapshot AS product_name,
            oi.option_name_snapshot AS option_name,
            to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
            oi.adults, oi.children, oi.transfer_qty,
            o.updated_at
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
      WHERE o.public_id = $1
      ORDER BY oi.id
      LIMIT 1`,
    [publicId],
  );
  return rows[0] ?? null;
}

export async function findOrderByPublicId(publicId: string): Promise<{
  id: number;
  status: string;
  total_usd: number;
  total_ars: number;
  customer_email: string;
  customer_name: string;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  payment_method: string;
  nautt_order_uuid: string | null;
  pix_qrcode: string | null;
  pix_expires_at: string | null;
  pix_fiat_amount_brl: number | null;
} | null> {
  const { rows } = await pool.query(
    `SELECT id, status::text AS status, total_usd::float AS total_usd,
            total_ars::float AS total_ars, customer_email, customer_name,
            mp_preference_id, mp_payment_id, payment_method,
            nautt_order_uuid, pix_qrcode, pix_expires_at,
            pix_fiat_amount_brl::float AS pix_fiat_amount_brl
       FROM orders WHERE public_id = $1 LIMIT 1`,
    [publicId],
  );
  return rows[0] ?? null;
}
