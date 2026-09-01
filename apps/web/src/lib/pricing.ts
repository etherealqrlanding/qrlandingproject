import type { ProductOption } from '../types/api';
import type { TransferZone } from './hotels';

export interface BookingTotals {
  ticketsUsd: number;
  transferUsd: number;
  infantTransferUsd: number;
  totalUsd: number;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// Precio de traslado por pax para una zona dada -- transfer_price_usd_palermo es
// opcional (no todas las casas distinguen por zona): si no está cargado, se usa
// siempre el precio base sin importar la zona.
export function transferUnitPrice(option: ProductOption, zone: TransferZone): number {
  return zone === 'palermo' && option.transfer_price_usd_palermo != null
    ? option.transfer_price_usd_palermo
    : option.transfer_price_usd;
}

// Rango de precio de traslado de un tier -- min/max entre las zonas configuradas.
// hasZonePricing = false cuando la casa no distingue por zona (o ambos precios
// son iguales), para no mostrar "desde" innecesariamente en la card.
export function transferPriceRange(option: ProductOption): { min: number; max: number; hasZonePricing: boolean } {
  const base = option.transfer_price_usd;
  const palermo = option.transfer_price_usd_palermo;
  if (palermo == null || palermo === base) return { min: base, max: base, hasZonePricing: false };
  return { min: Math.min(base, palermo), max: Math.max(base, palermo), hasZonePricing: true };
}

/**
 * Calcula el total de una reserva (entradas + traslado) para una option dada.
 * transferQty es la cantidad de adultos+menores con traslado — siempre automática
 * (todos los pax), nunca elegida a mano. Solo suma costo cuando
 * option.transfer_mode === 'optional' ('included' ya está en el precio del tier,
 * sin costo extra; 'none' nunca cobra traslado).
 * Los infantes nunca pagan entrada, pero siempre pagan traslado (mismo precio por
 * pax que un adulto, según la zona) en cuanto el tier tiene traslado con costo —
 * ocupan lugar en el vehículo igual que cualquier otro pasajero.
 * `transferZone` default 'centro': antes de que el cliente elija su hotel (o si la
 * casa no distingue por zona) se usa el precio base, que es el más conservador
 * para mostrar como estimado en la card.
 */
export function computeBookingTotals(
  option: ProductOption,
  adults: number,
  children: number,
  transferQty: number,
  supportsChildren: boolean,
  infants: number = 0,
  transferZone: TransferZone = 'centro',
): BookingTotals {
  const ticketsUsd = round2(
    option.price_adult_usd * adults + (supportsChildren ? (option.price_child_usd ?? 0) * children : 0),
  );
  const unitPrice = transferUnitPrice(option, transferZone);
  const transferUsd = option.transfer_mode === 'optional'
    ? round2(unitPrice * transferQty)
    : 0;
  const infantTransferApplies = option.transfer_mode === 'optional' && transferQty > 0;
  const infantTransferUsd = infantTransferApplies ? round2(unitPrice * infants) : 0;
  const totalUsd = round2(ticketsUsd + transferUsd + infantTransferUsd);
  return { ticketsUsd, transferUsd, infantTransferUsd, totalUsd };
}
