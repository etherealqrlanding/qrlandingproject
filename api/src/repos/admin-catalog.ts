import { pool } from '../db.js';

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
  schedule_summary_es?: string | null;
  schedule_summary_en?: string | null;
  starting_price_usd?: number | null;
  is_active?: boolean;
  display_order?: number;
}

export async function adminListProducts() {
  const { rows } = await pool.query(
    `SELECT
       p.id, p.slug, p.name, p.venue_name, p.is_active, p.display_order,
       p.starting_price_usd::float AS starting_price_usd,
       c.id AS category_id, c.slug AS category_slug, c.name_es AS category_name_es,
       p.updated_at,
       (SELECT COUNT(*) FROM product_options o WHERE o.product_id = p.id) AS options_count,
       (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id) AS images_count
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
  const [optsRes, imgsRes] = await Promise.all([
    pool.query(
      `SELECT * FROM product_options WHERE product_id = $1 ORDER BY display_order`,
      [id],
    ),
    pool.query(
      `SELECT * FROM product_images WHERE product_id = $1 ORDER BY is_hero DESC, display_order`,
      [id],
    ),
  ]);
  return { ...prod[0], options: optsRes.rows, images: imgsRes.rows };
}

export async function adminCreateProduct(input: AdminProductInput): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO products (
       slug, category_id, name, venue_name,
       short_description_es, short_description_en,
       long_description_es, long_description_en,
       address_es, address_en,
       schedule_summary_es, schedule_summary_en,
       starting_price_usd, is_active, display_order
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      input.slug, input.category_id, input.name, input.venue_name,
      input.short_description_es ?? null, input.short_description_en ?? null,
      input.long_description_es ?? null, input.long_description_en ?? null,
      input.address_es ?? null, input.address_en ?? null,
      input.schedule_summary_es ?? null, input.schedule_summary_en ?? null,
      input.starting_price_usd ?? null,
      input.is_active ?? true,
      input.display_order ?? 0,
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

// ─── Opciones ───────────────────────────────────────────

export interface AdminOptionInput {
  code: string;
  name_es: string;
  name_en: string;
  description_es?: string | null;
  description_en?: string | null;
  includes_es?: string[];
  includes_en?: string[];
  price_adult_usd: number;
  price_child_usd?: number | null;
  has_dinner?: boolean;
  has_transfer?: boolean;
  transfer_price_usd?: number;
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
       has_dinner, has_transfer, transfer_price_usd, available_days,
       pickup_window_es, pickup_window_en,
       dinner_time_es, dinner_time_en,
       show_time_es, show_time_en,
       default_capacity_per_day, display_order, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING id`,
    [
      productId, input.code, input.name_es, input.name_en,
      input.description_es ?? null, input.description_en ?? null,
      input.includes_es ?? [], input.includes_en ?? [],
      input.price_adult_usd, input.price_child_usd ?? null,
      input.has_dinner ?? false, input.has_transfer ?? false,
      input.transfer_price_usd ?? 0,
      input.available_days ?? [1,2,3,4,5,6,7],
      input.pickup_window_es ?? null, input.pickup_window_en ?? null,
      input.dinner_time_es ?? null, input.dinner_time_en ?? null,
      input.show_time_es ?? null, input.show_time_en ?? null,
      input.default_capacity_per_day ?? 80,
      input.display_order ?? 0, input.is_active ?? true,
    ],
  );
  return rows[0].id;
}

export async function adminUpdateOption(id: number, input: Partial<AdminOptionInput>): Promise<boolean> {
  const fields = Object.keys(input);
  if (fields.length === 0) return true;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map((f) => (input as Record<string, unknown>)[f]);
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
