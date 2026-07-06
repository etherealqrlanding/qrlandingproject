// Cálculo puro de una REDUCCIÓN de reserva (menos pasajeros y/o quitar traslado).
// Trabaja solo con los precios CONGELADOS en la orden — no depende del precio actual
// de la opción, que pudo haber cambiado desde la compra.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface OrderReductionSnapshot {
  origAdults: number;
  origChildren: number;
  unitPriceAdultUsd: number;
  unitPriceChildUsd: number | null;
  subtotalUsd: number;         // total congelado del item (entradas + traslado)
  transferRequested: boolean;
  totalArs: number;            // ARS realmente cobrado por la orden
  exchangeRateUsed: number;
  commissionPercent: number | null; // % del vendedor (null si no hay atribución)
}

export interface ReductionTarget {
  adults: number;
  children: number;
  transferRequested: boolean;
}

export interface ReductionResult {
  ok: boolean;
  error?: string;
  newSubtotalUsd: number;
  newTotalArs: number;
  refundUsd: number;
  refundArs: number;
  newCommissionUsd: number | null;
  newCommissionArs: number | null;
}

const fail = (error: string): ReductionResult => ({
  ok: false, error,
  newSubtotalUsd: 0, newTotalArs: 0, refundUsd: 0, refundArs: 0,
  newCommissionUsd: null, newCommissionArs: null,
});

/**
 * Valida y calcula el resultado de reducir una reserva a una nueva composición.
 * Reglas: solo se puede REDUCIR (menos adultos/menores, o quitar traslado); agregar
 * se maneja cancelando y recreando. Devuelve el nuevo subtotal, el delta a reintegrar
 * (USD y ARS proporcional a lo cobrado) y la comisión recalculada.
 */
export function computeOrderReduction(
  snap: OrderReductionSnapshot,
  target: ReductionTarget,
): ReductionResult {
  if (!Number.isInteger(target.adults) || !Number.isInteger(target.children)) {
    return fail('Cantidades inválidas.');
  }
  if (target.adults < 1) return fail('La reserva debe conservar al menos 1 adulto.');
  if (target.adults > snap.origAdults || target.children > snap.origChildren) {
    return fail('No se puede aumentar la reserva. Para agregar pasajeros, cancelá y creá una nueva.');
  }
  if (target.transferRequested && !snap.transferRequested) {
    return fail('No se puede agregar traslado. Para sumarlo, cancelá y creá una nueva reserva.');
  }

  const unitAdult = snap.unitPriceAdultUsd;
  const unitChild = snap.unitPriceChildUsd ?? 0;

  // Porción de traslado = lo que se cobró de más por encima de las entradas.
  const ticketsPortion = round2(snap.origAdults * unitAdult + snap.origChildren * unitChild);
  const transferPortion = Math.max(0, round2(snap.subtotalUsd - ticketsPortion));
  const origPax = snap.origAdults + snap.origChildren;
  const transferPerPax = (snap.transferRequested && origPax > 0) ? transferPortion / origPax : 0;

  const newPax = target.adults + target.children;
  const newTickets = round2(target.adults * unitAdult + target.children * unitChild);
  const newTransferPortion = target.transferRequested ? round2(transferPerPax * newPax) : 0;
  const newSubtotalUsd = round2(newTickets + newTransferPortion);

  const refundUsd = round2(snap.subtotalUsd - newSubtotalUsd);
  if (refundUsd <= 0) {
    return fail('La nueva composición no genera ningún reintegro (no hay cambios que reduzcan el total).');
  }

  // ARS proporcional a lo REALMENTE cobrado → nunca se reintegra más de lo pagado.
  const refundArs = snap.subtotalUsd > 0
    ? Math.round((refundUsd / snap.subtotalUsd) * snap.totalArs)
    : 0;
  const newTotalArs = round2(snap.totalArs - refundArs);

  let newCommissionUsd: number | null = null;
  let newCommissionArs: number | null = null;
  if (snap.commissionPercent != null) {
    newCommissionUsd = round2(newSubtotalUsd * snap.commissionPercent / 100);
    newCommissionArs = round2(newCommissionUsd * snap.exchangeRateUsed);
  }

  return {
    ok: true,
    newSubtotalUsd,
    newTotalArs,
    refundUsd,
    refundArs,
    newCommissionUsd,
    newCommissionArs,
  };
}
