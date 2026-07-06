// Recalcula el neto y la comisión de una venta en EFECTIVO cuando cambia la composición.
//
// Modelo efectivo (ver migración 016): el vendedor cobra el total y nos rinde el neto;
// su comisión = total − neto. Al modificar la reserva, escalamos el neto congelado en
// proporción al nuevo subtotal (usa solo datos congelados, no el precio actual de la
// opción). Sirve tanto para aumentos como para reducciones.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface CashRecomputeResult {
  newNetTotalUsd: number | null;   // null si la opción no tenía neto configurado
  newCommissionUsd: number;        // total − neto (o 0 si no hay neto)
}

export function recomputeCashCommission(
  netSnapshotUsd: number | null,
  origSubtotalUsd: number,
  newSubtotalUsd: number,
): CashRecomputeResult {
  if (netSnapshotUsd == null || origSubtotalUsd <= 0) {
    return { newNetTotalUsd: null, newCommissionUsd: 0 };
  }
  const newNetTotalUsd = round2(netSnapshotUsd * (newSubtotalUsd / origSubtotalUsd));
  const newCommissionUsd = Math.max(0, round2(newSubtotalUsd - newNetTotalUsd));
  return { newNetTotalUsd, newCommissionUsd };
}

// Alias explícito para el aumento (misma lógica; nombre que documenta la intención).
export const cashIncreaseCommission = recomputeCashCommission;
