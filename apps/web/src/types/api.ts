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
  starting_price_usd: number | null;
  hero_image: string | null;
}

export interface ProductDetail extends ProductSummary {
  long_description_es: string | null;
  long_description_en: string | null;
  address_es: string | null;
  address_en: string | null;
  schedule_summary_es: string | null;
  schedule_summary_en: string | null;
  images: ProductImage[];
  options: ProductOption[];
}

export interface ApiResponse<T> {
  data: T;
}
