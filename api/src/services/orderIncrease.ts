// Cálculo puro de un AUMENTO de reserva (más pasajeros y/o traslado). Trabaja con
// precios CONGELADOS para tickets: el pasajero que se suma paga lo mismo que los
// originales. El traslado sigue la regla de "todo o nada" del checkout:
//   - Si la orden YA tenía traslado (transferQty > 0), se EXTIENDE siempre a todo
//     el grupo nuevo -- no es opcional, nunca puede quedar gente sin traslado en un
//     grupo que sí lo tiene. Se cobra al mismo precio congelado por pax.
//   - Si la orden NO tenía traslado y el tier lo permite ('optional'), se puede
//     activar ahora para TODO el grupo (viejo + nuevo) vía `addTransfer` -- se cobra
//     al precio ACTUAL de la casa (nunca existió un precio congelado que reusar).
//   - 'included': el traslado ya está en el precio de cada ticket, no genera cargo
//     aparte; solo se actualiza el contador para que quede coherente con los pax.
//   - 'none': nunca hay traslado, `addTransfer` no tiene efecto.
// Infantes nunca pagan entrada; su traslado reusa el mismo precio por pax que el
// resto del grupo, y solo aplica si el grupo termina con traslado activo.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface OrderIncreaseSnapshot {
  origAdults: number;
  origChildren: number;
  origInfants: number;
  unitPriceAdultUsd: number;
  unitPriceChildUsd: number | null;
  subtotalUsd: number;
  transferQty: number;        // pax (adultos+menores) con traslado ANTES del aumento
  infantTransferUsd: number;  // monto congelado del traslado de infantes ANTES del aumento
  transferMode: 'none' | 'optional' | 'included';
  // Precio ACTUAL por pax (ya resuelto por zona) -- solo se usa si el traslado se
  // activa por primera vez con esta operación (addTransfer=true y transferQty=0).
  transferPriceUsd: number;
  exchangeRateUsed: number;
}

export interface IncreaseTarget {
  adults: number;
  children: number;
  infants: number;
  // Solo tiene efecto cuando snap.transferMode === 'optional' && snap.transferQty === 0
  // (la orden nunca tuvo traslado): decide si se activa ahora para todo el grupo.
  addTransfer: boolean;
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
  extraInfants: number;
  newTransferQty: number;
  newInfantTransferUsd: number;
  // true si esta operación fue la que activó el traslado por primera vez (para que
  // el caller sepa que debe persistir hotel/habitación nuevos en order_items).
  transferAdded: boolean;
}

const fail = (error: string): IncreaseResult => ({
  ok: false, error,
  newSubtotalUsd: 0, newTotalArs: 0, chargeUsd: 0, chargeArs: 0,
  extraAdults: 0, extraChildren: 0, extraInfants: 0,
  newTransferQty: 0, newInfantTransferUsd: 0, transferAdded: false,
});

export function computeOrderIncrease(
  snap: OrderIncreaseSnapshot,
  target: IncreaseTarget,
): IncreaseResult {
  if (
    !Number.isInteger(target.adults) || !Number.isInteger(target.children) || !Number.isInteger(target.infants)
  ) {
    return fail('Cantidades inválidas.');
  }
  if (target.adults > 20 || target.children > 20 || target.infants > 20) return fail('Cantidad máxima superada.');
  if (target.adults < snap.origAdults || target.children < snap.origChildren || target.infants < snap.origInfants) {
    return fail('Esta operación es solo para AGREGAR. Para reducir pasajeros, usá la modificación con reintegro.');
  }
  if (target.children > snap.origChildren && (snap.unitPriceChildUsd == null)) {
    return fail('Esta opción no tiene precio para menores.');
  }
  const extraAdults = target.adults - snap.origAdults;
  const extraChildren = target.children - snap.origChildren;
  const extraInfants = target.infants - snap.origInfants;
  const activatesTransfer = snap.transferMode === 'optional' && snap.transferQty === 0 && target.addTransfer;
  if (extraAdults === 0 && extraChildren === 0 && extraInfants === 0 && !activatesTransfer) {
    return fail('No hay pasajeros nuevos ni traslado para agregar.');
  }

  const unitAdult = snap.unitPriceAdultUsd;
  const unitChild = snap.unitPriceChildUsd ?? 0;

  const ticketsPortion = round2(snap.origAdults * unitAdult + snap.origChildren * unitChild);
  // Todo lo que no son entradas (traslado de adultos/menores + traslado de infantes),
  // ya cobrado -- se separa igual que en orderReduction.ts para no duplicar cargos.
  const transferAndInfantPortion = Math.max(0, round2(snap.subtotalUsd - ticketsPortion));
  const oldTransferPortion = Math.max(0, round2(transferAndInfantPortion - snap.infantTransferUsd));
  const transferPerPaxFrozen = snap.transferQty > 0 ? oldTransferPortion / snap.transferQty : 0;

  const newAdultsChildrenPax = target.adults + target.children;

  let newTransferQty = 0;
  let transferAdded = false;
  let transferRatePerPax = 0; // solo relevante para transferMode === 'optional'
  if (snap.transferMode === 'optional') {
    if (snap.transferQty > 0) {
      // Ya tenía traslado → se extiende siempre a todo el grupo nuevo, mismo precio.
      newTransferQty = newAdultsChildrenPax;
      transferRatePerPax = transferPerPaxFrozen;
    } else if (activatesTransfer) {
      // Se activa por primera vez → cubre TODO el grupo (viejo + nuevo) a precio actual.
      newTransferQty = newAdultsChildrenPax;
      transferRatePerPax = snap.transferPriceUsd;
      transferAdded = true;
    }
  } else if (snap.transferMode === 'included') {
    // Ya viene en el precio de cada ticket -- solo se actualiza el contador.
    newTransferQty = newAdultsChildrenPax;
  }

  const newTransferPortion = snap.transferMode === 'optional'
    ? round2(transferRatePerPax * newTransferQty)
    : 0;

  // El traslado de infantes reusa el mismo precio por pax que se está usando arriba
  // (congelado si se extiende, actual si se activa recién) -- "mismo precio que un
  // adulto", igual que en el booking original.
  const infantTransferApplies = snap.transferMode === 'optional' && newTransferQty > 0;
  const newInfantTransferUsd = infantTransferApplies ? round2(transferRatePerPax * target.infants) : 0;

  const newTickets = round2(target.adults * unitAdult + target.children * unitChild);
  const newSubtotalUsd = round2(newTickets + newTransferPortion + newInfantTransferUsd);

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
    extraInfants,
    newTransferQty,
    newInfantTransferUsd,
    transferAdded,
  };
}
