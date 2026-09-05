import { pool } from '../db.js';
import { getArchiveRetentionDays } from './settings.js';

const SWEEP_INTERVAL_MS = 15 * 60_000; // cada 15 minutos, igual que el barrido de caducidad

/**
 * Archiva automáticamente las órdenes en un estado final (cancelada, reintegrada,
 * caducada o fallida) que llevan más de N días así, sin que un admin las haya
 * archivado a mano todavía. También archiva las órdenes en efectivo ya RENDIDAS
 * (net_settled_at) que llevan más de N días rendidas -- "Mis Órdenes" del vendedor
 * las muestra con su estado "Rendida" mientras tanto, así se ve la confirmación sin
 * tener que ir al Archivo, pero tampoco se acumulan ahí para siempre. N es
 * configurable desde Ajustes (`archive_retention_days`, default 5); si se
 * desactiva (null), esta función no hace nada — el archivado sigue existiendo solo
 * como acción manual.
 *
 * En todos los casos se excluye `restored_at IS NOT NULL`: si el vendedor restauró
 * la orden a propósito (está vieja igual, eso no cambia), este barrido no debe
 * volver a archivarla sola en la próxima pasada -- deshaciendo el restore sin que
 * el vendedor lo pida de nuevo.
 *
 * La fecha "desde cuándo" se toma de la columna dedicada cuando existe
 * (cancelled_at, refunded_at, net_settled_at) y cae a updated_at para
 * expired/failed, que no tienen columna propia.
 */
export async function archiveStaleOrders(): Promise<number> {
  const retentionDays = await getArchiveRetentionDays();
  if (retentionDays == null) return 0;

  const { rows } = await pool.query<{ id: number }>(
    `UPDATE orders o
        SET archived_at = NOW()
      WHERE o.archived_at IS NULL
        AND o.restored_at IS NULL
        AND (
          (o.status = 'cancelled' AND COALESCE(o.cancelled_at, o.updated_at) < NOW() - make_interval(days => $1))
          OR (o.status = 'refunded' AND COALESCE(o.refunded_at, o.updated_at) < NOW() - make_interval(days => $1))
          OR (o.status IN ('expired', 'failed') AND o.updated_at < NOW() - make_interval(days => $1))
          OR (
            o.status = 'paid' AND o.payment_method = 'cash'
            AND EXISTS (
              SELECT 1 FROM order_attributions a
               WHERE a.order_id = o.id
                 AND a.net_settled_at IS NOT NULL
                 AND a.net_settled_at < NOW() - make_interval(days => $1)
            )
          )
        )
      RETURNING o.id`,
    [retentionDays],
  );

  if (rows.length > 0) {
    console.log(`[auto-archive] ${rows.length} orden(es) archivada(s) automáticamente tras ${retentionDays} día(s).`);
  }
  return rows.length;
}

/** Arranca el barrido periódico de auto-archivado (más un barrido inicial al iniciar). */
export function startAutoArchiveJob(): void {
  archiveStaleOrders().catch((e) => console.error('[auto-archive] sweep inicial falló:', e));
  setInterval(() => {
    archiveStaleOrders().catch((e) => console.error('[auto-archive] sweep falló:', e));
  }, SWEEP_INTERVAL_MS);
}
