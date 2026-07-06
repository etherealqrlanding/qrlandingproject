// Cálculo puro de un AUMENTO de reserva (más pasajeros). Igual que la reducción,
// trabaja con precios CONGELADOS: el pasajero que se suma paga lo mismo que los
// originales, y el traslado (si la reserva ya lo tenía) se prorratea por pax.
// No permite togglear el traslado acá: agregar/quitar traslado se maneja aparte.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface OrderIncreaseSnapshot {
  origAdults: number;
  origChildren: number;
  unitPriceAdultUsd: number;
  unitPriceChildUsd: number | null;
  subtotalUsd: number;
  transferRequested: boolean;
  exchangeRateUsed: number;
}

export interface IncreaseTarget {
  adults: number;
  children: number;
}

export interface IncreaseResult {
  ok: boolean;
  error?: string;
  newSubtotalUsd: number;
  newTotalArs: number;
  chargeUsd: number;   // diferencia a cobrar
  chargeArs: number;
  extraAdults: number;
  extraChildren: number;
}

const fail = (error: string): IncreaseResult => ({
  ok: false, error,
  newSubtotalUsd: 0, newTotalArs: 0, chargeUsd: 0, chargeArs: 0,
  extraAdults: 0, extraChildren: 0,
});

export function computeOrderIncrease(
  snap: OrderIncreaseSnapshot,
  target: IncreaseTarget,
): IncreaseResult {
  if (!Number.isInteger(target.adults) || !Number.isInteger(target.children)) {
    return fail('Cantidades inválidas.');
  }
  if (target.adults > 20 || target.children > 20) return fail('Cantidad máxima superada.');
  if (target.adults < snap.origAdults || target.children < snap.origChildren) {
    return fail('Esta operación es solo para AGREGAR. Para reducir pasajeros, usá la modificación con reintegro.');
  }
  if (target.children > snap.origChildren && (snap.unitPriceChildUsd == null)) {
    return fail('Esta opción no tiene precio para menores.');
  }
  const extraAdults = target.adults - snap.origAdults;
  const extraChildren = target.children - snap.origChildren;
  if (extraAdults === 0 && extraChildren === 0) {
    return fail('No hay pasajeros nuevos para agregar.');
  }

  const unitAdult = snap.unitPriceAdultUsd;
  const unitChild = snap.unitPriceChildUsd ?? 0;

  // Porción de traslado congelada, prorrateada por pax (misma lógica que la reducción).
  const ticketsPortion = round2(snap.origAdults * unitAdult + snap.origChildren * unitChild);
  const transferPortion = Math.max(0, round2(snap.subtotalUsd - ticketsPortion));
  const origPax = snap.origAdults + snap.origChildren;
  const transferPerPax = (snap.transferRequested && origPax > 0) ? transferPortion / origPax : 0;

  const newPax = target.adults + target.children;
  const newTickets = round2(target.adults * unitAdult + target.children * unitChild);
  const newTransferPortion = snap.transferRequested ? round2(transferPerPax * newPax) : 0;
  const newSubtotalUsd = round2(newTickets + newTransferPortion);

  const chargeUsd = round2(newSubtotalUsd - snap.subtotalUsd);
  if (chargeUsd <= 0) return fail('El aumento no genera ningún cobro adicional.');

  // El delta se cobra al MISMO tipo de cambio congelado, para que la orden quede coherente.
  const newTotalArs = round2(newSubtotalUsd * snap.exchangeRateUsed);
  const origTotalArsCoherent = round2(snap.subtotalUsd * snap.exchangeRateUsed);
  const chargeArs = round2(newTotalArs - origTotalArsCoherent);

  return {
    ok: true,
    newSubtotalUsd,
    newTotalArs,
    chargeUsd,
    chargeArs,
    extraAdults,
    extraChildren,
  };
}
