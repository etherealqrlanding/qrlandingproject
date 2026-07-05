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
  };
  ref_code?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string };
  transfer_requested?: boolean;
  transfer_hotel?: string | null;
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
  payment_method: 'mercadopago' | 'cash';
}

export interface CashCheckoutResponse {
  order_public_id: string;
  total_usd: number;
}

export interface SellerPublicInfo {
  name: string;
  kind: string | null;
  is_permanent: boolean;
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
    forOption: (optionId: number, from: string, to: string) =>
      request<AvailabilityDay[]>(
        `/api/options/${optionId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    remainingForDate: (optionId: number, date: string) =>
      request<{ remaining: number; capacity: number; status: string; reason?: string }>(
        `/api/options/${optionId}/capacity?date=${encodeURIComponent(date)}`,
      ),
  },
  settings: {
    bookingCutoff: () => request<{ time: string | null }>('/api/settings/booking-cutoff'),
    exchangeRate: () => request<{ rate: number }>('/api/settings/exchange-rate'),
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
    getOrder: (publicId: string) =>
      request<OrderStatus>(`/api/checkout/orders/${encodeURIComponent(publicId)}`),
    sellerInfo: (code: string) =>
      request<SellerPublicInfo>(`/api/checkout/seller-info?code=${encodeURIComponent(code)}`, { cache: 'no-store' }),
  },
};

export { ApiError };
