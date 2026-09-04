// Cálculo puro de una REDUCCIÓN de reserva (menos pasajeros y/o quitar traslado).
// Trabaja solo con los precios CONGELADOS en la orden — no depende del precio actual
// de la opción, que pudo haber cambiado desde la compra.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface OrderReductionSnapshot {
  origAdults: number;
  origChildren: number;
  unitPriceAdultUsd: number;
  unitPriceChildUsd: number | null;
  subtotalUsd: number;         // total congelado del item (entradas + traslado + traslado de infantes)
  transferQty: number;         // cuántos de los orig pax tenían traslado
  origInfants: number;
  infantTransferUsd: number;   // monto congelado (no por-unidad) del traslado de infantes
  totalArs: number;            // ARS realmente cobrado por la orden
  exchangeRateUsed: number;
  // Tipo de cambio SIN el markup del admin, congelado en la orden -- se usa solo
  // para la comisión, nunca para el reintegro al cliente (ver getBaseExchangeRate).
  commissionExchangeRateUsed: number;
  commissionPercent: number | null; // % del vendedor (null si no hay atribución)
}

export interface ReductionTarget {
  adults: number;
  children: number;
  transferQty: number;
  infants: number;
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
  // Puede venir recortado respecto a target.transferQty si la nueva cantidad de
  // pax quedó por debajo — el caller debe persistir ESTE valor, no target.transferQty.
  newTransferQty: number;
  // Infantes son reduce-only, sin recorte automático (no dependen del total de pax) —
  // el caller persiste target.infants tal cual, pero se expone acá igual para que
  // ningún caller tenga que asumirlo por su cuenta.
  newInfants: number;
  newInfantTransferUsd: number;
}

const fail = (error: string): ReductionResult => ({
  ok: false, error,
  newSubtotalUsd: 0, newTotalArs: 0, refundUsd: 0, refundArs: 0,
  newCommissionUsd: null, newCommissionArs: null, newTransferQty: 0,
  newInfants: 0, newInfantTransferUsd: 0,
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
  if (
    !Number.isInteger(target.adults) || !Number.isInteger(target.children)
    || !Number.isInteger(target.transferQty) || !Number.isInteger(target.infants)
  ) {
    return fail('Cantidades inválidas.');
  }
  if (target.adults < 1) return fail('La reserva debe conservar al menos 1 adulto.');
  if (target.adults > snap.origAdults || target.children > snap.origChildren) {
    return fail('No se puede aumentar la reserva. Para agregar pasajeros, cancelá y creá una nueva.');
  }
  if (target.transferQty > snap.transferQty) {
    return fail('No se puede aumentar el traslado. Para sumarlo, cancelá y creá una nueva reserva.');
  }
  if (target.infants > snap.origInfants) {
    return fail('No se pueden aumentar los infantes. Para sumarlos, cancelá y creá una nueva reserva.');
  }

  const unitAdult = snap.unitPriceAdultUsd;
  const unitChild = snap.unitPriceChildUsd ?? 0;

  // Porción de traslado = lo que se cobró de más por encima de las entradas, MENOS
  // la porción de infantes (que se prorratea aparte, no comparte pool con transferQty).
  const ticketsPortion = round2(snap.origAdults * unitAdult + snap.origChildren * unitChild);
  const transferAndInfantPortion = Math.max(0, round2(snap.subtotalUsd - ticketsPortion));
  const transferPortion = Math.max(0, round2(transferAndInfantPortion - snap.infantTransferUsd));
  const transferPerPax = snap.transferQty > 0 ? transferPortion / snap.transferQty : 0;
  const infantTransferPerInfant = snap.origInfants > 0 ? snap.infantTransferUsd / snap.origInfants : 0;

  const newPax = target.adults + target.children;
  // Recorte defensivo: si la nueva cantidad de pax queda por debajo del traslado
  // pedido, el traslado se ajusta solo al nuevo total (no puede haber más pax con
  // traslado que pax totales). Infantes no depende del total de pax, no se recorta acá.
  const clampedTransferQty = Math.min(target.transferQty, newPax);
  const newTickets = round2(target.adults * unitAdult + target.children * unitChild);
  const newTransferPortion = round2(transferPerPax * clampedTransferQty);
  // Si se cancela el traslado del grupo (clampedTransferQty === 0), el de infantes se
  // cancela junto -- reusa el mismo traslado del grupo, no puede quedar huérfano
  // cobrándose por un traslado que ya no existe.
  const newInfantTransferUsd = clampedTransferQty > 0 ? round2(infantTransferPerInfant * target.infants) : 0;
  const newSubtotalUsd = round2(newTickets + newTransferPortion + newInfantTransferUsd);

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
    newCommissionArs = round2(newCommissionUsd * snap.commissionExchangeRateUsed);
  }

  return {
    ok: true,
    newSubtotalUsd,
    newTotalArs,
    refundUsd,
    refundArs,
    newCommissionUsd,
    newCommissionArs,
    newTransferQty: clampedTransferQty,
    newInfants: target.infants,
    newInfantTransferUsd,
  };
}
