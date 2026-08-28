import { pool } from '../db.js';
import { listProductMenus } from './admin-menus.js';
import { sanitizeMenuHtml } from '../lib/sanitizeHtml.js';

// Cada ítem de "Incluye" admite negrita/cursiva/subrayado (se edita con
// IncludesEditor, un <ul contentEditable>) — se sanitiza igual que el HTML
// de los menús antes de guardar.
function sanitizeIncludes(items?: string[]): string[] | undefined {
  return items?.map((it) => sanitizeMenuHtml(it));
}

// ─── Productos ──────────────────────────────────────────

export interface AdminProductInput {
  slug: string;
  category_id: number;
  name: string;
  venue_name: string;
  short_description_es?: string | null;
  short_description_en?: string | null;
  long_description_es?: string | null;
  long_description_en?: string | null;
  address_es?: string | null;
  address_en?: string | null;
  neighborhood_es?: string | null;
  neighborhood_en?: string | null;
  tagline_es?: string | null;
  tagline_en?: string | null;
  badge_es?: string | null;
  badge_en?: string | null;
  schedule_summary_es?: string | null;
  schedule_summary_en?: string | null;
  video_url?: string | null;
  starting_price_usd?: number | null;
  is_active?: boolean;
  display_order?: number;
  available_days?: number[];
  // Legado: ya no se usa para nada (antes gateaba si se ofrecía precio de menor, pero
  // eso generaba errores -- todas las casas admiten menores, lo que varía es si un
  // tier puntual tiene price_child_usd cargado). Se mantiene la columna sin uso activo.
  accepts_children?: boolean;
  // Texto libre del rango de edad (ej. "3 a 10 años") -- siempre relevante, se muestra
  // junto al campo de menores en cualquier tier que tenga price_child_usd cargado.
  children_age_label?: string | null;
  // Texto libre del rango de edad de infantes (ej. "0 a 2 años") -- a diferencia de
  // children_age_label, siempre aplica (los infantes existen en todos los servicios).
  infant_age_label?: string | null;
  // Logo de la casa — reemplaza la foto de portada en las cards (catálogo público y
  // listado del admin). Independiente de la galería de fotos (product_images).
  logo_url?: string | null;
}

export async function adminListProducts() {
  const { rows } = await pool.query(
    `SELECT
       p.id, p.slug, p.name, p.venue_name, p.is_active, p.display_order,
       p.starting_price_usd::float AS starting_price_usd,
       p.accepts_children, p.children_age_label, p.infant_age_label, p.logo_url,
       c.id AS category_id, c.slug AS category_slug, c.name_es AS category_name_es,
       p.updated_at,
       (SELECT COUNT(*) FROM product_options o WHERE o.product_id = p.id) AS options_count,
       (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id) AS images_count,
       (SELECT i.url FROM product_images i WHERE i.product_id = p.id AND i.is_hero = TRUE ORDER BY i.display_order LIMIT 1) AS hero_image_url,
       (SELECT COALESCE(json_agg(to_jsonb(opt) ORDER BY opt.display_order), '[]'::json)
          FROM (
            SELECT o.id, o.code, o.name_es,
                   o.price_adult_usd::float        AS price_adult_usd,
                   o.price_child_usd::float        AS price_child_usd,
                   o.net_price_adult_usd::float    AS net_price_adult_usd,
                   o.net_price_child_usd::float    AS net_price_child_usd,
                   o.net_price_currency,
                   o.net_price_adult_ars::float    AS net_price_adult_ars,
                   o.net_price_child_ars::float    AS net_price_child_ars,
                   o.net_transfer_price_ars::float AS net_transfer_price_ars,
                   o.transfer_mode,
                   o.transfer_price_usd::float     AS transfer_price_usd,
                   o.net_transfer_price_usd::float AS net_transfer_price_usd,
                   o.default_capacity_per_day,
                   o.is_active, o.display_order
              FROM product_options o
             WHERE o.product_id = p.id
          ) opt
       ) AS options
       FROM products p
       JOIN categories c ON c.id = p.category_id
      ORDER BY p.display_order, p.name`,
  );
  return rows;
}

export async function adminGetProduct(id: number) {
  const { rows: prod } = await pool.query(
    `SELECT * FROM products WHERE id = $1 LIMIT 1`, [id],
  );
  if (!prod[0]) return null;
  const [optsRes, imgsRes, menus] = await Promise.all([
    pool.query(
      `SELECT * FROM product_options WHERE product_id = $1 ORDER BY display_order`,
      [id],
    ),
    pool.query(
      `SELECT * FROM product_images WHERE product_id = $1 ORDER BY is_hero DESC, display_order`,
      [id],
    ),
    listProductMenus(id),
  ]);
  // Postgres devuelve columnas NUMERIC como string en un SELECT *. El front espera
  // números (y al reenviarlos en el PATCH, zod los rechazaría como string). Coaccionamos.
  const num = (v: unknown) => (v == null ? v : Number(v));
  const options = optsRes.rows.map((o) => ({
    ...o,
    price_adult_usd: num(o.price_adult_usd),
    price_child_usd: num(o.price_child_usd),
    net_price_adult_usd: num(o.net_price_adult_usd),
    net_price_child_usd: num(o.net_price_child_usd),
    net_transfer_price_usd: num(o.net_transfer_price_usd),
    transfer_price_usd: num(o.transfer_price_usd),
    net_price_adult_ars: num(o.net_price_adult_ars),
    net_price_child_ars: num(o.net_price_child_ars),
    net_transfer_price_ars: num(o.net_transfer_price_ars),
    commission_adjustment_percent: num(o.commission_adjustment_percent),
  }));
  return { ...prod[0], starting_price_usd: num(prod[0].starting_price_usd), options, images: imgsRes.rows, menus };
}

export async function adminCreateProduct(input: AdminProductInput): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO products (
       slug, category_id, name, venue_name,
       short_description_es, short_description_en,
       long_description_es, long_description_en,
       address_es, address_en,
       neighborhood_es, neighborhood_en,
       tagline_es, tagline_en,
       badge_es, badge_en,
       schedule_summary_es, schedule_summary_en,
       video_url,
       starting_price_usd, is_active, display_order, available_days, accepts_children, children_age_label,
       logo_url, infant_age_label
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     RETURNING id`,
    [
      input.slug, input.category_id, input.name, input.venue_name,
      input.short_description_es ?? null, input.short_description_en ?? null,
      input.long_description_es ?? null, input.long_description_en ?? null,
      input.address_es ?? null, input.address_en ?? null,
      input.neighborhood_es ?? null, input.neighborhood_en ?? null,
      input.tagline_es ?? null, input.tagline_en ?? null,
      input.badge_es ?? null, input.badge_en ?? null,
      input.schedule_summary_es ?? null, input.schedule_summary_en ?? null,
      input.video_url ?? null,
      input.starting_price_usd ?? null,
      input.is_active ?? true,
      input.display_order ?? 0,
      input.available_days ?? [1, 2, 3, 4, 5, 6, 7],
      input.accepts_children ?? false,
      input.children_age_label ?? null,
      input.logo_url ?? null,
      input.infant_age_label ?? null,
    ],
  );
  return rows[0].id;
}

export async function adminUpdateProduct(id: number, input: Partial<AdminProductInput>): Promise<boolean> {
  const fields = Object.keys(input);
  if (fields.length === 0) return true;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map((f) => (input as Record<string, unknown>)[f]);
  const result = await pool.query(
    `UPDATE products SET ${sets} WHERE id = $${fields.length + 1}`,
    [...values, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function adminDeleteProduct(id: number): Promise<boolean> {
  // Soft delete: marcar inactivo. Si fuera hard delete podrían perderse referencias
  // desde order_items (FK RESTRICT).
  const result = await pool.query(`UPDATE products SET is_active = FALSE WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Hard delete de un producto. Solo se permite si NO aparece en órdenes históricas
 * (order_items.product_id es FK RESTRICT, y queremos preservar el historial de ventas).
 * Si tiene ventas, devuelve { blocked: true, orderCount } y NO borra nada — el front
 * debe ofrecer desactivarlo en su lugar.
 * Al borrar, el ON DELETE CASCADE limpia product_options, product_images y option_availability.
 */
export async function adminHardDeleteProduct(
  id: number,
): Promise<{ deleted: boolean; blocked: boolean; orderCount: number }> {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = $1`,
    [id],
  );
  const orderCount = parseInt(rows[0].cnt, 10);
  if (orderCount > 0) {
    return { deleted: false, blocked: true, orderCount };
  }
  const result = await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
  return { deleted: (result.rowCount ?? 0) > 0, blocked: false, orderCount: 0 };
}

// ─── Opciones ───────────────────────────────────────────

export interface AdminOptionInput {
  code: string;
  name_es: string;
  name_en?: string | null;
  description_es?: string | null;
  description_en?: string | null;
  includes_es?: string[];
  includes_en?: string[];
  price_adult_usd: number;
  price_child_usd?: number | null;
  net_price_adult_usd?: number | null;
  net_price_child_usd?: number | null;
  has_dinner?: boolean;
  transfer_mode?: 'none' | 'optional' | 'included';
  transfer_price_usd?: number;
  infant_transfer_chargeable?: boolean;
  // Ajuste general de comisión (%, puede ser negativo) -- se suma a la base del perfil
  // del vendedor salvo que exista un override puntual (ver option_kind_commission_adjustments).
  commission_adjustment_percent?: number;
  net_transfer_price_usd?: number | null;
  net_price_currency?: 'USD' | 'ARS' | null;
  net_price_adult_ars?: number | null;
  net_price_child_ars?: number | null;
  net_transfer_price_ars?: number | null;
  available_days?: number[];
  pickup_window_es?: string | null;
  pickup_window_en?: string | null;
  dinner_time_es?: string | null;
  dinner_time_en?: string | null;
  show_time_es?: string | null;
  show_time_en?: string | null;
  default_capacity_per_day?: number;
  display_order?: number;
  is_active?: boolean;
}

export async function adminCreateOption(productId: number, input: AdminOptionInput): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO product_options (
       product_id, code, name_es, name_en, description_es, description_en,
       includes_es, includes_en, price_adult_usd, price_child_usd,
       net_price_adult_usd, net_price_child_usd,
       has_dinner, transfer_mode, transfer_price_usd, net_transfer_price_usd,
       net_price_currency, net_price_adult_ars, net_price_child_ars, net_transfer_price_ars,
       available_days,
       pickup_window_es, pickup_window_en,
       dinner_time_es, dinner_time_en,
       show_time_es, show_time_en,
       default_capacity_per_day, display_order, is_active, infant_transfer_chargeable,
       commission_adjustment_percent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
     RETURNING id`,
    [
      productId, input.code, input.name_es, input.name_en?.trim() || input.name_es,
      input.description_es ?? null, input.description_en ?? null,
      sanitizeIncludes(input.includes_es) ?? [], sanitizeIncludes(input.includes_en) ?? [],
      input.price_adult_usd, input.price_child_usd ?? null,
      input.net_price_adult_usd ?? null, input.net_price_child_usd ?? null,
      input.has_dinner ?? false, input.transfer_mode ?? 'none',
      input.transfer_price_usd ?? 0, input.net_transfer_price_usd ?? null,
      input.net_price_currency ?? 'USD',
      input.net_price_adult_ars ?? null, input.net_price_child_ars ?? null, input.net_transfer_price_ars ?? null,
      input.available_days ?? [1,2,3,4,5,6,7],
      input.pickup_window_es ?? null, input.pickup_window_en ?? null,
      input.dinner_time_es ?? null, input.dinner_time_en ?? null,
      input.show_time_es ?? null, input.show_time_en ?? null,
      input.default_capacity_per_day ?? 80,
      input.display_order ?? 0, input.is_active ?? true,
      input.infant_transfer_chargeable ?? false,
      input.commission_adjustment_percent ?? 0,
    ],
  );
  return rows[0].id;
}

export async function adminUpdateOption(id: number, input: Partial<AdminOptionInput>): Promise<boolean> {
  // net_price_currency is NOT NULL in DB — drop null to avoid constraint violation
  const safeInput: Partial<AdminOptionInput> = { ...input };
  if (safeInput.net_price_currency == null) delete safeInput.net_price_currency;
  if (safeInput.includes_es) safeInput.includes_es = sanitizeIncludes(safeInput.includes_es);
  if (safeInput.includes_en) safeInput.includes_en = sanitizeIncludes(safeInput.includes_en);
  const fields = Object.keys(safeInput);
  if (fields.length === 0) return true;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map((f) => (safeInput as Record<string, unknown>)[f]);
  const result = await pool.query(
    `UPDATE product_options SET ${sets} WHERE id = $${fields.length + 1}`,
    [...values, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function adminDeleteOption(id: number): Promise<boolean> {
  // Hard delete: las opciones pueden borrarse si no tienen órdenes asociadas.
  // Si fallara por FK, hacer soft delete con is_active = FALSE.
  try {
    const result = await pool.query(`DELETE FROM product_options WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    const result = await pool.query(`UPDATE product_options SET is_active = FALSE WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

// ─── Ajustes de comisión por perfil (override puntual tier+kind) ────────────
// Reemplaza (no suma) el ajuste general del tier, solo para ese perfil de vendedor
// puntual -- ver api/src/services/commission.ts para cómo se combinan.

export interface OptionKindAdjustment {
  seller_kind: string;
  adjustment_percent: number;
}

export async function getOptionKindAdjustments(optionId: number): Promise<OptionKindAdjustment[]> {
  const { rows } = await pool.query<{ seller_kind: string; adjustment_percent: number }>(
    `SELECT seller_kind, adjustment_percent::float AS adjustment_percent
       FROM option_kind_commission_adjustments
      WHERE option_id = $1
      ORDER BY seller_kind`,
    [optionId],
  );
  return rows;
}

export async function upsertOptionKindAdjustment(
  optionId: number, sellerKind: string, adjustmentPercent: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO option_kind_commission_adjustments (option_id, seller_kind, adjustment_percent)
     VALUES ($1, $2, $3)
     ON CONFLICT (option_id, seller_kind) DO UPDATE
       SET adjustment_percent = EXCLUDED.adjustment_percent, updated_at = NOW()`,
    [optionId, sellerKind, adjustmentPercent],
  );
}

export async function deleteOptionKindAdjustment(optionId: number, sellerKind: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM option_kind_commission_adjustments WHERE option_id = $1 AND seller_kind = $2`,
    [optionId, sellerKind],
  );
  return (result.rowCount ?? 0) > 0;
}

// ─── Imágenes ───────────────────────────────────────────

export interface AdminImageInput {
  url: string;
  alt_text?: string | null;
  is_hero?: boolean;
  display_order?: number;
}

export async function adminCreateImage(productId: number, input: AdminImageInput): Promise<number> {
  // Si la nueva imagen es hero, desmarcamos las demás
  if (input.is_hero) {
    await pool.query(`UPDATE product_images SET is_hero = FALSE WHERE product_id = $1`, [productId]);
  }
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO product_images (product_id, url, alt_text, is_hero, display_order)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [productId, input.url, input.alt_text ?? null, input.is_hero ?? false, input.display_order ?? 0],
  );
  return rows[0].id;
}

export async function adminUpdateImage(id: number, input: Partial<AdminImageInput>): Promise<boolean> {
  if (input.is_hero) {
    const { rows: imgRows } = await pool.query<{ product_id: number }>(
      `SELECT product_id FROM product_images WHERE id = $1`, [id],
    );
    if (imgRows[0]) {
      await pool.query(`UPDATE product_images SET is_hero = FALSE WHERE product_id = $1`, [imgRows[0].product_id]);
    }
  }
  const fields = Object.keys(input);
  if (fields.length === 0) return true;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map((f) => (input as Record<string, unknown>)[f]);
  const result = await pool.query(
    `UPDATE product_images SET ${sets} WHERE id = $${fields.length + 1}`,
    [...values, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function adminDeleteImage(id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM product_images WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
