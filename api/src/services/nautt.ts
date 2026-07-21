// Wrapper sobre la API de Nautt Finance para cobrar con PIX (on-ramp: el cliente paga
// en reales por PIX y la cuenta recibe USDT). Espeja el rol de services/mercadopago.ts.
//
// Flujo de cobro (validado en vivo contra producción):
//   1. POST /pricing/panel/buy  → quote_uuid (válido 5 min) a partir de amount_usd.
//   2. POST /orders/onramp      → order uuid + payment_data.pix_qrcode ("copia e cola") + expiración.
//   3. GET  /orders/{uuid}      → estado en vivo (respaldo del webhook).
//
// Autenticación: header X-API-Key. Base URL y UUIDs vienen de config.
import { config } from '../config.js';

const API_VERSION_PREFIX = '/api/v2';

export class NauttError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'NauttError';
    this.status = status;
    this.code = code;
  }
}

interface NauttEnvelope<T> {
  message?: string;
  code?: string;
  data?: T;
}

async function nauttFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!config.NAUTT_API_KEY) {
    throw new NauttError('El cobro con PIX no está configurado (falta NAUTT_API_KEY).', 503, 'nautt.not_configured');
  }
  let res: Response;
  try {
    res = await fetch(`${config.NAUTT_BASE_URL}${API_VERSION_PREFIX}${path}`, {
      ...init,
      headers: {
        'X-API-Key': config.NAUTT_API_KEY,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new NauttError(`No se pudo contactar a Nautt: ${(err as Error).message}`, 502, 'nautt.network_error');
  }
  const text = await res.text();
  let body: NauttEnvelope<T> & Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text } as never;
  }
  if (!res.ok) {
    const message = (body.message as string) || `Nautt respondió ${res.status}`;
    throw new NauttError(message, res.status, body.code as string | undefined);
  }
  return body.data as T;
}

// ─── Quote (cotización BRL a partir de USD) ───────────────────────────────
interface NauttQuoteData {
  quote_uuid: string;
  amount: number;        // monto en BRL que pagará el cliente
  amount_usd: number;    // USDT neto que recibiremos (después del spread de Nautt)
  price: number;         // tasa BRL/USD usada
  min_deposit?: number;
}

/**
 * Cotiza cuánto BRL debe pagar el cliente para cubrir `amountUsd` (nuestro total en USD).
 * Nautt aplica su tasa live (usd_buy); el neto en USDT que recibimos es levemente menor
 * por su spread (análogo al fee de Mercado Pago). El quote vence a los 5 minutos.
 */
export async function createPixQuote(amountUsd: number): Promise<NauttQuoteData> {
  return nauttFetch<NauttQuoteData>('/pricing/panel/buy', {
    method: 'POST',
    body: JSON.stringify({
      currency_uuid: config.NAUTT_CURRENCY_UUID_BRL,
      exchange_currency_uuid: config.NAUTT_PIX_EXCHANGE_UUID,
      amount_usd: amountUsd.toFixed(2),
    }),
  });
}

// ─── On-ramp order (genera el QR PIX) ─────────────────────────────────────
interface NauttOrderData {
  uuid: string;
  status: string;
  fiat_amount: string;
  crypto_amount?: string;
  nautt_quote?: string;
  expire_at?: string;
  currency?: { symbol?: string };
  payment_data?: {
    payment_method?: string;
    pix_qrcode?: string;
    pix_expires_at?: string;
    pix_status?: string;
  };
}

export interface PixCharge {
  nauttOrderUuid: string;
  status: string;
  pixQrcode: string;
  pixExpiresAt: Date | null;
  fiatAmountBrl: number;
}

/**
 * Abre una orden on-ramp PIX contra un quote ya obtenido y devuelve el "copia e cola"
 * (pix_qrcode) para renderizar el QR en nuestra página. `orderRef` (el public_id de la
 * orden interna) viaja en additional_infos como referencia hacia el proveedor.
 */
export async function createPixOnrampOrder(input: {
  quoteUuid: string;
  orderRef: string;
  description?: string;
}): Promise<PixCharge> {
  const data = await nauttFetch<NauttOrderData>('/orders/onramp', {
    method: 'POST',
    body: JSON.stringify({
      quote_uuid: input.quoteUuid,
      description: input.description?.slice(0, 500),
      additional_infos: [{ key: 'order_ref', value: input.orderRef }],
    }),
  });
  const qrcode = data.payment_data?.pix_qrcode;
  if (!qrcode) {
    throw new NauttError('Nautt no devolvió el QR de PIX para la orden.', 502, 'nautt.no_pix_qrcode');
  }
  return {
    nauttOrderUuid: data.uuid,
    status: data.status,
    pixQrcode: qrcode,
    // Preferimos expire_at (nivel orden): viene en ISO con offset (+00:00), sin ambigüedad
    // de zona horaria. pix_expires_at llega como "YYYY-MM-DD HH:mm:ss" en hora local de
    // Brasil (sin tz), así que solo lo usamos de respaldo.
    pixExpiresAt: parseNauttDate(data.expire_at ?? data.payment_data?.pix_expires_at),
    fiatAmountBrl: Number.parseFloat(data.fiat_amount),
  };
}

/**
 * Cobro PIX completo en un paso: cotiza y abre la orden on-ramp.
 * `amountUsd` es el total de la orden interna en USD.
 */
export async function createPixCharge(input: {
  amountUsd: number;
  orderRef: string;
  description?: string;
}): Promise<PixCharge> {
  const quote = await createPixQuote(input.amountUsd);
  return createPixOnrampOrder({
    quoteUuid: quote.quote_uuid,
    orderRef: input.orderRef,
    description: input.description,
  });
}

/** Consulta el estado en vivo de una orden Nautt (respaldo del webhook). */
export async function getNauttOrder(uuid: string): Promise<{ uuid: string; status: string; pixStatus?: string }> {
  const data = await nauttFetch<NauttOrderData>(`/orders/${encodeURIComponent(uuid)}`, { method: 'GET' });
  return { uuid: data.uuid, status: data.status, pixStatus: data.payment_data?.pix_status };
}

// Nautt devuelve fechas ISO (con offset) o "YYYY-MM-DD HH:mm:ss" (pix_expires_at). Toleramos ambas.
function parseNauttDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Traduce el estado de una orden Nautt al estado interno de nuestra orden.
 * - processing/paid/finished → 'paid': una vez que Nautt confirmó que el PIX llegó
 *   (aunque siga procesando la conversión a USDT), la reserva se da por pagada.
 * - rejected → 'failed'; canceled → 'cancelled'; refunded → 'refunded'.
 * - new/expired/desconocido → 'pending': el barrido de caducidad interno decide cuándo
 *   caducar los abandonos, igual que con Mercado Pago (misma terminología "Caducada").
 */
export function mapNauttStatusToOrderStatus(status: string | null | undefined):
  'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' {
  switch ((status ?? '').toLowerCase()) {
    case 'processing':
    case 'paid':
    case 'finished':
      return 'paid';
    case 'rejected':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'new':
    case 'expired':
    default:
      return 'pending';
  }
}
