// Cliente para los endpoints /api/seller/*: añade Authorization: Bearer <jwt>
import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

export class SellerApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'SellerApiError';
  }
  get isAuthError(): boolean { return this.status === 401 || this.status === 403; }
  get isTransient(): boolean { return this.status === 0 || this.status >= 500; }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) return null;
      return refreshed.session.access_token;
    })().finally(() => {
      setTimeout(() => { refreshInFlight = null; }, 100);
    });
  }
  return refreshInFlight;
}

function isTokenNearExpiry(session: { expires_at?: number } | null): boolean {
  if (!session?.expires_at) return false;
  return session.expires_at * 1000 - Date.now() < 60_000;
}

async function getValidToken(forceRefresh = false): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  if (forceRefresh || isTokenNearExpiry(data.session)) {
    const refreshed = await refreshOnce();
    if (refreshed) token = refreshed;
    else throw new SellerApiError(401, 'Session expired');
  }

  if (!token) throw new SellerApiError(401, 'No active session');
  return token;
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

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...init?.headers },
    });
  } catch (err) {
    throw new SellerApiError(0, `Sin conexión con el servidor: ${(err as Error).message}`);
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try { const body = await res.json(); message = body?.error ?? message; } catch { /* ignore */ }
    throw new SellerApiError(res.status, message);
  }
  const body = await res.json();
  return body.data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let token: string;
  try {
    token = await getValidToken();
  } catch (err) {
    if (err instanceof SellerApiError) throw err;
    throw new SellerApiError(0, 'Network error obtaining session');
  }

  let res: Response;
  try {
    res = await doFetch(path, token, init);
  } catch (err) {
    throw new SellerApiError(0, `Sin conexión con el servidor: ${(err as Error).message}`);
  }

  if (res.status === 401) {
    try {
      token = await getValidToken(true);
      res = await doFetch(path, token, init);
    } catch {
      await supabase.auth.signOut().catch(() => {});
      throw new SellerApiError(401, 'Tu sesión expiró. Volvé a iniciar sesión.');
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
    throw new SellerApiError(res.status, message, details);
  }
  const body = await res.json();
  return body.data;
}

export interface SellerMe {
  id: number;
  code: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  kind: string | null;
  is_permanent: boolean;
  commission_percent: string;
  orders_paid: number;
  revenue_paid_usd: number;
  revenue_paid_ars: number;
  commission_earned_usd: number;
  commission_earned_ars: number;
  commission_paid_usd: number;
  commission_paid_ars: number;
  // MP: comisión que el operador todavía te debe liquidar
  commission_pending_usd: number;
  commission_pending_ars: number;
  // Efectivo: neto que vos le tenés que rendir al operador
  net_pending_settlement_usd: number;
  net_pending_settlement_ars: number;
  unread_notifications: number;
}

export interface SellerOrder {
  order_id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  adults: number;
  children: number;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  unit_price_adult_usd: number;
  unit_price_child_usd: number | null;
  subtotal_usd: number;
  service_date: string;
  option_id: number;
  product_name: string;
  option_name: string;
  commission_amount_usd: number;
  commission_amount_ars: number;
  net_total_usd: number | null;
  commission_percent_snapshot: number | null;
  paid_to_seller_at: string | null;
  net_settled_at: string | null;
  cash_collected_at: string | null;
  created_at: string;
  utm_source: string | null;
  payment_method: string;
  was_reduced: boolean;
  has_paid_addon: boolean;
  restored_at: string | null;
}

export interface SellerBookingInput {
  option_id: number;
  service_date: string;
  adults: number;
  children: number;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    nationality?: string | null;
    dni?: string | null;
  };
  payment_method: 'mercadopago' | 'cash';
  transfer_requested?: boolean;
  transfer_hotel?: string | null;
  transfer_room?: string | null;
}

export interface SellerBookingResult {
  order_public_id: string;
  payment_method: 'mercadopago' | 'cash';
  total_usd: number;
  total_ars?: number;
}

export interface SellerPendingAddon {
  public_id: string;
  payment_method: 'mercadopago' | 'cash';
  extra_adults: number;
  extra_children: number;
  charge_usd: number;
  charge_ars: number;
  created_at: string;
}

export interface SellerCommission {
  paid_date: string;
  orders_count: number;
  total_usd: number;
  total_ars: number;
}

export interface SellerCommissionOrder {
  public_id: string;
  product_name: string;
  option_name: string;
  service_date: string;
  adults: number;
  children: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  payment_method: string;
  total_usd: number;
  total_ars: number;
  commission_amount_usd: number;
  commission_amount_ars: number;
  created_at: string;
}

export interface SellerArchivedOrder {
  id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  total_usd: number;
  total_ars: number;
  payment_method: string;
  created_at: string;
  archived_at: string | null;
  net_settled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  commission_amount_ars: number | null;
  paid_to_seller_at: string | null;
  product_name: string | null;
  option_name: string | null;
  service_date: string | null;
  adults: number | null;
  children: number | null;
}

export interface ArchivePage<T> {
  orders: T[];
  total: number;
  page: number;
  total_pages: number;
  limit: number;
}

export interface SellerNotification {
  id: number;
  seller_id: number;
  type: 'order_paid' | 'commission_paid' | string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// Devuelve la URL del stream SSE con el token actual como query param
export async function getNotificationStreamUrl(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return `${API_URL}/api/seller/me/notifications/stream?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export const sellerApi = {
  me: () => request<SellerMe>('/api/seller/me'),
  orders: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<SellerOrder[]>(`/api/seller/me/orders${qs}`);
  },
  commissions: () => request<SellerCommission[]>('/api/seller/me/commissions'),
  commissionOrders: (date: string) => request<SellerCommissionOrder[]>(`/api/seller/me/commissions/${encodeURIComponent(date)}/orders`),
  checkout: {
    create: (input: SellerBookingInput) =>
      request<SellerBookingResult>('/api/seller/me/checkout', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  collectCash: (publicId: string) =>
    request<{ ok: true }>(`/api/seller/me/orders/${encodeURIComponent(publicId)}/collect`, {
      method: 'POST',
    }),
  reduceCash: (publicId: string, body: { adults: number; children: number; transfer_requested: boolean; notify_customer?: boolean; reason?: string; reschedule_from?: string; reschedule_to?: string }) =>
    request<{ ok: true; refund_usd: number; refund_ars: number; new_total_usd: number }>(
      `/api/seller/me/orders/${encodeURIComponent(publicId)}/reduce-cash`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  increaseCash: (publicId: string, body: { adults: number; children: number; notify_customer?: boolean }) =>
    request<{ ok: true; charge_usd: number; charge_ars: number; new_total_usd: number }>(
      `/api/seller/me/orders/${encodeURIComponent(publicId)}/increase-cash`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  orderEvents: (publicId: string) =>
    request<Array<{ id: number; event_type: string; payload: Record<string, unknown> | null; created_at: string }>>(
      `/api/seller/me/orders/${encodeURIComponent(publicId)}/events`,
    ),
  orderAddons: (publicId: string) =>
    request<SellerPendingAddon[]>(`/api/seller/me/orders/${encodeURIComponent(publicId)}/addons`),
  collectAddon: (addonPublicId: string) =>
    request<{ ok: true; charge_usd: number; charge_ars: number }>(
      `/api/seller/me/addons/${encodeURIComponent(addonPublicId)}/collect`, { method: 'POST' }),
  cancelAddon: (addonPublicId: string) =>
    request<{ ok: true }>(`/api/seller/me/addons/${encodeURIComponent(addonPublicId)}/cancel`, { method: 'POST' }),
  reschedule: (publicId: string, body: { new_date: string; reason?: string; notify_customer?: boolean }) =>
    request<{ ok: true; prev_date: string; new_date: string }>(
      `/api/seller/me/orders/${encodeURIComponent(publicId)}/reschedule`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  cancelOrder: (publicId: string, reason?: string) =>
    request<{ ok: true }>(`/api/seller/me/orders/${encodeURIComponent(publicId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  archiveOrder: (publicId: string) =>
    request<{ ok: true }>(`/api/seller/me/orders/${encodeURIComponent(publicId)}/archive`, { method: 'POST' }),
  operationWindows: () =>
    request<{ modify: number | null; cancel: number | null }>('/api/seller/me/operation-windows'),
  faq: () => request<{ items: { q_es: string; a_es: string }[]; updated_at: string | null }>('/api/seller/me/faq'),
  archive: {
    list: (params?: { page?: number; limit?: number; status?: string; search?: string }) => {
      const qs = params
        ? '?' + Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
        : '';
      return request<ArchivePage<SellerArchivedOrder>>(`/api/seller/me/orders/archive${qs}`);
    },
    downloadUrl: (params?: { status?: string; search?: string }) => {
      const qs = params
        ? '?' + Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
        : '';
      return `${API_URL}/api/seller/me/orders/archive/download${qs}`;
    },
    restore: (publicId: string) =>
      request<{ ok: true }>(`/api/seller/me/orders/${encodeURIComponent(publicId)}/restore`, { method: 'POST' }),
  },
  notifications: {
    list: () => request<SellerNotification[]>('/api/seller/me/notifications'),
    markAllRead: () => request<{ updated: number }>('/api/seller/me/notifications/read-all', { method: 'PATCH' }),
    unreadCount: () => request<{ count: number }>('/api/seller/me/notifications/unread-count'),
    delete: (id: number) => request<{ ok: true }>(`/api/seller/me/notifications/${id}`, { method: 'DELETE' }),
  },
  forgotPassword: (email: string) =>
    publicRequest<{ ok: true }>('/api/seller/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  qrBlob: async (size = 400): Promise<Blob> => {
    const token = await getValidToken();
    const res = await doFetch(`/api/seller/me/qr?size=${size}`, token);
    if (!res.ok) throw new SellerApiError(res.status, `QR fetch failed: ${res.status}`);
    return res.blob();
  },
};
