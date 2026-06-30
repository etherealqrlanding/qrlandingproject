import { pool } from '../db.js';
import { logPaymentEvent } from '../repos/orders.js';
import { createOrderExpiredNotification } from '../repos/notifications.js';

const EXPIRY_HOURS = 24;
const SWEEP_INTERVAL_MS = 15 * 60_000; // cada 15 minutos

/**
 * Caduca las reservas en EFECTIVO que quedaron en 'pending' y no se marcaron como
 * cobradas dentro de las 24 hs de creadas. Pasan a estado 'expired' ("Caducada").
 * Solo aplica a efectivo (vendedores permanentes); las de Mercado Pago no caducan acá.
 * Devuelve la cantidad de órdenes caducadas.
 */
export async function expireStaleCashOrders(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE orders
        SET status = 'expired', updated_at = NOW()
      WHERE payment_method = 'cash'
        AND status = 'pending'
        AND created_at < NOW() - make_interval(hours => $1)
      RETURNING id`,
    [EXPIRY_HOURS],
  );

  for (const { id } of rows) {
    await logPaymentEvent(id, 'order_expired_auto', null, {
      reason: `Reserva en efectivo no cobrada dentro de las ${EXPIRY_HOURS} hs`,
    }).catch((e) => console.error('[expire] logPaymentEvent failed for order', id, e));
    await createOrderExpiredNotification(id).catch((e) =>
      console.error('[expire] notification failed for order', id, e),
    );
  }

  if (rows.length > 0) {
    console.log(`[expire] ${rows.length} orden(es) en efectivo caducada(s) por inactividad.`);
  }
  return rows.length;
}

/** Arranca el barrido periódico de caducidad (más un barrido inicial al iniciar). */
export function startExpiryJob(): void {
  expireStaleCashOrders().catch((e) => console.error('[expire] sweep inicial falló:', e));
  setInterval(() => {
    expireStaleCashOrders().catch((e) => console.error('[expire] sweep falló:', e));
  }, SWEEP_INTERVAL_MS);
}
