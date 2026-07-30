import type { PoolClient } from 'pg';
import { pool } from '../db.js';

export interface AvailabilityCheckResult {
  ok: boolean;
  reason?: 'manually_closed' | 'full' | 'no_capacity';
  message?: string;
}

/**
 * Error que se lanza cuando el chequeo de cupo dentro de la transacción de creación
 * de orden falla. Las rutas / el error handler global lo traducen a un 409.
 */
export class AvailabilityError extends Error {
  reason: NonNullable<AvailabilityCheckResult['reason']>;
  constructor(message: string, reason: NonNullable<AvailabilityCheckResult['reason']>) {
    super(message);
    this.name = 'AvailabilityError';
    this.reason = reason;
  }
}

// Objeto con .query — sirve tanto para el pool como para un client dentro de una transacción.
type Queryable = Pick<PoolClient, 'query'>;

async function runAvailabilityCheck(
  q: Queryable,
  optionId: number,
  defaultCapacityPerDay: number,
  serviceDate: string,
  requestedPax: number,
): Promise<AvailabilityCheckResult> {
  const { rows: overrideRows } = await q.query<{
    capacity_override: number | null;
    is_closed: boolean;
  }>(
    `SELECT capacity_override, is_closed
       FROM option_availability
      WHERE option_id = $1 AND date = $2::date
      LIMIT 1`,
    [optionId, serviceDate],
  );
  const override = overrideRows[0];

  if (override?.is_closed) {
    return { ok: false, reason: 'manually_closed', message: 'La casa no opera en esa fecha.' };
  }

  const capacity = override?.capacity_override ?? defaultCapacityPerDay;

  if (capacity === 0) {
    return { ok: false, reason: 'no_capacity', message: 'No hay cupos disponibles para esa fecha.' };
  }

  // Cupo ocupado = pax de órdenes pagadas/pendientes + pax extra de addons pendientes
  // + pax de checkout_holds vigentes. Centralizado en la función SQL option_booked_pax
  // (migración 036) para que este chequeo y el buscador de disponibilidad del admin
  // (getAvailabilityForDate) usen exactamente la misma cuenta.
  const { rows: bookingRows } = await q.query<{ total_pax: number }>(
    `SELECT option_booked_pax($1, $2::date) AS total_pax`,
    [optionId, serviceDate],
  );
  const booked = bookingRows[0]?.total_pax ?? 0;

  if (booked + requestedPax > capacity) {
    return { ok: false, reason: 'full', message: 'No hay suficientes cupos para esa fecha.' };
  }

  return { ok: true };
}

/**
 * Validates whether a specific date can accept a new booking for an option.
 * Checks option_availability overrides (is_closed, capacity_override) and
 * existing paid/pending bookings against the effective capacity.
 *
 * Pre-chequeo (fuera de transacción): sirve para responder rápido y evitar crear
 * órdenes que igual iban a fallar. La verificación AUTORITATIVA contra sobreventa
 * ocurre dentro de la transacción de createPendingOrder (ver checkAvailabilityTxLocked).
 */
export async function checkSingleDateAvailability(
  optionId: number,
  defaultCapacityPerDay: number,
  serviceDate: string,
  requestedPax: number,
): Promise<AvailabilityCheckResult> {
  return runAvailabilityCheck(pool, optionId, defaultCapacityPerDay, serviceDate, requestedPax);
}

export interface DateAvailabilityRow {
  option_id: number;
  option_name: string;
  option_code: string;
  is_option_active: boolean;
  product_id: number;
  product_name: string;
  is_closed: boolean;
  capacity: number;
  booked: number;
  remaining: number;
}

/**
 * Panel admin: disponibilidad de TODAS las opciones activas para una fecha puntual,
 * en una sola query (no una por opción). Usa la misma option_booked_pax() que el
 * checkout, así el número que ve el admin es exactamente el que bloquea/permite una
 * reserva en ese momento — no una foto vieja ni un cálculo distinto.
 */
export async function getAvailabilityForDate(serviceDate: string): Promise<DateAvailabilityRow[]> {
  const { rows } = await pool.query<DateAvailabilityRow>(
    `SELECT
       po.id AS option_id, po.name_es AS option_name, po.code AS option_code,
       po.is_active AS is_option_active,
       p.id AS product_id, p.name AS product_name,
       COALESCE(oa.is_closed, FALSE) AS is_closed,
       COALESCE(oa.capacity_override, po.default_capacity_per_day) AS capacity,
       option_booked_pax(po.id, $1::date) AS booked,
       GREATEST(0, COALESCE(oa.capacity_override, po.default_capacity_per_day) - option_booked_pax(po.id, $1::date)) AS remaining
       FROM product_options po
       JOIN products p ON p.id = po.product_id
       LEFT JOIN option_availability oa ON oa.option_id = po.id AND oa.date = $1::date
      WHERE po.is_active = TRUE AND p.is_active = TRUE
      ORDER BY p.display_order, p.name, po.display_order`,
    [serviceDate],
  );
  return rows;
}

/**
 * Chequeo autoritativo de cupo DENTRO de una transacción. Toma un advisory lock por
 * (option_id, service_date) para serializar las reservas simultáneas de esa fecha:
 * así dos requests por el último cupo no pueden pasar ambas y sobrevender.
 * Lanza AvailabilityError si no hay lugar. El lock se libera al COMMIT/ROLLBACK.
 */
export async function checkAvailabilityTxLocked(
  client: PoolClient,
  optionId: number,
  defaultCapacityPerDay: number,
  serviceDate: string,
  requestedPax: number,
): Promise<void> {
  // Lock a nivel transacción, keyed por opción+fecha (hashtext → int4, se castea a bigint).
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${optionId}:${serviceDate}`]);

  const result = await runAvailabilityCheck(client, optionId, defaultCapacityPerDay, serviceDate, requestedPax);
  if (!result.ok) {
    throw new AvailabilityError(result.message ?? 'Fecha no disponible', result.reason ?? 'full');
  }
}
