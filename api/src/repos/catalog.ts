import { pool } from '../db.js';
import type { Category, MenuCourse, MenuItem, ProductDetail, ProductImage, ProductMenu, ProductOption, ProductSummary } from '../types.js';

interface MenuRow {
  id: number;
  option_id: number | null;
  title_es: string | null;
  title_en: string | null;
  note_es: string | null;
  note_en: string | null;
  is_visible: boolean;
}

// Trae los menús visibles de una casa (general + los propios de cada tier) con
// sus cursos/ítems, y arma un resolver: por cada option_id con has_dinner=true
// devuelve el menú efectivo (propio si existe, aunque esté oculto — ahí no
// muestra nada, sin caer al general; si no existe propio, cae al general
// heredado si está visible). Se hace en 3 queries fijas (no N+1 por tier).
async function resolveProductMenus(
  productId: number,
  options: { id: number; has_dinner: boolean }[],
): Promise<Map<number, ProductMenu | null>> {
  const result = new Map<number, ProductMenu | null>();
  const dinnerOptionIds = options.filter((o) => o.has_dinner).map((o) => o.id);
  if (dinnerOptionIds.length === 0) return result;

  const { rows: menuRows } = await pool.query<MenuRow>(
    `SELECT id, option_id, title_es, title_en, note_es, note_en, is_visible
       FROM product_menus
      WHERE product_id = $1`,
    [productId],
  );
  if (menuRows.length === 0) {
    for (const id of dinnerOptionIds) result.set(id, null);
    return result;
  }

  const menuIds = menuRows.map((m) => m.id);
  const { rows: courseRows } = await pool.query<{ id: number; menu_id: number; name_es: string; name_en: string }>(
    `SELECT id, menu_id, name_es, name_en
       FROM product_menu_courses
      WHERE menu_id = ANY($1)
      ORDER BY display_order`,
    [menuIds],
  );
  const courseIds = courseRows.map((c) => c.id);
  const { rows: itemRows } = courseIds.length
    ? await pool.query<{ id: number; course_id: number; name_es: string; name_en: string }>(
        `SELECT id, course_id, name_es, name_en
           FROM product_menu_items
          WHERE course_id = ANY($1)
          ORDER BY display_order`,
        [courseIds],
      )
    : { rows: [] };

  const itemsByCourse = new Map<number, MenuItem[]>();
  for (const it of itemRows) {
    const list = itemsByCourse.get(it.course_id) ?? [];
    list.push({ id: it.id, name_es: it.name_es, name_en: it.name_en });
    itemsByCourse.set(it.course_id, list);
  }
  const coursesByMenu = new Map<number, MenuCourse[]>();
  for (const c of courseRows) {
    const list = coursesByMenu.get(c.menu_id) ?? [];
    list.push({ id: c.id, name_es: c.name_es, name_en: c.name_en, items: itemsByCourse.get(c.id) ?? [] });
    coursesByMenu.set(c.menu_id, list);
  }

  const toMenu = (row: MenuRow, isInherited: boolean): ProductMenu => ({
    id: row.id,
    title_es: row.title_es,
    title_en: row.title_en,
    note_es: row.note_es,
    note_en: row.note_en,
    is_inherited: isInherited,
    courses: coursesByMenu.get(row.id) ?? [],
  });

  const general = menuRows.find((m) => m.option_id === null) ?? null;
  const byOption = new Map(menuRows.filter((m) => m.option_id !== null).map((m) => [m.option_id as number, m]));

  for (const id of dinnerOptionIds) {
    const own = byOption.get(id);
    if (own) {
      result.set(id, own.is_visible ? toMenu(own, false) : null);
    } else {
      result.set(id, general && general.is_visible ? toMenu(general, true) : null);
    }
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
       p.video_url,
       p.available_days,
       p.starting_price_usd::float AS starting_price_usd
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
    pool.query<ProductOption>(
      `SELECT
         id, code, name_es, name_en, description_es, description_en,
         includes_es, includes_en,
         price_adult_usd::float AS price_adult_usd,
         price_child_usd::float AS price_child_usd,
         has_dinner, has_transfer,
         transfer_price_usd::float AS transfer_price_usd,
         available_days,
         pickup_window_es, pickup_window_en,
         dinner_time_es, dinner_time_en,
         show_time_es, show_time_en,
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
    options: optionsRes.rows.map((o) => ({ ...o, menu: menuByOption.get(o.id) ?? null })),
  };
}
