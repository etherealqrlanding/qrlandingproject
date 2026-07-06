import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { checkAvailabilityTxLocked } from './availability.js';

export interface CreateOrderInput {
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    nationality?: string | null;
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
    transfer_requested?: boolean;
    transfer_hotel?: string | null;
    // Net prices snapshot (optional: only set when option has them configured)
    net_total_usd?: number | null;
  };
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  ref_code: string | null;
  payment_method?: 'mercadopago' | 'cash';
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
  // Capacidad efectiva de la opción para el día: se usa para el chequeo autoritativo
  // de cupo (con lock) dentro de la transacción, evitando sobreventa por concurrencia.
  default_capacity_per_day: number;
}

export interface CreatedOrder {
  id: number;
  public_id: string;
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
         status, customer_name, customer_email, customer_phone, customer_nationality,
         total_usd, total_ars, exchange_rate_used, currency,
         ref_code, payment_method, utm_source, utm_medium, utm_campaign
       ) VALUES (
         'pending', $1, $2, $3, $4, $5, $6, $7, 'ARS', $8, $9, $10, $11, $12
       )
       RETURNING id, public_id`,
      [
        input.customer.name, input.customer.email, input.customer.phone ?? null, input.customer.nationality ?? null,
        input.total_usd, input.total_ars, input.exchange_rate_used,
        input.ref_code, input.payment_method ?? 'mercadopago',
        input.utm?.source ?? null, input.utm?.medium ?? null, input.utm?.campaign ?? null,
      ],
    );
    const order = orderRows[0];

    await client.query(
      `INSERT INTO order_items (
         order_id, product_id, option_id,
         product_name_snapshot, option_name_snapshot, service_date,
         adults, children, unit_price_adult_usd, unit_price_child_usd, subtotal_usd,
         transfer_requested, transfer_hotel
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        order.id, input.item.product_id, input.item.option_id,
        input.item.product_name_snapshot, input.item.option_name_snapshot, input.item.service_date,
        input.item.adults, input.item.children,
        input.item.unit_price_adult_usd, input.item.unit_price_child_usd, input.item.subtotal_usd,
        input.item.transfer_requested ?? false,
        input.item.transfer_hotel ?? null,
      ],
    );

    // Atribución a vendedor si vino ref válido
    if (input.ref_code) {
      const { rows: sellerRows } = await client.query<{ id: number; commission_percent: string }>(
        `SELECT id, commission_percent::text FROM sellers WHERE code = $1 AND is_active = TRUE LIMIT 1`,
        [input.ref_code],
      );
      const seller = sellerRows[0];
      if (seller) {
        const netTotalUsd = input.item.net_total_usd ?? null;
        const commissionPercent = Number.parseFloat(seller.commission_percent);
        let commissionUsd = 0;

        if (input.payment_method === 'cash') {
          // Efectivo: el vendedor cobra el total y se queda con (total − neto).
          // Nos debe liquidar el neto. Su "comisión" (ganancia) = total − neto.
          if (netTotalUsd != null) {
            commissionUsd = Math.max(0, Math.round((input.total_usd - netTotalUsd) * 100) / 100);
          }
        } else {
          // Mercado Pago: nosotros cobramos y le liquidamos su comisión = % × total.
          // (Ya no se descuenta ningún fee de MP.)
          commissionUsd = Math.max(0, Math.round((input.total_usd * commissionPercent / 100) * 100) / 100);
        }

        const commissionArs = Math.round(commissionUsd * input.exchange_rate_used * 100) / 100;
        await client.query(
          `INSERT INTO order_attributions (
             order_id, seller_id,
             net_total_usd_snapshot, commission_percent_snapshot,
             commission_amount_usd, commission_amount_ars
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.id, seller.id, netTotalUsd, commissionPercent, commissionUsd, commissionArs],
        );
      }
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setOrderPreferenceId(orderId: number, preferenceId: string): Promise<void> {
  await pool.query(
    `UPDATE orders SET mp_preference_id = $1, updated_at = NOW() WHERE id = $2`,
    [preferenceId, orderId],
  );
}

export async function updateOrderFromPayment(
  client: PoolClient,
  publicId: string,
  fields: {
    status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
    mp_payment_id?: string | null;
    mp_payment_status?: string | null;
    mp_payment_method?: string | null;
    paid_at?: Date | null;
  },
): Promise<{ id: number; status: string } | null> {
  const { rows } = await client.query<{ id: number; status: string }>(
    `UPDATE orders
        SET status = $1,
            mp_payment_id = COALESCE($2, mp_payment_id),
            mp_payment_status = COALESCE($3, mp_payment_status),
            mp_payment_method = COALESCE($4, mp_payment_method),
            paid_at = COALESCE($5, paid_at),
            updated_at = NOW()
      WHERE public_id = $6
      RETURNING id, status::text AS status`,
    [
      fields.status,
      fields.mp_payment_id ?? null,
      fields.mp_payment_status ?? null,
      fields.mp_payment_method ?? null,
      fields.paid_at ?? null,
      publicId,
    ],
  );
  return rows[0] ?? null;
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
} | null> {
  const { rows } = await pool.query(
    `SELECT id, status::text AS status, total_usd::float AS total_usd,
            total_ars::float AS total_ars, customer_email, customer_name,
            mp_preference_id, mp_payment_id, payment_method
       FROM orders WHERE public_id = $1 LIMIT 1`,
    [publicId],
  );
  return rows[0] ?? null;
}
