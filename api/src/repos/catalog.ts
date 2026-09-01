import { pool } from '../db.js';
import type { Category, ProductDetail, ProductImage, ProductMenu, ProductOption, ProductSummary } from '../types.js';

// Resuelve los horarios EFECTIVOS de un tier a partir de los 4 horarios
// configurados una sola vez a nivel casa + los checks del propio tier
// (has_dinner / show_only_time_enabled) -- reemplaza los viejos campos de
// texto libre por tier (pickup_window/dinner_time/show_time), que ya no
// existen en product_options. Si un tier tiene ambos checks activos, el
// traslado muestra las dos ventanas (son horarios distintos).
export function resolveOptionSchedule(
  product: {
    dinner_show_time_es: string | null;
    show_only_time_es: string | null;
    dinner_transfer_window_es: string | null;
    show_only_transfer_window_es: string | null;
  },
  option: { has_dinner: boolean; show_only_time_enabled: boolean },
): { pickup_window_es: string | null; dinner_time_es: string | null; show_time_es: string | null } {
  const dinner_time_es = option.has_dinner ? product.dinner_show_time_es : null;
  const show_time_es = option.show_only_time_enabled ? product.show_only_time_es : null;
  const pickupParts = [
    option.has_dinner ? product.dinner_transfer_window_es : null,
    option.show_only_time_enabled ? product.show_only_transfer_window_es : null,
  ].filter((v): v is string => Boolean(v));
  return {
    dinner_time_es,
    show_time_es,
    pickup_window_es: pickupParts.length > 0 ? pickupParts.join(' · ') : null,
  };
}

interface MenuRow {
  id: number;
  option_id: number;
  title: string | null;
  content_html: string;
  is_visible: boolean;
}

// Trae los menús propios de cada tier con has_dinner=true de una casa (no hay
// menú "general de la casa": cada servicio carga el suyo). Si un tier tiene
// menú pero está oculto (is_visible=false), no muestra nada — no hay
// fallback. Una sola query fija (no N+1 por tier).
async function resolveProductMenus(
  productId: number,
  options: { id: number; has_dinner: boolean }[],
): Promise<Map<number, ProductMenu | null>> {
  const result = new Map<number, ProductMenu | null>();
  const dinnerOptionIds = options.filter((o) => o.has_dinner).map((o) => o.id);
  if (dinnerOptionIds.length === 0) return result;

  const { rows: menuRows } = await pool.query<MenuRow>(
    `SELECT id, option_id, title, content_html, is_visible
       FROM product_menus
      WHERE product_id = $1`,
    [productId],
  );
  if (menuRows.length === 0) {
    for (const id of dinnerOptionIds) result.set(id, null);
    return result;
  }

  const toMenu = (row: MenuRow): ProductMenu => ({
    id: row.id,
    title: row.title,
    content_html: row.content_html,
  });

  const byOption = new Map(menuRows.map((m) => [m.option_id, m]));

  for (const id of dinnerOptionIds) {
    const own = byOption.get(id);
    result.set(id, own && own.is_visible ? toMenu(own) : null);
  }
  return result;
}

export async function listCategories(): Promise<Category[]> {
  const { rows } = await pool.query<Category>(
    `SELECT id, slug, name_es, name_en, description_es, description_en, display_order
       FROM categories
      WHERE is_active = TRUE
      ORDER BY display_order, name_es`,
  );
  return rows;
}

export async function listProducts(opts?: { categorySlug?: string }): Promise<ProductSummary[]> {
  const params: unknown[] = [];
  const where: string[] = ['p.is_active = TRUE'];

  if (opts?.categorySlug) {
    params.push(opts.categorySlug);
    where.push(`c.slug = $${params.length}`);
  }

  const { rows } = await pool.query<ProductSummary>(
    `SELECT
       p.id, p.slug, p.name, p.venue_name,
       c.slug AS category_slug,
       p.short_description_es, p.short_description_en,
       p.address_es, p.address_en,
       p.neighborhood_es, p.neighborhood_en,
       p.tagline_es, p.tagline_en,
       p.badge_es, p.badge_en,
       p.starting_price_usd::float AS starting_price_usd,
       p.logo_url,
       (
         SELECT pi.url FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.is_hero DESC, pi.display_order
          LIMIT 1
       ) AS hero_image,
       (
         SELECT array_agg(po.name_es ORDER BY po.display_order)
           FROM product_options po
          WHERE po.product_id = p.id AND po.is_active = TRUE
       ) AS option_names_es,
       (
         SELECT array_agg(po.name_en ORDER BY po.display_order)
           FROM product_options po
          WHERE po.product_id = p.id AND po.is_active = TRUE
       ) AS option_names_en
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.display_order, p.name`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    option_names_es: r.option_names_es ?? [],
    option_names_en: r.option_names_en ?? [],
  }));
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const { rows: prodRows } = await pool.query(
    `SELECT
       p.id, p.slug, p.name, p.venue_name,
       c.slug AS category_slug,
       p.short_description_es, p.short_description_en,
       p.long_description_es, p.long_description_en,
       p.address_es, p.address_en,
       p.neighborhood_es, p.neighborhood_en,
       p.tagline_es, p.tagline_en,
       p.badge_es, p.badge_en,
       p.schedule_summary_es, p.schedule_summary_en,
       p.dinner_show_time_es, p.show_only_time_es,
       p.dinner_transfer_window_es, p.show_only_transfer_window_es,
       p.video_url,
       p.available_days,
       p.starting_price_usd::float AS starting_price_usd,
       p.accepts_children, p.children_age_label, p.infant_age_label, p.logo_url
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1 AND p.is_active = TRUE
      LIMIT 1`,
    [slug],
  );
  const product = prodRows[0];
  if (!product) return null;

  const [imagesRes, optionsRes] = await Promise.all([
    pool.query<ProductImage>(
      `SELECT id, url, alt_text, is_hero, display_order
         FROM product_images
        WHERE product_id = $1
        ORDER BY is_hero DESC, display_order`,
      [product.id],
    ),
    pool.query<Omit<ProductOption, 'pickup_window_es' | 'dinner_time_es' | 'show_time_es'> & { show_only_time_enabled: boolean }>(
      `SELECT
         id, code, name_es, name_en, description_es, description_en,
         includes_es, includes_en,
         price_adult_usd::float AS price_adult_usd,
         price_child_usd::float AS price_child_usd,
         has_dinner, show_only_time_enabled, transfer_mode,
         transfer_price_usd::float AS transfer_price_usd,
         transfer_price_usd_palermo::float AS transfer_price_usd_palermo,
         available_days,
         display_order
         FROM product_options
        WHERE product_id = $1 AND is_active = TRUE
        ORDER BY display_order`,
      [product.id],
    ),
  ]);

  const menuByOption = await resolveProductMenus(product.id, optionsRes.rows);

  return {
    ...product,
    hero_image: imagesRes.rows.find((i) => i.is_hero)?.url ?? imagesRes.rows[0]?.url ?? null,
    images: imagesRes.rows,
    options: optionsRes.rows.map(({ show_only_time_enabled, ...o }) => ({
      ...o,
      ...resolveOptionSchedule(product, { has_dinner: o.has_dinner, show_only_time_enabled }),
      menu: menuByOption.get(o.id) ?? null,
    })),
  };
}
