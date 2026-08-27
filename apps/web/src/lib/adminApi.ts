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

// Para endpoints públicos (sin sesión) — ej. pedir un reset de contraseña antes de
// estar logueado. A diferencia de request(), no adjunta Authorization.
async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...init?.headers },
    });
  } catch (err) {
    throw new AdminApiError(0, `Sin conexión con el servidor: ${(err as Error).message}`);
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try { const body = await res.json(); message = body?.error ?? message; } catch { /* ignore */ }
    throw new AdminApiError(res.status, message);
  }
  const body = await res.json();
  return body.data;
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
  stats: {
    products: number; orders_paid: number; orders_pending: number;
    mp_revenue_ars: number; net_pending_ars: number;
  };
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
  transfer_mode: 'none' | 'optional' | 'included';
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
  accepts_children: boolean;
  category_id: number; category_slug: string; category_name_es: string;
  options_count: string; images_count: string;
  hero_image_url: string | null;
  logo_url: string | null;
  updated_at: string;
  options: AdminProductOptionPreview[];
}

export interface AdminProductDetail {
  id: number; slug: string; name: string; venue_name: string;
  category_id: number;
  short_description_es: string | null; short_description_en: string | null;
  long_description_es: string | null; long_description_en: string | null;
  address_es: string | null; address_en: string | null;
  neighborhood_es: string | null; neighborhood_en: string | null;
  tagline_es: string | null; tagline_en: string | null;
  schedule_summary_es: string | null; schedule_summary_en: string | null;
  video_url: string | null;
  starting_price_usd: number | null;
  is_active: boolean; display_order: number;
  available_days: number[];
  accepts_children: boolean;
  logo_url: string | null;
  options: AdminOption[];
  images: AdminImage[];
  menus: AdminMenu[];
}

export interface AdminOption {
  id: number; code: string;
  name_es: string; name_en: string;
  description_es: string | null; description_en: string | null;
  includes_es: string[]; includes_en: string[];
  price_adult_usd: number | string; price_child_usd: number | string | null;
  net_price_adult_usd: number | string | null;
  net_price_child_usd: number | string | null;
  has_dinner: boolean;
  transfer_mode: 'none' | 'optional' | 'included';
  transfer_price_usd: number;
  infant_transfer_chargeable: boolean;
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

export interface AdminMenu {
  id: number;
  option_id: number;
  title: string | null;
  content_html: string;
  is_visible: boolean;
}

export interface AdminMenuInput {
  title?: string | null;
  content_html: string;
  is_visible?: boolean;
}

export interface UploadSignedResponse {
  upload_url: string;
  token: string;
  path: string;
  public_url: string;
}

export interface AdminHoldRow {
  id: string;
  payment_method: 'mercadopago' | 'pix';
  service_date: string;
  pax: number;
  expires_at: string;
  seconds_remaining: number;
  created_at: string;
  product_name: string;
  option_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  customer_dni: string | null;
  adults: number;
  children: number;
  transfer_qty: number;
  transfer_hotel: string | null;
  transfer_room: string | null;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  ref_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  mp_preference_id: string | null;
  mp_init_point: string | null;
  nautt_order_uuid: string | null;
  pix_qrcode: string | null;
  pix_fiat_amount_brl: number | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: 'super_admin' | 'admin' | 'operator';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminInviteResult {
  admin: AdminUserRow;
  ok: true;
  action: 'invite_sent' | 'password_reset_sent';
  link: string;
  email_sent: boolean;
  email_error: string | null;
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
  card_enabled: boolean;
  is_house: boolean;
  has_admin_pin?: boolean;
  landing_customization_enabled?: boolean;
  team_enabled?: boolean;
  team_pin_required?: boolean;
  created_at: string;
  supabase_user_id?: string | null;
  orders_total?: number;
  orders_paid?: number;
  revenue_paid_usd?: number;
  revenue_paid_ars?: number;
  commission_paid_usd?: number;
  commission_paid_ars?: number;
  // MP: comisión que le debemos liquidar al vendedor (pendiente)
  commission_pending_payment_usd?: number;
  commission_pending_payment_ars?: number;
  // Efectivo: neto que el vendedor nos debe rendir (pendiente)
  net_pending_settlement_usd?: number;
  net_pending_settlement_ars?: number;
}

export interface AdminSellerMember {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  orders_paid: number;
  revenue_paid_ars: number;
}

export interface AdminSellerPeriodStats {
  orders_paid: number;
  revenue_paid_usd: number;
  revenue_paid_ars: number;
  commission_earned_usd: number;
  commission_earned_ars: number;
  commission_paid_usd: number;
  commission_paid_ars: number;
  commission_pending_usd: number;
  commission_pending_ars: number;
  net_pending_settlement_usd: number;
  net_pending_settlement_ars: number;
}

export interface AdminSellerOrder {
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
  service_date: string;
  product_name: string;
  option_name: string;
  commission_amount_usd: number;
  commission_amount_ars: number;
  net_total_usd: number | null;
  commission_percent_snapshot: number | null;
  paid_to_seller_at: string | null;
  net_settled_at: string | null;
  cash_collected_at: string | null;
  cash_collected_currency: 'ARS' | 'USD' | null;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  created_at: string;
}

export interface AdminOrderListItem {
  id: number;
  public_id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  ref_code: string | null;
  mp_payment_id: string | null;
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
  commission_amount_ars: number | null;
  net_total_usd: number | null;
  paid_to_seller_at: string | null;
  net_settled_at: string | null;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  created_at: string;
  paid_at: string | null;
  admin_viewed_at: string | null;
  cash_collected_currency: 'ARS' | 'USD' | null;
}

// Payload de reserva manual creada por el admin a nombre de un vendedor puntual —
// mismos campos que SellerBookingInput (portal del vendedor) + seller_id, porque el
// backend hace exactamente la misma validación de disponibilidad/precio/atribución,
// solo que el vendedor viene elegido a mano en vez de salir del token de sesión.
export interface AdminBookingInput {
  seller_id: number;
  option_id: number;
  service_date: string;
  adults: number;
  children: number;
  infants?: number;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    nationality?: string | null;
    dni?: string | null;
  };
  payment_method: 'mercadopago' | 'cash' | 'pix';
  transfer_qty?: number;
  transfer_hotel?: string | null;
  transfer_room?: string | null;
}

export interface AdminBookingResult {
  order_public_id: string;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  total_usd: number;
  total_ars?: number;
  seller: { id: number; code: string; name: string };
}

export interface ArchivedOrderItem {
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
  seller_name: string | null;
  seller_code: string | null;
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

export interface AdminDateAvailabilityRow {
  option_id: number;
  option_name: string;
  option_code: string;
  is_option_active: boolean;
  product_id: number;
  product_name: string;
  default_capacity_per_day: number;
  product_available_days: number[];
  override_id: number | null;
  is_closed: boolean;
  capacity: number;
  booked: number;
  remaining: number;
}

export interface AdminProductRangeAvailabilityRow {
  option_id: number;
  option_name: string;
  option_code: string;
  is_option_active: boolean;
  date: string;
  default_capacity_per_day: number;
  low_availability_threshold: number;
  available_days: number[];
  product_available_days: number[];
  override_id: number | null;
  is_closed: boolean;
  capacity: number;
  booked: number;
  remaining: number;
}

export interface AdminSetting {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
}

export interface AboutContent {
  title_es: string;
  title_en: string;
  body_es: string;
  body_en: string;
  updated_at: string | null;
}

export type TermsContent = AboutContent;

export interface FaqItem {
  q_es: string;
  q_en: string;
  a_es: string;
  a_en: string;
}

export interface FaqContent {
  items: FaqItem[];
  updated_at: string | null;
}

export interface SellerFaqItem {
  q_es: string;
  a_es: string;
}

export interface SellerFaqContent {
  items: SellerFaqItem[];
  updated_at: string | null;
}

export interface PendingAddon {
  public_id: string;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  extra_adults: number;
  extra_children: number;
  charge_usd: number;
  charge_ars: number;
  mp_init_point: string | null;
  created_at: string;
}

// Devuelve la URL del stream SSE con el token actual como query param (EventSource
// no puede mandar headers custom, así que el token viaja así, igual que el vendedor).
export async function getAdminNotificationStreamUrl(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return `${API_URL}/api/admin/notifications/stream?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export interface AdminNewOrderPaidEvent {
  order_id: number;
  public_id: string;
  customer_name: string;
  option_name: string | null;
  total_ars: number;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  seller_name: string | null;
}

export const adminApi = {
  me: () => request<AdminMe>('/api/admin/me'),
  forgotPassword: (email: string) =>
    publicRequest<{ ok: true }>('/api/admin/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
  // Código de un vendedor "casa" reservado, creado la primera vez que se pide, para
  // que el equipo pueda abrir el sitio público ya adentro del muro de exclusividad
  // (sin pedirle el código a un vendedor real).
  previewLink: () => request<{ ref_code: string }>('/api/admin/preview-link'),
  categories: {
    list: () => request<AdminCategory[]>('/api/admin/categories'),
  },
  products: {
    list: () => request<AdminProductSummary[]>('/api/admin/products'),
    get: (id: number) => request<AdminProductDetail>(`/api/admin/products/${id}`),
    // Cupo ocupado/disponible de TODAS las opciones activas para una fecha puntual —
    // buscador del panel de cupos (distinto de products.availability, que es por producto).
    availabilityByDate: (date: string) =>
      request<AdminDateAvailabilityRow[]>(`/api/admin/products/availability-by-date?date=${date}`),
    // Calendario por producto: todas sus opciones activas a lo largo de un rango de
    // fechas, en una sola llamada (para pintar varios meses sin overfetch por día).
    availabilityRange: (productId: number, from: string, to: string) =>
      request<AdminProductRangeAvailabilityRow[]>(
        `/api/admin/products/${productId}/availability-range?from=${from}&to=${to}`,
      ),
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
    menu: {
      upsertOption: (optionId: number, input: AdminMenuInput) =>
        request<{ ok: true }>(`/api/admin/products/options/${optionId}/menu`, {
          method: 'PUT', body: JSON.stringify(input),
        }),
      deleteOption: (optionId: number) =>
        request<{ ok: true }>(`/api/admin/products/options/${optionId}/menu`, { method: 'DELETE' }),
    },
    availability: {
      list: (productId: number) =>
        request<Array<{ date: string; is_closed: boolean; capacity_override: number | null; notes: string | null }>>(
          `/api/admin/products/${productId}/availability`,
        ),
      upsert: (productId: number, input: { date: string; is_closed: boolean; capacity_override?: number | null; notes?: string | null }) =>
        request<{ ok: true; affected: number }>(`/api/admin/products/${productId}/availability`, {
          method: 'POST', body: JSON.stringify(input),
        }),
      clear: (productId: number, date: string) =>
        request<{ ok: true }>(`/api/admin/products/${productId}/availability/${date}`, { method: 'DELETE' }),
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
  holds: {
    list: (filters?: { payment_method?: 'mercadopago' | 'pix'; search?: string; include_expired?: boolean }) => {
      const params = new URLSearchParams();
      if (filters?.payment_method) params.set('payment_method', filters.payment_method);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.include_expired) params.set('include_expired', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request<AdminHoldRow[]>(`/api/admin/holds${qs}`);
    },
  },
  admins: {
    list: () => request<AdminUserRow[]>('/api/admin/admins'),
    invite: (input: { email: string; full_name?: string | null; role: AdminUserRow['role'] }) =>
      request<AdminInviteResult>('/api/admin/admins', {
        method: 'POST', body: JSON.stringify(input),
      }),
    update: (id: string, input: { role?: AdminUserRow['role']; is_active?: boolean }) =>
      request<AdminUserRow>(`/api/admin/admins/${id}`, {
        method: 'PATCH', body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      request<{ ok: true }>(`/api/admin/admins/${id}`, { method: 'DELETE' }),
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
    orders: (id: number, status?: string, settlement?: 'pending' | 'settled') => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (settlement) params.set('settlement', settlement);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request<AdminSellerOrder[]>(`/api/admin/sellers/${id}/orders${qs}`);
    },
    markCommissionsPaid: (id: number, orderIds: number[]) =>
      request<{ updated: number }>(`/api/admin/sellers/${id}/commissions/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ order_ids: orderIds }),
      }),
    // Efectivo: marcar que el vendedor nos rindió el neto de esas órdenes.
    markNetSettled: (id: number, orderIds: number[]) =>
      request<{ updated: number }>(`/api/admin/sellers/${id}/net-settlements/mark-settled`, {
        method: 'POST',
        body: JSON.stringify({ order_ids: orderIds }),
      }),
    invite: (id: number) =>
      request<{
        ok: true;
        action: 'invite_sent' | 'password_reset_sent';
        link: string;
        email_sent: boolean;
        email_error: string | null;
      }>(`/api/admin/sellers/${id}/invite`, {
        method: 'POST',
      }),
    qrUrl: (id: number, format: 'png' | 'svg' = 'png', size = 512) =>
      `${(import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'}/api/admin/sellers/${id}/qr?format=${format}&size=${size}`,
    // PIN de administrador del "Mi equipo" del vendedor (sub-vendedores) — lo cargamos
    // nosotros; sin esto el vendedor no puede crear ni editar su equipo.
    setAdminPin: (id: number, adminPin: string) =>
      request<{ ok: true }>(`/api/admin/sellers/${id}/admin-pin`, {
        method: 'POST', body: JSON.stringify({ admin_pin: adminPin }),
      }),
    // Sub-vendedores (ej. conserjes) que el vendedor cargó en su equipo — solo lectura.
    members: (id: number) => request<AdminSellerMember[]>(`/api/admin/sellers/${id}/members`),
    // Mismas métricas que /members pero con paridad completa a GET /me del portal
    // del vendedor, recortable por sub-vendedor y/o período. Espejo admin de
    // sellerApi.stats().
    stats: (id: number, opts: { memberId?: number; from?: string; to?: string } = {}) => {
      const params = new URLSearchParams();
      if (opts.memberId != null) params.set('member_id', String(opts.memberId));
      if (opts.from) params.set('from', opts.from);
      if (opts.to) params.set('to', opts.to);
      const qs = params.toString();
      return request<AdminSellerPeriodStats>(`/api/admin/sellers/${id}/stats${qs ? `?${qs}` : ''}`);
    },
    // Blanqueo de emergencia (solo super_admin): genera un PIN nuevo para un
    // sub-vendedor puntual sin depender del vendedor ni de su email cargado.
    resetMemberPin: (sellerId: number, memberId: number) =>
      request<{ id: number; name: string; pin: string }>(
        `/api/admin/sellers/${sellerId}/members/${memberId}/reset-pin`,
        { method: 'POST' },
      ),
  },
  orders: {
    create: (input: AdminBookingInput) =>
      request<AdminBookingResult>('/api/admin/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    list: (filters?: { status?: string; ref?: string; member_id?: string; from?: string; to?: string; search?: string; limit?: number }) => {
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
    archive: (publicId: string) =>
      request<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(publicId)}/archive`, { method: 'POST' }),
    bulkArchive: (publicIds: string[]) =>
      request<{ archived: number }>('/api/admin/orders/bulk-archive', {
        method: 'POST', body: JSON.stringify({ public_ids: publicIds }),
      }),
    archiveList: (params?: { page?: number; limit?: number; search?: string; status?: string; ref?: string; from?: string; to?: string }) => {
      const qs = params
        ? '?' + Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
        : '';
      return request<ArchivePage<ArchivedOrderItem>>(`/api/admin/orders/archive${qs}`);
    },
    archiveRestore: (publicIds: string[]) =>
      request<{ restored: number }>('/api/admin/orders/archive/restore', {
        method: 'POST', body: JSON.stringify({ public_ids: publicIds }),
      }),
    archiveDownloadUrl: (params?: { status?: string; search?: string; ref?: string; from?: string; to?: string }) => {
      const base = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
      const qs = params
        ? '?' + Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
        : '';
      return `${base}/api/admin/orders/archive/download${qs}`;
    },
    refund: (publicId: string, options?: { reason?: string; notify_customer?: boolean; amount_usd?: number }) =>
      request<{
        ok: true; refund_id: number | null;
        amount_ars: number | null; amount_usd: number;
        is_partial: boolean; new_status: 'paid' | 'refunded';
      }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/refund`,
        { method: 'POST', body: JSON.stringify(options ?? {}) },
      ),
    syncMp: (publicId: string) =>
      request<{ ok: true; status: string }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/sync-mp`,
        { method: 'POST' },
      ),
    // Modificar reserva — reducir (reintegro MP o devolución en efectivo) / agregar
    // (cobro en efectivo o link incremental de MP).
    modifyMp: (publicId: string, body: { adults: number; children: number; transfer_qty: number; infants: number; reason?: string; notify_customer?: boolean; reschedule_from?: string; reschedule_to?: string }) =>
      request<{ ok: true; refund_usd: number; refund_ars: number; new_total_usd: number }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/modify`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    reduceCash: (publicId: string, body: { adults: number; children: number; transfer_qty: number; infants: number; reason?: string; notify_customer?: boolean; reschedule_from?: string; reschedule_to?: string }) =>
      request<{ ok: true; refund_usd: number; refund_ars: number; new_total_usd: number }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/reduce-cash`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    increaseCash: (publicId: string, body: { adults: number; children: number; reason?: string; notify_customer?: boolean }) =>
      request<{ ok: true; charge_usd: number; charge_ars: number; new_total_usd: number }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/increase-cash`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    addMp: (publicId: string, body: { adults: number; children: number }) =>
      request<{ addon_public_id: string; order_public_id: string; init_point: string; sandbox_init_point: string; charge_usd: number; charge_ars: number; new_total_usd: number }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/add-mp`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    increaseCashPending: (publicId: string, body: { adults: number; children: number }) =>
      request<{ addon_public_id: string; charge_usd: number; charge_ars: number; new_total_usd: number }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/increase-cash`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    reschedule: (publicId: string, body: { new_date: string; reason?: string; notify_customer?: boolean }) =>
      request<{ ok: true; prev_date: string; new_date: string }>(
        `/api/admin/orders/${encodeURIComponent(publicId)}/reschedule`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    addons: (publicId: string) =>
      request<PendingAddon[]>(`/api/admin/orders/${encodeURIComponent(publicId)}/addons`),
    collectCash: (publicId: string, currency: 'ARS' | 'USD') =>
      request<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(publicId)}/collect-cash`, {
        method: 'POST',
        body: JSON.stringify({ currency }),
      }),
    collectAddon: (addonPublicId: string) =>
      request<{ ok: true; charge_usd: number; charge_ars: number }>(
        `/api/admin/orders/addons/${encodeURIComponent(addonPublicId)}/collect`, { method: 'POST' }),
    cancelAddon: (addonPublicId: string) =>
      request<{ ok: true }>(`/api/admin/orders/addons/${encodeURIComponent(addonPublicId)}/cancel`, { method: 'POST' }),
  },
  settings: {
    list: () => request<AdminSetting[]>('/api/admin/settings'),
    updateExchangeRate: (rate: number) =>
      request<{ rate: number }>('/api/admin/settings/exchange-rate', {
        method: 'PUT',
        body: JSON.stringify({ rate }),
      }),
    getExchangeRateMode: () =>
      request<{ mode: 'auto' | 'manual' }>('/api/admin/settings/exchange-rate-mode'),
    updateExchangeRateMode: (mode: 'auto' | 'manual') =>
      request<{ rate: number; mode: 'auto' | 'manual' }>('/api/admin/settings/exchange-rate-mode', {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }),
    syncExchangeRateNow: () =>
      request<{ rate: number; mode: 'auto' | 'manual' }>('/api/admin/settings/exchange-rate/sync-now', {
        method: 'POST',
      }),
    getBookingCutoff: () =>
      request<{ time: string | null }>('/api/admin/settings/booking-cutoff'),
    updateBookingCutoff: (time: string | null) =>
      request<{ time: string | null }>('/api/admin/settings/booking-cutoff', {
        method: 'PUT',
        body: JSON.stringify({ time }),
      }),
    getBookingHorizon: () =>
      request<{ months: number | null }>('/api/admin/settings/booking-horizon'),
    updateBookingHorizon: (months: number | null) =>
      request<{ months: number | null }>('/api/admin/settings/booking-horizon', {
        method: 'PUT',
        body: JSON.stringify({ months }),
      }),
    getSupportWhatsapp: () =>
      request<{ number: string | null }>('/api/admin/settings/support-whatsapp'),
    updateSupportWhatsapp: (number: string) =>
      request<{ number: string | null }>('/api/admin/settings/support-whatsapp', {
        method: 'PUT', body: JSON.stringify({ number }),
      }),
    getModifyWindow: () =>
      request<{ hours: number | null }>('/api/admin/settings/modify-window'),
    updateModifyWindow: (hours: number | null) =>
      request<{ hours: number | null }>('/api/admin/settings/modify-window', {
        method: 'PUT', body: JSON.stringify({ hours }),
      }),
    getCancelWindow: () =>
      request<{ hours: number | null }>('/api/admin/settings/cancel-window'),
    updateCancelWindow: (hours: number | null) =>
      request<{ hours: number | null }>('/api/admin/settings/cancel-window', {
        method: 'PUT', body: JSON.stringify({ hours }),
      }),
    getArchiveRetention: () =>
      request<{ days: number | null }>('/api/admin/settings/archive-retention'),
    updateArchiveRetention: (days: number | null) =>
      request<{ days: number | null }>('/api/admin/settings/archive-retention', {
        method: 'PUT', body: JSON.stringify({ days }),
      }),
    getAbout: () => request<AboutContent>('/api/admin/settings/content/about'),
    updateAbout: (input: Omit<AboutContent, 'updated_at'>) =>
      request<AboutContent>('/api/admin/settings/content/about', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    getTerms: () => request<TermsContent>('/api/admin/settings/content/terms'),
    updateTerms: (input: Omit<TermsContent, 'updated_at'>) =>
      request<TermsContent>('/api/admin/settings/content/terms', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    getFaq: () => request<FaqContent>('/api/admin/settings/content/faq'),
    updateFaq: (items: FaqItem[]) =>
      request<FaqContent>('/api/admin/settings/content/faq', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    getSellerFaq: () => request<SellerFaqContent>('/api/admin/settings/content/seller-faq'),
    updateSellerFaq: (items: SellerFaqItem[]) =>
      request<SellerFaqContent>('/api/admin/settings/content/seller-faq', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    getMaintenanceMode: () =>
      request<{ enabled: boolean }>('/api/admin/settings/maintenance'),
    setMaintenanceMode: (enabled: boolean) =>
      request<{ enabled: boolean }>('/api/admin/settings/maintenance', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
  },
};
