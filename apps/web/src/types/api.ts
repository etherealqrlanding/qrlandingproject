// Tipos públicos de la API — espejo de api/src/types.ts

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

export interface ProductMenu {
  id: number;
  title: string | null;
  // HTML con formato simple (negrita, subrayado, listas), sin traducción.
  content_html: string;
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
  // 'none' = no hay traslado. 'optional' = con costo, el cliente elige sumarlo
  // (transfer_price_usd). 'included' = ya incluido en el precio, sin costo extra.
  transfer_mode: 'none' | 'optional' | 'included';
  transfer_price_usd: number;
  // Precio de traslado para hoteles en Palermo -- opcional, no todas las casas
  // distinguen por zona. NULL = siempre se usa transfer_price_usd.
  transfer_price_usd_palermo: number | null;
  available_days: number[];
  // Resueltos por el backend a partir de los horarios de la casa (ProductDetail)
  // + los checks de este tier (has_dinner / show_only_time_enabled) -- ya no se
  // tipean por tier, así que solo hay versión en español.
  pickup_window_es: string | null;
  dinner_time_es: string | null;
  show_time_es: string | null;
  display_order: number;
  menu: ProductMenu | null;
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
  neighborhood_es: string | null;
  neighborhood_en: string | null;
  tagline_es: string | null;
  tagline_en: string | null;
  badge_es: string | null;
  badge_en: string | null;
  starting_price_usd: number | null;
  hero_image: string | null;
  logo_url: string | null;
  option_names_es: string[];
  option_names_en: string[];
}

export interface ProductDetail extends ProductSummary {
  long_description_es: string | null;
  long_description_en: string | null;
  schedule_summary_es: string | null;
  schedule_summary_en: string | null;
  // Horarios estructurados de la casa, usados para resolver pickup_window_es/
  // dinner_time_es/show_time_es de cada tier (ver ProductOption). Se exponen acá
  // por si algún consumidor los necesita crudos, pero el uso normal es a través
  // de los campos ya resueltos en cada option.
  dinner_show_time_es: string | null;
  show_only_time_es: string | null;
  dinner_transfer_window_es: string | null;
  show_only_transfer_window_es: string | null;
  video_url: string | null;
  // Días de operación de TODA la casa (1=Lun..7=Dom) — un tier solo opera de
  // verdad un día si está en este array Y en su propio available_days (intersección).
  available_days: number[];
  // Política general de menores de la casa — el precio sigue siendo por tier
  // (ProductOption.price_child_usd); esto solo habilita/deshabilita ofrecerlo.
  accepts_children: boolean;
  children_age_label: string | null;
  infant_age_label: string | null;
  images: ProductImage[];
  options: ProductOption[];
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

export interface ApiResponse<T> {
  data: T;
}
