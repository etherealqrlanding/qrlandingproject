import type { ProductOption } from '../types/api';

export interface BookingTotals {
  ticketsUsd: number;
  transferUsd: number;
  totalUsd: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Calcula el total de una reserva (entradas + traslado) para una option dada.
 * transferQty es la cantidad de pasajeros (0..adults+children) que llevan traslado —
 * solo suma costo cuando option.transfer_mode === 'optional' ('included' ya está en
 * el precio del tier, sin costo extra; 'none' nunca cobra traslado).
 */
export function computeBookingTotals(
  option: ProductOption,
  adults: number,
  children: number,
  transferQty: number,
  supportsChildren: boolean,
): BookingTotals {
  const ticketsUsd = round2(
    option.price_adult_usd * adults + (supportsChildren ? (option.price_child_usd ?? 0) * children : 0),
  );
  const transferUsd = option.transfer_mode === 'optional'
    ? round2(option.transfer_price_usd * transferQty)
    : 0;
  const totalUsd = round2(ticketsUsd + transferUsd);
  return { ticketsUsd, transferUsd, totalUsd };
}
