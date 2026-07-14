import { pool } from '../db.js';
import { getArchiveRetentionDays } from './settings.js';

const SWEEP_INTERVAL_MS = 15 * 60_000; // cada 15 minutos, igual que el barrido de caducidad

/**
 * Archiva automáticamente las órdenes en un estado final (cancelada, reintegrada,
 * caducada o fallida) que llevan más de N días así, sin que un admin las haya
 * archivado a mano todavía. N es configurable desde Ajustes (`archive_retention_days`,
 * default 5); si se desactiva (null), esta función no hace nada — el archivado
 * sigue existiendo solo como acción manual.
 *
 * La fecha "desde cuándo" se toma de la columna dedicada cuando existe
 * (cancelled_at, refunded_at) y cae a updated_at para expired/failed, que no
 * tienen columna propia.
 */
export async function archiveStaleOrders(): Promise<number> {
  const retentionDays = await getArchiveRetentionDays();
  if (retentionDays == null) return 0;

  const { rows } = await pool.query<{ id: number }>(
    `UPDATE orders
        SET archived_at = NOW()
      WHERE archived_at IS NULL
        AND (
          (status = 'cancelled' AND COALESCE(cancelled_at, updated_at) < NOW() - make_interval(days => $1))
          OR (status = 'refunded' AND COALESCE(refunded_at, updated_at) < NOW() - make_interval(days => $1))
          OR (status IN ('expired', 'failed') AND updated_at < NOW() - make_interval(days => $1))
        )
      RETURNING id`,
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
