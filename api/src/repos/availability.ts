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

  const { rows: bookingRows } = await q.query<{ total_pax: number }>(
    `SELECT COALESCE(SUM(oi.adults + oi.children), 0)::int AS total_pax
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE oi.option_id = $1
        AND oi.service_date = $2::date
        AND o.status IN ('paid', 'pending')`,
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
