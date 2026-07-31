// Tipos públicos serializados que devuelve la API.
// Mantener en sync con apps/web/src/types/api.ts.

export interface Category {
  id: number;
  slug: string;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  display_order: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt_text: string | null;
  is_hero: boolean;
  display_order: number;
}

export interface ProductOption {
  id: number;
  code: string;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  includes_es: string[];
  includes_en: string[];
  price_adult_usd: number;
  price_child_usd: number | null;
  has_dinner: boolean;
  has_transfer: boolean;
  transfer_price_usd: number;
  available_days: number[];
  pickup_window_es: string | null;
  pickup_window_en: string | null;
  dinner_time_es: string | null;
  dinner_time_en: string | null;
  show_time_es: string | null;
  show_time_en: string | null;
  display_order: number;
}

export interface ProductSummary {
  id: number;
  slug: string;
  name: string;
  venue_name: string;
  category_slug: string;
  short_description_es: string | null;
  short_description_en: string | null;
  address_es: string | null;
  address_en: string | null;
  // Barrio corto (ej. "Barracas") para el pin sobre la imagen de la card — distinto
  // de address_* (dirección completa, usada en el detalle y el voucher).
  neighborhood_es: string | null;
  neighborhood_en: string | null;
  // Frase editorial corta (ej. "Catedral del Tango") que se muestra arriba del
  // título en la card. Si está vacía, la card cae a venue_name.
  tagline_es: string | null;
  tagline_en: string | null;
  // Etiqueta corta y reutilizable para destacar la casa en su card (ej. "¡Últimos
  // lugares!", "Recomendado"). NULL = no se muestra ninguna etiqueta.
  badge_es: string | null;
  badge_en: string | null;
  starting_price_usd: number | null;
  hero_image: string | null;
  // Nombres de los product_options activos (tiers: "Cena VIP", "Solo Show", etc.)
  // Se usan como preview rápido en el selector de la home, sin pedir el detalle completo.
  option_names_es: string[];
  option_names_en: string[];
}

export interface ProductDetail extends ProductSummary {
  long_description_es: string | null;
  long_description_en: string | null;
  schedule_summary_es: string | null;
  schedule_summary_en: string | null;
  video_url: string | null;
  images: ProductImage[];
  options: ProductOption[];
}
