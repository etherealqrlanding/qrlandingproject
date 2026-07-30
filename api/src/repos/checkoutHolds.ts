import { pool } from '../db.js';
import { checkAvailabilityTxLocked } from './availability.js';
import type { CreateOrderInput } from './orders.js';

export interface CreateHoldInput {
  paymentMethod: 'mercadopago' | 'pix';
  optionId: number;
  serviceDate: string;
  pax: number;
  ttlMinutes: number;
  defaultCapacityPerDay: number;
  payload: CreateOrderInput;
}

export interface HoldRow {
  id: string;
  payment_method: 'mercadopago' | 'pix';
  option_id: number;
  service_date: string;
  pax: number;
  expires_at: string;
  payload: CreateOrderInput;
  mp_preference_id: string | null;
  mp_init_point: string | null;
  nautt_order_uuid: string | null;
  pix_qrcode: string | null;
  pix_fiat_amount_brl: number | null;
  created_at: string;
}

/**
 * Crea un hold de cupo para el checkout público (MP/PIX), ANTES de generar el cobro.
 * Mismo mecanismo de serialización que createPendingOrder: advisory lock por
 * opción+fecha + chequeo autoritativo dentro de la transacción, así dos checkouts
 * simultáneos por el último cupo no pueden pasar los dos.
 */
export async function createCheckoutHold(input: CreateHoldInput): Promise<{ id: string; expiresAt: Date }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await checkAvailabilityTxLocked(
      client, input.optionId, input.defaultCapacityPerDay, input.serviceDate, input.pax,
    );

    const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO checkout_holds (payment_method, option_id, service_date, pax, expires_at, payload)
       VALUES ($1, $2, $3::date, $4, $5, $6::jsonb)
       RETURNING id`,
      [input.paymentMethod, input.optionId, input.serviceDate, input.pax, expiresAt, JSON.stringify(input.payload)],
    );

    await client.query('COMMIT');
    return { id: rows[0].id, expiresAt };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setHoldPreference(holdId: string, preferenceId: string, initPoint: string): Promise<void> {
  await pool.query(
    `UPDATE checkout_holds SET mp_preference_id = $1, mp_init_point = $2 WHERE id = $3`,
    [preferenceId, initPoint, holdId],
  );
}

/**
 * Guarda los datos del cobro PIX de Nautt en el hold — incluye extender `expires_at` a
 * la expiración real del QR ("copia e cola" ~15 min), que es lo que gobierna la
 * disponibilidad. Se llama al crear el hold y también al regenerar el QR (pix-refresh).
 */
export async function setHoldPixCharge(holdId: string, pix: {
  nauttOrderUuid: string;
  pixQrcode: string;
  pixExpiresAt: Date | null;
  fiatAmountBrl: number;
}): Promise<void> {
  await pool.query(
    `UPDATE checkout_holds
        SET nautt_order_uuid = $1,
            pix_qrcode = $2,
            pix_fiat_amount_brl = $3,
            expires_at = COALESCE($4, expires_at)
      WHERE id = $5`,
    [pix.nauttOrderUuid, pix.pixQrcode, pix.fiatAmountBrl, pix.pixExpiresAt, holdId],
  );
}

export async function findHoldById(id: string): Promise<HoldRow | null> {
  const { rows } = await pool.query<HoldRow>(
    `SELECT id, payment_method, option_id, to_char(service_date, 'YYYY-MM-DD') AS service_date,
            pax, expires_at, payload, mp_preference_id, mp_init_point,
            nautt_order_uuid, pix_qrcode, pix_fiat_amount_brl::float AS pix_fiat_amount_brl, created_at
       FROM checkout_holds WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Para el webhook de Nautt: busca primero en `orders` (ya materializada — el webhook
 * puede llegar duplicado o tarde) y si no, en `checkout_holds`. Sin esto, un webhook que
 * llega mientras la referencia todavía es un hold se descartaría con "no matching order".
 */
export async function findHoldOrOrderRefByNauttOrderUuid(nauttOrderUuid: string): Promise<{ publicId: string } | null> {
  const { rows: orderRows } = await pool.query<{ public_id: string }>(
    `SELECT public_id FROM orders WHERE nautt_order_uuid = $1 LIMIT 1`,
    [nauttOrderUuid],
  );
  if (orderRows[0]) return { publicId: orderRows[0].public_id };

  const { rows: holdRows } = await pool.query<{ id: string }>(
    `SELECT id FROM checkout_holds WHERE nautt_order_uuid = $1 LIMIT 1`,
    [nauttOrderUuid],
  );
  return holdRows[0] ? { publicId: holdRows[0].id } : null;
}

/** Holds vencidos que todavía existen como fila — candidatos a re-sincronizar contra el gateway. */
export async function listExpiredHoldsForSync(): Promise<{ id: string; payment_method: 'mercadopago' | 'pix' }[]> {
  const { rows } = await pool.query<{ id: string; payment_method: 'mercadopago' | 'pix' }>(
    `SELECT id, payment_method FROM checkout_holds WHERE expires_at < NOW()`,
  );
  return rows;
}

/**
 * Purga (borrado físico) los holds vencidos hace más de la ventana de gracia por medio
 * de pago, sin pago confirmado (si lo hubiera, ya se habría materializado y borrado antes
 * vía createOrderFromHold). Después de esta ventana, un pago aprobado tardío ya no tiene
 * payload para reconstruir la orden — cae en el camino de reconciliación manual (mismo
 * criterio que ya existe hoy para órdenes 'expired').
 */
export async function purgeStaleHolds(mpGraceHours: number, pixGraceHours: number): Promise<{ id: string; payment_method: string }[]> {
  const { rows } = await pool.query<{ id: string; payment_method: string }>(
    `DELETE FROM checkout_holds
      WHERE (payment_method = 'mercadopago' AND expires_at < NOW() - make_interval(hours => $1))
         OR (payment_method = 'pix'         AND expires_at < NOW() - make_interval(hours => $2))
      RETURNING id, payment_method`,
    [mpGraceHours, pixGraceHours],
  );
  return rows;
}

/** Libera el cupo al instante — usado cuando falla la creación del cobro (MP/Nautt) justo después de crear el hold. */
export async function releaseHold(holdId: string): Promise<void> {
  await pool.query(`DELETE FROM checkout_holds WHERE id = $1`, [holdId]);
}

export interface AdminHoldRow {
  id: string;
  payment_method: string;
  service_date: string;
  pax: number;
  expires_at: string;
  seconds_remaining: number;
  created_at: string;
  product_name: string;
  option_name: string;
  customer_name: string;
  customer_email: string;
  total_usd: number;
  total_ars: number;
  ref_code: string | null;
}

/** Panel admin: holds activos (por default) con datos del producto/cliente para monitoreo en vivo. */
export async function listActiveHoldsForAdmin(filters?: {
  paymentMethod?: 'mercadopago' | 'pix';
  search?: string;
  includeExpired?: boolean;
}): Promise<AdminHoldRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!filters?.includeExpired) where.push('h.expires_at > NOW()');
  if (filters?.paymentMethod) {
    params.push(filters.paymentMethod);
    where.push(`h.payment_method = $${params.length}`);
  }
  if (filters?.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`(LOWER(h.payload->'customer'->>'name') LIKE $${params.length} OR LOWER(h.payload->'customer'->>'email') LIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query<AdminHoldRow>(
    `SELECT
       h.id, h.payment_method, to_char(h.service_date, 'YYYY-MM-DD') AS service_date,
       h.pax, h.expires_at,
       GREATEST(0, EXTRACT(EPOCH FROM (h.expires_at - NOW())))::int AS seconds_remaining,
       h.created_at,
       p.name AS product_name, po.name_es AS option_name,
       h.payload->'customer'->>'name' AS customer_name,
       h.payload->'customer'->>'email' AS customer_email,
       (h.payload->>'total_usd')::float AS total_usd,
       (h.payload->>'total_ars')::float AS total_ars,
       h.payload->>'ref_code' AS ref_code
       FROM checkout_holds h
       JOIN product_options po ON po.id = h.option_id
       JOIN products p ON p.id = po.product_id
       ${whereSql}
      ORDER BY h.expires_at ASC`,
    params,
  );
  return rows;
}
