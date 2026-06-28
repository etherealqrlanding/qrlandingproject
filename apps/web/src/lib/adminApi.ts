// Cliente para los endpoints /api/admin/*: añade Authorization: Bearer <jwt>
// usando el access token vigente de Supabase.
import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

export class AdminApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'AdminApiError';
  }
  get isAuthError(): boolean { return this.status === 401 || this.status === 403; }
  get isTransient(): boolean { return this.status === 0 || this.status >= 500; }
}

// Mutex para evitar múltiples refresh concurrentes que se invalidan entre sí
let refreshInFlight: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) return null;
      return refreshed.session.access_token;
    })().finally(() => {
      // Liberamos el lock con un pequeño delay para coalescer requests muy cercanas
      setTimeout(() => { refreshInFlight = null; }, 100);
    });
  }
  return refreshInFlight;
}

async function getValidToken(forceRefresh = false): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  if (forceRefresh || isTokenNearExpiry(data.session)) {
    const refreshed = await refreshOnce();
    if (refreshed) token = refreshed;
    else throw new AdminApiError(401, 'Session expired');
  }

  if (!token) throw new AdminApiError(401, 'No active session');
  return token;
}

function isTokenNearExpiry(session: { expires_at?: number } | null): boolean {
  if (!session?.expires_at) return false;
  // Refresh si quedan menos de 60s
  return session.expires_at * 1000 - Date.now() < 60_000;
}

async function doFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let token: string;
  try {
    token = await getValidToken();
  } catch (err) {
    if (err instanceof AdminApiError) throw err;
    throw new AdminApiError(0, 'Network error obtaining session');
  }

  let res: Response;
  try {
    res = await doFetch(path, token, init);
  } catch (err) {
    // Errores de red (sin status code) → transitorio, no auth
    throw new AdminApiError(0, `Sin conexión con el servidor: ${(err as Error).message}`);
  }

  // 401 → token podría haber expirado en el medio, intentamos refresh y reintento
  if (res.status === 401) {
    try {
      token = await getValidToken(true);
      res = await doFetch(path, token, init);
    } catch {
      // Refresh falló de verdad: sesión muerta
      await supabase.auth.signOut().catch(() => {});
      throw new AdminApiError(401, 'Tu sesión expiró. Volvé a iniciar sesión.');
    }
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let details;
    try {
      const body = await res.json();
      message = body?.error ?? message;
      details = body?.details;
    } catch { /* ignore */ }
    throw new AdminApiError(res.status, message, details);
  }
  const body = await res.json();
  return body.data;
}

export interface AdminMe {
  admin: {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'operator';
    full_name: string | null;
  };
  stats: { products: number; orders_paid: number; orders_pending: number };
}

export interface AdminCategory {
  id: number; slug: string; name_es: string; name_en: string;
  display_order: number; is_active: boolean;
}

export interface AdminProductOptionPreview {
  id: number; code: string; name_es: string;
  price_adult_usd: number | null;
  price_child_usd: number | null;
  net_price_adult_usd: number | null;
  net_price_child_usd: number | null;
  net_price_currency: 'USD' | 'ARS' | null;
  net_price_adult_ars: number | null;
  net_price_child_ars: number | null;
  net_transfer_price_ars: number | null;
  has_transfer: boolean;
  transfer_price_usd: number | null;
  net_transfer_price_usd: number | null;
  default_capacity_per_day: number;
  is_active: boolean;
  display_order: number;
}

export interface AdminProductSummary {
  id: number; slug: string; name: string; venue_name: string;
  is_active: boolean; display_order: number;
  starting_price_usd: number | null;
  category_id: number; category_slug: string; category_name_es: string;
  options_count: string; images_count: string;
  updated_at: string;
  options: AdminProductOptionPreview[];
}

export interface AdminProductDetail {
  id: number; slug: string; name: string; venue_name: string;
  category_id: number;
  short_description_es: string | null; short_description_en: string | null;
  long_description_es: string | null; long_description_en: string | null;
  address_es: string | null; address_en: string | null;
  schedule_summary_es: string | null; schedule_summary_en: string | null;
  starting_price_usd: number | null;
  is_active: boolean; display_order: number;
  options: AdminOption[];
  images: AdminImage[];
}

export interface AdminOption {
  id: number; code: string;
  name_es: string; name_en: string;
  description_es: string | null; description_en: string | null;
  includes_es: string[]; includes_en: string[];
  price_adult_usd: number | string; price_child_usd: number | string | null;
  net_price_adult_usd: number | string | null;
  net_price_child_usd: number | string | null;
  has_dinner: boolean; has_transfer: boolean;
  transfer_price_usd: number;
  net_transfer_price_usd: number | string | null;
  net_price_currency: 'USD' | 'ARS' | null;
  net_price_adult_ars: number | string | null;
  net_price_child_ars: number | string | null;
  net_transfer_price_ars: number | string | null;
  available_days: number[];
  pickup_window_es: string | null; pickup_window_en: string | null;
  dinner_time_es: string | null; dinner_time_en: string | null;
  show_time_es: string | null; show_time_en: string | null;
  default_capacity_per_day: number;
  low_availability_threshold: number;
  show_remaining_count: boolean;
  display_order: number; is_active: boolean;
}

export interface AdminImage {
  id: number; url: string; alt_text: string | null;
  is_hero: boolean; display_order: number;
}

export interface UploadSignedResponse {
  upload_url: string;
  token: string;
  path: string;
  public_url: string;
}

export interface AdminSeller {
  id: number;
  code: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  kind: string | null;
  commission_percent: number;
  notes: string | null;
  is_active: boolean;
  is_permanent: boolean;
  created_at: string;
  supabase_user_id?: string | null;
  orders_total?: number;
  orders_paid?: number;
  revenue_paid_usd?: number;
  commission_paid_usd?: number;
  commission_pending_payment_usd?: number;
}

export interface AdminSellerOrder {
  order_id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  total_usd: number;
  service_date: string;
  product_name: string;
  option_name: string;
  commission_amount_usd: number;
  paid_to_seller_at: string | null;
  created_at: string;
}

export interface AdminOrderListItem {
  id: number;
  public_id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  customer_name: string;
  customer_email: string;
  customer_nationality: string | null;
  total_usd: number;
  total_ars: number;
  ref_code: string | null;
  mp_payment_status: string | null;
  product_name: string | null;
  option_name: string | null;
  service_date: string | null;
  adults: number | null;
  children: number | null;
  seller_id: number | null;
  seller_code: string | null;
  seller_name: string | null;
  commission_amount_usd: number | null;
  paid_to_seller_at: string | null;
  payment_method: 'mercadopago' | 'cash';
  created_at: string;
  paid_at: string | null;
}

export interface AdminSetting {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
}

export const adminApi = {
  me: () => request<AdminMe>('/api/admin/me'),
  categories: {
    list: () => request<AdminCategory[]>('/api/admin/categories'),
  },
  products: {
    list: () => request<AdminProductSummary[]>('/api/admin/products'),
    get: (id: number) => request<AdminProductDetail>(`/api/admin/products/${id}`),
    create: (input: Partial<AdminProductDetail>) =>
      request<AdminProductDetail>('/api/admin/products', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<AdminProductDetail>) =>
      request<AdminProductDetail>(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    // Sin opts → soft delete (desactiva). { hard: true } → borrado definitivo
    // (devuelve 409 si el producto aparece en órdenes históricas).
    delete: (id: number, opts?: { hard?: boolean }) =>
      request<{ ok: true }>(`/api/admin/products/${id}${opts?.hard ? '?mode=hard' : ''}`, { method: 'DELETE' }),
    options: {
      create: (productId: number, input: Partial<AdminOption>) =>
        request<{ id: number }>(`/api/admin/products/${productId}/options`, {
          method: 'POST', body: JSON.stringify(input),
        }),
      update: (optionId: number, input: Partial<AdminOption>) =>
        request<{ ok: true }>(`/api/admin/products/options/${optionId}`, {
          method: 'PATCH', body: JSON.stringify(input),
        }),
      delete: (optionId: number) =>
        request<{ ok: true }>(`/api/admin/products/options/${optionId}`, { method: 'DELETE' }),
    },
    images: {
      create: (productId: number, input: Partial<AdminImage>) =>
        request<{ id: number }>(`/api/admin/products/${productId}/images`, {
          method: 'POST', body: JSON.stringify(input),
        }),
      update: (imageId: number, input: Partial<AdminImage>) =>
        request<{ ok: true }>(`/api/admin/products/images/${imageId}`, {
          method: 'PATCH', body: JSON.stringify(input),
        }),
      delete: (imageId: number) =>
        request<{ ok: true }>(`/api/admin/products/images/${imageId}`, { method: 'DELETE' }),
    },
  },
  options: {
    availability: {
      list: (optionId: number) =>
        request<Array<{ id: number; date: string; capacity_override: number | null; is_closed: boolean; notes: string | null }>>(
          `/api/admin/products/options/${optionId}/availability`,
        ),
      upsert: (optionId: number, input: { date: string; capacity_override?: number | null; is_closed?: boolean; notes?: string | null }) =>
        request<{ id: number }>(`/api/admin/products/options/${optionId}/availability`, {
          method: 'POST', body: JSON.stringify(input),
        }),
      delete: (availabilityId: number) =>
        request<{ ok: true }>(`/api/admin/products/availability/${availabilityId}`, { method: 'DELETE' }),
    },
  },
  uploads: {
    sign: (filename: string, contentType: string) =>
      request<UploadSignedResponse>('/api/admin/uploads/sign', {
        method: 'POST',
        body: JSON.stringify({ filename, content_type: contentType }),
      }),
  },
  sellers: {
    list: () => request<AdminSeller[]>('/api/admin/sellers'),
    get: (id: number) => request<AdminSeller>(`/api/admin/sellers/${id}`),
    create: (input: Partial<AdminSeller> & { commission_percent: number }) =>
      request<AdminSeller>('/api/admin/sellers', {
        method: 'POST', body: JSON.stringify(input),
      }),
    update: (id: number, input: Partial<AdminSeller>) =>
      request<AdminSeller>(`/api/admin/sellers/${id}`, {
        method: 'PATCH', body: JSON.stringify(input),
      }),
    delete: (id: number) =>
      request<{ ok: true }>(`/api/admin/sellers/${id}`, { method: 'DELETE' }),
    // Sin force → 409 si tiene ventas (details.order_count trae el conteo).
    // { force: true } → borra también todas las ventas que trajo (cascada).
    permanentDelete: (id: number, opts?: { force?: boolean }) =>
      request<{ ok: true; deleted_orders: number }>(
        `/api/admin/sellers/${id}/permanent${opts?.force ? '?force=true' : ''}`,
        { method: 'DELETE' },
      ),
    orders: (id: number, status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return request<AdminSellerOrder[]>(`/api/admin/sellers/${id}/orders${qs}`);
    },
    markCommissionsPaid: (id: number, orderIds: number[]) =>
      request<{ updated: number }>(`/api/admin/sellers/${id}/commissions/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ order_ids: orderIds }),
      }),
    invite: (id: number) =>
      request<{ ok: true; action: 'invite_sent' | 'password_reset_sent'; link: string }>(`/api/admin/sellers/${id}/invite`, {
        method: 'POST',
      }),
    qrUrl: (id: number, format: 'png' | 'svg' = 'png', size = 512) =>
      `${(import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'}/api/admin/sellers/${id}/qr?format=${format}&size=${size}`,
  },
  orders: {
    list: (filters?: { status?: string; ref?: string; from?: string; to?: string; search?: string; limit?: number }) => {
      const qs = filters
        ? '?' + Object.entries(filters).filter(([_, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
        : '';
      return request<AdminOrderListItem[]>(`/api/admin/orders${qs}`);
    },
    get: (publicId: string) => request<AdminOrderListItem & { items: unknown[]; events: unknown[] }>(
      `/api/admin/orders/${encodeURIComponent(publicId)}`,
    ),
    updateStatus: (publicId: string, status: string, note?: string) =>
      request<{ ok: true; status: string }>(`/api/admin/orders/${encodeURIComponent(publicId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note }),
      }),
    // Borrado total e irreversible de la orden (incluso si está pagada).
    delete: (publicId: string) =>
      request<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(publicId)}`, { method: 'DELETE' }),
    refund: (publicId: string, options?: { reason?: string; notify_customer?: boolean; amount_usd?: number }) =>
      request<{
        ok: true; refund_id: number | null;
        amount_ars: number | null; amount_usd: number;
        is_partial: boolean; new_status: 'paid' | 'refunded';
      }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/refund`,
        { method: 'POST', body: JSON.stringify(options ?? {}) },
      ),
  },
  settings: {
    list: () => request<AdminSetting[]>('/api/admin/settings'),
    updateExchangeRate: (rate: number) =>
      request<{ rate: number }>('/api/admin/settings/exchange-rate', {
        method: 'PUT',
        body: JSON.stringify({ rate }),
      }),
    getBookingCutoff: () =>
      request<{ time: string | null }>('/api/admin/settings/booking-cutoff'),
    updateBookingCutoff: (time: string | null) =>
      request<{ time: string | null }>('/api/admin/settings/booking-cutoff', {
        method: 'PUT',
        body: JSON.stringify({ time }),
      }),
    getMpFeePct: () =>
      request<{ pct: number }>('/api/admin/settings/mp-fee-pct'),
    updateMpFeePct: (pct: number) =>
      request<{ pct: number }>('/api/admin/settings/mp-fee-pct', {
        method: 'PUT',
        body: JSON.stringify({ pct }),
      }),
  },
};
