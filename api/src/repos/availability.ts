import { pool } from '../db.js';

export interface AvailabilityCheckResult {
  ok: boolean;
  reason?: 'manually_closed' | 'full' | 'no_capacity';
  message?: string;
}

/**
 * Validates whether a specific date can accept a new booking for an option.
 * Checks option_availability overrides (is_closed, capacity_override) and
 * existing paid/pending bookings against the effective capacity.
 */
export async function checkSingleDateAvailability(
  optionId: number,
  defaultCapacityPerDay: number,
  serviceDate: string,
  requestedPax: number,
): Promise<AvailabilityCheckResult> {
  const { rows: overrideRows } = await pool.query<{
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

  const { rows: bookingRows } = await pool.query<{ total_pax: number }>(
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
