import type { AboutContent, ApiResponse, Category, FaqContent, ProductDetail, ProductSummary } from '../types/api';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...init?.headers,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  const body = (await res.json()) as ApiResponse<T>;
  return body.data;
}

export interface CheckoutInput {
  option_id: number;
  service_date: string;          // YYYY-MM-DD
  adults: number;
  children: number;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    nationality?: string | null;
    dni?: string | null;
  };
  ref_code?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string };
  transfer_requested?: boolean;
  transfer_hotel?: string | null;
  transfer_room?: string | null;
}

export interface CheckoutResponse {
  order_public_id: string;
  preference_id: string;
  init_point: string;
  sandbox_init_point: string;
  total_usd: number;
  total_ars: number;
  exchange_rate: number;
}

export interface OrderStatus {
  public_id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  total_usd: number;
  total_ars: number;
  customer_email: string;
  customer_name: string;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  // Solo presentes en órdenes de PIX (para la página de pago).
  pix_qrcode?: string | null;
  pix_expires_at?: string | null;
  pix_fiat_amount_brl?: number | null;
  // Presentes mientras el pago todavía no se confirmó y lo que hay es un cupo
  // congelado (checkout_hold), no una orden real todavía.
  is_hold?: boolean;
  hold_expires_at?: string | null;
}

export interface CashCheckoutResponse {
  order_public_id: string;
  total_usd: number;
}

export interface PixCheckoutResponse {
  order_public_id: string;
  nautt_order_uuid: string;
  pix_qrcode: string;
  pix_expires_at: string | null;
  fiat_brl: number;
  total_usd: number;
}

export interface SellerPublicInfo {
  name: string;
  kind: string | null;
  is_permanent: boolean;
  // Solo viene poblado si el admin habilitó la personalización de landing para este
  // vendedor (socios comerciales) — ver components/RefBadge.tsx.
  branding: { logo_url: string | null; tagline: string | null; public_phone: string | null } | null;
}

export interface OrderVerification {
  public_id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
  customer_name: string;
  product_name: string;
  option_name: string;
  service_date: string;
  adults: number;
  children: number;
  transfer_requested: boolean;
  updated_at: string;
}

export interface AvailabilityDay {
  date: string;
  status: 'available' | 'low' | 'full' | 'closed';
  reason?: string;
  remaining?: number;
}

export const api = {
  categories: {
    list: () => request<Category[]>('/api/categories'),
  },
  products: {
    list: (params?: { category?: string }) => {
      const qs = params?.category ? `?category=${encodeURIComponent(params.category)}` : '';
      return request<ProductSummary[]>(`/api/products${qs}`);
    },
    bySlug: (slug: string) => request<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`),
  },
  availability: {
    forOption: (optionId: number, from: string, to: string, pax?: number) =>
      request<AvailabilityDay[]>(
        `/api/options/${optionId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${pax ? `&pax=${pax}` : ''}`,
      ),
    remainingForDate: (optionId: number, date: string) =>
      request<{ remaining: number; capacity: number; status: string; reason?: string }>(
        `/api/options/${optionId}/capacity?date=${encodeURIComponent(date)}`,
      ),
  },
  settings: {
    bookingCutoff: () => request<{ time: string | null }>('/api/settings/booking-cutoff'),
    bookingHorizon: () => request<{ months: number | null }>('/api/settings/booking-horizon'),
    exchangeRate: () => request<{ rate: number }>('/api/settings/exchange-rate'),
    whatsapp: () => request<{ number: string | null }>('/api/settings/whatsapp'),
  },
  status: {
    maintenance: () => request<{ maintenance: boolean }>('/health/status'),
  },
  content: {
    about: () => request<AboutContent>('/api/content/about'),
    faq: () => request<FaqContent>('/api/content/faq'),
  },
  checkout: {
    createPreference: (input: CheckoutInput) =>
      request<CheckoutResponse>('/api/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    createCashOrder: (input: CheckoutInput) =>
      request<CashCheckoutResponse>('/api/checkout/cash', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    createPixOrder: (input: CheckoutInput) =>
      request<PixCheckoutResponse>('/api/checkout/pix', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    refreshPix: (publicId: string) =>
      request<PixCheckoutResponse>(
        `/api/checkout/orders/${encodeURIComponent(publicId)}/pix-refresh`,
        { method: 'POST' },
      ),
    // Regenera el link de Mercado Pago para el MISMO hold cuando el anterior venció —
    // sin reiniciar el checkout ni perder el cupo (si todavía sigue disponible).
    refreshMp: (publicId: string) =>
      request<CheckoutResponse>(
        `/api/checkout/orders/${encodeURIComponent(publicId)}/mp-refresh`,
        { method: 'POST' },
      ),
    getOrder: (publicId: string) =>
      request<OrderStatus>(`/api/checkout/orders/${encodeURIComponent(publicId)}`),
    syncOrder: (publicId: string) =>
      request<{ status: OrderStatus['status']; synced: boolean }>(
        `/api/checkout/orders/${encodeURIComponent(publicId)}/sync`,
        { method: 'POST' },
      ),
    sellerInfo: (code: string) =>
      request<SellerPublicInfo>(`/api/checkout/seller-info?code=${encodeURIComponent(code)}`, { cache: 'no-store' }),
    verify: (publicId: string) =>
      request<OrderVerification>(`/api/checkout/orders/${encodeURIComponent(publicId)}/verify`, { cache: 'no-store' }),
  },
};

export { ApiError };
