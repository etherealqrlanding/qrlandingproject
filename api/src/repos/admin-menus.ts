import { pool } from '../db.js';
import { sanitizeMenuHtml } from '../lib/sanitizeHtml.js';

// Menús de comida por servicio. Ver api/migrations/039_product_menus.sql,
// 040_simplify_menus.sql y 041_menu_option_only.sql. Un menú es un título +
// un bloque de texto enriquecido (HTML con negrita/subrayado/listas), sin
// traducción, siempre atado a un tier con has_dinner=true (no hay menú
// "general de la casa" — cada servicio carga el suyo).

export interface AdminMenuInput {
  title?: string | null;
  content_html: string;
  is_visible?: boolean;
}

export interface AdminMenu {
  id: number;
  option_id: number;
  title: string | null;
  content_html: string;
  is_visible: boolean;
}

export async function listProductMenus(productId: number): Promise<AdminMenu[]> {
  const { rows } = await pool.query<AdminMenu>(
    `SELECT id, option_id, title, content_html, is_visible
       FROM product_menus WHERE product_id = $1`,
    [productId],
  );
  return rows;
}

/** Devuelve `null` si la opción no existe (el caller debe responder 404). */
export async function upsertOptionMenu(optionId: number, input: AdminMenuInput): Promise<{ ok: true } | null> {
  const { rows: optRows } = await pool.query<{ product_id: number }>(
    `SELECT product_id FROM product_options WHERE id = $1`, [optionId],
  );
  if (!optRows[0]) return null;
  const productId = optRows[0].product_id;

  await pool.query(
    `INSERT INTO product_menus (product_id, option_id, title, content_html, is_visible)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (option_id)
     DO UPDATE SET title = EXCLUDED.title, content_html = EXCLUDED.content_html,
                    is_visible = EXCLUDED.is_visible, updated_at = NOW()`,
    [productId, optionId, input.title ?? null, sanitizeMenuHtml(input.content_html), input.is_visible ?? true],
  );
  return { ok: true };
}

export async function deleteOptionMenu(optionId: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM product_menus WHERE option_id = $1`, [optionId]);
  return (result.rowCount ?? 0) > 0;
}
