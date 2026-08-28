import { pool } from '../db.js';
import { getSellerKindBaseCommission } from './settings.js';

// Perfiles válidos de vendedor (mismos valores que SELLER_KINDS en el front —
// apps/web/src/lib/sellerKinds.ts) más el bucket para vendedores sin perfil elegido.
export const SELLER_KIND_VALUES = ['recepcion', 'choferes', 'guias', 'agencias', 'freelance', 'comercios'] as const;
export const NULL_KIND_BUCKET = 'sin_especificar';
export const ALL_COMMISSION_KIND_KEYS = [...SELLER_KIND_VALUES, NULL_KIND_BUCKET] as const;

const clampPercent = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

/**
 * Comisión EFECTIVA para una venta puntual: base del perfil del vendedor (o
 * "sin_especificar" si no tiene kind elegido) + ajuste del TIER/servicio -- distintos
 * servicios de la misma casa pueden tener márgenes distintos -- salvo que exista un
 * override puntual para ese (tier, kind), que REEMPLAZA (no suma) el ajuste general.
 * Se calcula UNA sola vez al crear la orden (ver insertOrderItemAndAttribution en
 * repos/orders.ts) y queda congelada en order_attributions.commission_percent_snapshot
 * -- nunca se vuelve a derivar después (reducciones/ampliaciones reusan ese valor).
 */
export async function computeEffectiveCommissionPercent(
  sellerKind: string | null,
  optionId: number,
): Promise<number> {
  const kindKey = sellerKind ?? NULL_KIND_BUCKET;
  const [baseMap, { rows }] = await Promise.all([
    getSellerKindBaseCommission(),
    pool.query<{ general_adjustment: number; override_adjustment: number | null }>(
      `SELECT o.commission_adjustment_percent::float AS general_adjustment,
              k.adjustment_percent::float AS override_adjustment
         FROM product_options o
         LEFT JOIN option_kind_commission_adjustments k
                ON k.option_id = o.id AND k.seller_kind = $2
        WHERE o.id = $1 LIMIT 1`,
      [optionId, kindKey],
    ),
  ]);
  const base = baseMap[kindKey] ?? 10;
  const row = rows[0];
  const adjustment = row?.override_adjustment ?? row?.general_adjustment ?? 0;
  return clampPercent(base + adjustment);
}

/**
 * Variante en lote: la comisión efectiva de TODOS los tiers/servicios activos del
 * catálogo para un mismo perfil de vendedor, en un solo query -- para el portal del
 * vendedor (ver el catálogo completo antes de elegir qué vender), evitando N llamadas.
 */
export async function computeEffectiveCommissionPercentForCatalog(
  sellerKind: string | null,
): Promise<Record<number, number>> {
  const kindKey = sellerKind ?? NULL_KIND_BUCKET;
  const base = (await getSellerKindBaseCommission())[kindKey] ?? 10;

  const { rows } = await pool.query<{ id: number; general_adjustment: number; override_adjustment: number | null }>(
    `SELECT o.id, o.commission_adjustment_percent::float AS general_adjustment,
            k.adjustment_percent::float AS override_adjustment
       FROM product_options o
       LEFT JOIN option_kind_commission_adjustments k
              ON k.option_id = o.id AND k.seller_kind = $1
      WHERE o.is_active = TRUE`,
    [kindKey],
  );

  const result: Record<number, number> = {};
  for (const row of rows) {
    const adjustment = row.override_adjustment ?? row.general_adjustment ?? 0;
    result[row.id] = clampPercent(base + adjustment);
  }
  return result;
}
