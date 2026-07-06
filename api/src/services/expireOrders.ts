import { pool } from '../db.js';
import { logPaymentEvent } from '../repos/orders.js';
import { createOrderExpiredNotification } from '../repos/notifications.js';
import { syncOrderWithMp, syncAddonWithMp } from '../routes/checkout.js';
import { listStalePendingAddons, expireAddon } from '../repos/addons.js';

const EXPIRY_HOURS = 24;
// MP: abandonos de checkout. Se caducan antes que el efectivo porque el link de pago
// ya venció y la orden pendiente estaría reteniendo cupos sin un pago real detrás.
const MP_EXPIRY_HOURS = 3;
// Addons (ampliaciones con link de MP): mismo criterio que las órdenes MP.
const ADDON_EXPIRY_HOURS = 3;
const SWEEP_INTERVAL_MS = 15 * 60_000; // cada 15 minutos

async function expireOrder(id: number, reason: string): Promise<void> {
  await pool.query(
    `UPDATE orders SET status = 'expired', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  await logPaymentEvent(id, 'order_expired_auto', null, { reason }).catch((e) =>
    console.error('[expire] logPaymentEvent failed for order', id, e),
  );
  await createOrderExpiredNotification(id).catch((e) =>
    console.error('[expire] notification failed for order', id, e),
  );
}

/**
 * Caduca las reservas en EFECTIVO que quedaron en 'pending' y no se marcaron como
 * cobradas dentro de las 24 hs de creadas. Pasan a estado 'expired' ("Caducada").
 * Solo aplica a efectivo (vendedores permanentes); las de Mercado Pago se manejan aparte.
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

/**
 * Caduca reservas de Mercado Pago abandonadas: 'pending', sin payment_id confirmado y
 * con más de MP_EXPIRY_HOURS de antigüedad. Antes de caducar, consulta MP por la
 * referencia: si allí existe algún pago (aunque esté pendiente, ej. cupón Rapipago),
 * NO la caduca y deja que el pago se resuelva; solo caduca las que MP no conoce.
 * Así se liberan los cupos retenidos por abandonos sin arriesgar pagos legítimos en curso.
 */
export async function expireStaleMpOrders(): Promise<number> {
  const { rows } = await pool.query<{ id: number; public_id: string }>(
    `SELECT id, public_id
       FROM orders
      WHERE payment_method = 'mercadopago'
        AND status = 'pending'
        AND mp_payment_id IS NULL
        AND created_at < NOW() - make_interval(hours => $1)`,
    [MP_EXPIRY_HOURS],
  );

  let expired = 0;
  for (const { id, public_id } of rows) {
    try {
      // syncOrderWithMp consulta MP y, si hay pago, actualiza la orden a su estado real.
      const result = await syncOrderWithMp(public_id);
      if (!result.found) {
        // MP no tiene ningún pago para esta orden → abandono real, se libera el cupo.
        await expireOrder(id, `Checkout de Mercado Pago abandonado (>${MP_EXPIRY_HOURS} hs sin pago)`);
        expired += 1;
      }
    } catch (e) {
      // Ante un fallo consultando MP, NO caducamos: preferimos retener el cupo un ciclo más
      // antes que caducar una orden que quizá sí tenga un pago aprobado.
      console.error('[expire] sync MP falló para orden', id, e);
    }
  }

  if (expired > 0) {
    console.log(`[expire] ${expired} orden(es) de Mercado Pago caducada(s) por abandono.`);
  }
  return expired;
}

/**
 * Caduca las ampliaciones (addons) con link de MP no pagadas: libera el cupo que reservaban.
 * Igual que las órdenes MP, antes de caducar consulta MP (vía syncAddonWithMp): si hay un
 * pago aprobado lo aplica; solo caduca las que MP no conoce.
 */
export async function expireStaleMpAddons(): Promise<number> {
  const stale = await listStalePendingAddons(ADDON_EXPIRY_HOURS);
  let expired = 0;
  for (const { id, public_id, order_id } of stale) {
    try {
      const result = await syncAddonWithMp(public_id);
      if (result.status !== 'paid' && !result.hasPayment) {
        await expireAddon(id);
        await logPaymentEvent(order_id, 'addon_expired_auto', null, {
          reason: `Ampliación con link de MP no pagada (>${ADDON_EXPIRY_HOURS} hs)`,
        }).catch(() => {});
        expired += 1;
      }
    } catch (e) {
      console.error('[expire] sync addon falló para', id, e);
    }
  }
  if (expired > 0) {
    console.log(`[expire] ${expired} ampliación(es) de MP caducada(s) por abandono.`);
  }
  return expired;
}

async function runSweep(): Promise<void> {
  await expireStaleCashOrders().catch((e) => console.error('[expire] sweep efectivo falló:', e));
  await expireStaleMpOrders().catch((e) => console.error('[expire] sweep MP falló:', e));
  await expireStaleMpAddons().catch((e) => console.error('[expire] sweep addons falló:', e));
}

/** Arranca el barrido periódico de caducidad (más un barrido inicial al iniciar). */
export function startExpiryJob(): void {
  runSweep().catch((e) => console.error('[expire] sweep inicial falló:', e));
  setInterval(() => {
    runSweep().catch((e) => console.error('[expire] sweep falló:', e));
  }, SWEEP_INTERVAL_MS);
}
