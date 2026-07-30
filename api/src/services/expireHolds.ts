import { logPaymentEvent } from '../repos/orders.js';
import { listExpiredHoldsForSync, purgeStaleHolds } from '../repos/checkoutHolds.js';
import { syncOrderWithMp, syncOrderWithNautt } from '../routes/checkout.js';

// Más frecuente que el barrido de expireOrders.ts (15 min): el QR de PIX vive ~15 min
// reales, así que un intervalo más ajustado reconcilia pagos tardíos más rápido.
const HOLD_SWEEP_INTERVAL_MS = 2 * 60_000;
// Ventana de gracia antes de purgar (borrado físico) un hold vencido sin pago — mismos
// números que usa expireOrders.ts para el criterio equivalente en órdenes.
const MP_HOLD_PURGE_GRACE_HOURS = 3;
const PIX_HOLD_PURGE_GRACE_HOURS = 1;

/**
 * Re-sincroniza contra el gateway los holds vencidos que todavía existen como fila (por
 * si el pago llegó justo en el filo — applyGatewayResolution los materializa y borra el
 * hold si corresponde) y purga los que superaron la ventana de gracia sin pago.
 */
export async function syncExpiringHolds(): Promise<void> {
  const candidates = await listExpiredHoldsForSync();
  for (const h of candidates) {
    try {
      if (h.payment_method === 'pix') await syncOrderWithNautt(h.id);
      else await syncOrderWithMp(h.id);
    } catch (e) {
      console.error('[expireHolds] sync falló para hold', h.id, e);
    }
  }

  const purged = await purgeStaleHolds(MP_HOLD_PURGE_GRACE_HOURS, PIX_HOLD_PURGE_GRACE_HOURS);
  for (const h of purged) {
    await logPaymentEvent(null, 'hold_purged', h.id, { payment_method: h.payment_method }).catch(() => {});
  }
  if (purged.length > 0) {
    console.log(`[expireHolds] ${purged.length} hold(s) purgado(s) sin pago.`);
  }
}

/** Arranca el barrido periódico de holds (más un barrido inicial al iniciar). */
export function startHoldSweepJob(): void {
  syncExpiringHolds().catch((e) => console.error('[expireHolds] sweep inicial falló:', e));
  setInterval(() => {
    syncExpiringHolds().catch((e) => console.error('[expireHolds] sweep falló:', e));
  }, HOLD_SWEEP_INTERVAL_MS);
}
