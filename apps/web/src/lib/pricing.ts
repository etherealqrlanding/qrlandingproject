import type { ProductOption } from '../types/api';

export interface BookingTotals {
  ticketsUsd: number;
  transferUsd: number;
  infantTransferUsd: number;
  totalUsd: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Calcula el total de una reserva (entradas + traslado) para una option dada.
 * transferQty es la cantidad de pasajeros (0..adults+children) que llevan traslado —
 * solo suma costo cuando option.transfer_mode === 'optional' ('included' ya está en
 * el precio del tier, sin costo extra; 'none' nunca cobra traslado).
 * Los infantes nunca pagan entrada; solo generan cargo de traslado (reusando el mismo
 * transfer_price_usd de adultos) si el tier lo tiene habilitado y la reserva ya lleva
 * traslado.
 */
export function computeBookingTotals(
  option: ProductOption,
  adults: number,
  children: number,
  transferQty: number,
  supportsChildren: boolean,
  infants: number = 0,
): BookingTotals {
  const ticketsUsd = round2(
    option.price_adult_usd * adults + (supportsChildren ? (option.price_child_usd ?? 0) * children : 0),
  );
  const transferUsd = option.transfer_mode === 'optional'
    ? round2(option.transfer_price_usd * transferQty)
    : 0;
  const infantTransferApplies = option.transfer_mode === 'optional' && option.infant_transfer_chargeable && transferQty > 0;
  const infantTransferUsd = infantTransferApplies ? round2(option.transfer_price_usd * infants) : 0;
  const totalUsd = round2(ticketsUsd + transferUsd + infantTransferUsd);
  return { ticketsUsd, transferUsd, infantTransferUsd, totalUsd };
}
