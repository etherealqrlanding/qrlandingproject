import { getExchangeRateMode, setExchangeRateFromAuto } from './settings.js';

const SYNC_INTERVAL_MS = 30 * 60_000; // la cotización oficial no se mueve seguido
const DOLARAPI_OFICIAL_URL = 'https://dolarapi.com/v1/dolares/oficial';

interface DolarApiResponse {
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

// "venta" = lo que cuesta comprar 1 USD en pesos, que es exactamente lo que necesitamos
// para cobrarle al cliente en ARS un servicio con precio de lista en USD.
export async function fetchOficialVentaRate(): Promise<number> {
  const res = await fetch(DOLARAPI_OFICIAL_URL);
  if (!res.ok) throw new Error(`dolarapi.com respondió ${res.status}`);
  const data = (await res.json()) as DolarApiResponse;
  if (typeof data.venta !== 'number' || data.venta <= 0) {
    throw new Error('dolarapi.com: campo "venta" inválido en la respuesta');
  }
  return data.venta;
}

/** Sincroniza el tipo de cambio desde dolarapi.com, pero solo si el modo configurado es "auto". */
export async function syncExchangeRateIfAuto(): Promise<void> {
  const mode = await getExchangeRateMode();
  if (mode !== 'auto') return;
  const rate = await fetchOficialVentaRate();
  await setExchangeRateFromAuto(rate);
  console.log(`[exchange-rate] sincronizado automáticamente: 1 USD = ${rate} ARS (oficial, venta)`);
}

/** Arranca el barrido periódico de sync (más un barrido inicial al iniciar). */
export function startExchangeRateSyncJob(): void {
  syncExchangeRateIfAuto().catch((e) => console.error('[exchange-rate] sync inicial falló:', e));
  setInterval(() => {
    syncExchangeRateIfAuto().catch((e) => console.error('[exchange-rate] sync falló:', e));
  }, SYNC_INTERVAL_MS);
}
