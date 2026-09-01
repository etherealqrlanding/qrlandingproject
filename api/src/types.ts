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

export interface ProductMenu {
  id: number;
  title: string | null;
  // HTML con formato simple (negrita, subrayado, listas) tal como lo cargó
  // el admin — sin traducción, en el idioma original del sitio.
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
  // Resueltos a partir de los horarios de la casa (ProductDetail) + los checks de
  // este tier (has_dinner / show_only_time_enabled) -- ya no se tipean por tier.
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
  // Logo de la casa — si está cargado, reemplaza hero_image como imagen de la card
  // (ver ProductCard.tsx). Independiente de la galería de fotos.
  logo_url: string | null;
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
  // Horarios estructurados de la casa, fuente de los campos resueltos de cada
  // tier (ver ProductOption.pickup_window_es/dinner_time_es/show_time_es).
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
  // Rango de edad de infantes (texto libre, ej. "0 a 2 años") -- a diferencia de
  // children_age_label, siempre aplica (los infantes existen en todos los servicios).
  infant_age_label: string | null;
  images: ProductImage[];
  options: ProductOption[];
}
