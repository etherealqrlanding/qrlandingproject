import type { PoolClient } from 'pg';
import { pool } from '../db.js';

// Menús de comida por casa/servicio. Ver api/migrations/039_product_menus.sql.
// Guardado como reemplazo total transaccional por menú (no CRUD fino de curso/
// ítem individual) — es contenido editorial que se edita en bloque desde el admin.

export interface AdminMenuItemInput {
  name_es: string;
  name_en: string;
}

export interface AdminMenuCourseInput {
  name_es: string;
  name_en: string;
  items: AdminMenuItemInput[];
}

export interface AdminMenuInput {
  title_es?: string | null;
  title_en?: string | null;
  note_es?: string | null;
  note_en?: string | null;
  is_visible?: boolean;
  courses: AdminMenuCourseInput[];
}

export interface AdminMenu {
  id: number;
  option_id: number | null;
  title_es: string | null;
  title_en: string | null;
  note_es: string | null;
  note_en: string | null;
  is_visible: boolean;
  courses: {
    id: number;
    name_es: string;
    name_en: string;
    items: { id: number; name_es: string; name_en: string }[];
  }[];
}

export async function listProductMenus(productId: number): Promise<AdminMenu[]> {
  const { rows: menus } = await pool.query(
    `SELECT id, option_id, title_es, title_en, note_es, note_en, is_visible
       FROM product_menus WHERE product_id = $1`,
    [productId],
  );
  if (menus.length === 0) return [];

  const menuIds = menus.map((m) => m.id);
  const { rows: courses } = await pool.query(
    `SELECT id, menu_id, name_es, name_en FROM product_menu_courses
      WHERE menu_id = ANY($1) ORDER BY display_order`,
    [menuIds],
  );
  const courseIds = courses.map((c) => c.id);
  const { rows: items } = courseIds.length
    ? await pool.query(
        `SELECT id, course_id, name_es, name_en FROM product_menu_items
          WHERE course_id = ANY($1) ORDER BY display_order`,
        [courseIds],
      )
    : { rows: [] as { id: number; course_id: number; name_es: string; name_en: string }[] };

  const itemsByCourse = new Map<number, AdminMenu['courses'][number]['items']>();
  for (const it of items) {
    const list = itemsByCourse.get(it.course_id) ?? [];
    list.push({ id: it.id, name_es: it.name_es, name_en: it.name_en });
    itemsByCourse.set(it.course_id, list);
  }
  const coursesByMenu = new Map<number, AdminMenu['courses']>();
  for (const c of courses) {
    const list = coursesByMenu.get(c.menu_id) ?? [];
    list.push({ id: c.id, name_es: c.name_es, name_en: c.name_en, items: itemsByCourse.get(c.id) ?? [] });
    coursesByMenu.set(c.menu_id, list);
  }

  return menus.map((m) => ({ ...m, courses: coursesByMenu.get(m.id) ?? [] }));
}

async function replaceMenuCourses(
  client: PoolClient,
  menuId: number,
  courses: AdminMenuCourseInput[],
): Promise<void> {
  await client.query(`DELETE FROM product_menu_courses WHERE menu_id = $1`, [menuId]);
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO product_menu_courses (menu_id, name_es, name_en, display_order)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [menuId, course.name_es, course.name_en, i],
    );
    const courseId = rows[0].id;
    for (let j = 0; j < course.items.length; j++) {
      const item = course.items[j];
      await client.query(
        `INSERT INTO product_menu_items (course_id, name_es, name_en, display_order)
         VALUES ($1,$2,$3,$4)`,
        [courseId, item.name_es, item.name_en, j],
      );
    }
  }
}

export async function upsertGeneralMenu(productId: number, input: AdminMenuInput): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO product_menus (product_id, option_id, title_es, title_en, note_es, note_en, is_visible)
       VALUES ($1, NULL, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id) WHERE option_id IS NULL
       DO UPDATE SET title_es = EXCLUDED.title_es, title_en = EXCLUDED.title_en,
                      note_es = EXCLUDED.note_es, note_en = EXCLUDED.note_en,
                      is_visible = EXCLUDED.is_visible, updated_at = NOW()
       RETURNING id`,
      [productId, input.title_es ?? null, input.title_en ?? null, input.note_es ?? null, input.note_en ?? null, input.is_visible ?? true],
    );
    await replaceMenuCourses(client, rows[0].id, input.courses);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Devuelve `null` si la opción no existe (el caller debe responder 404). */
export async function upsertOptionMenu(optionId: number, input: AdminMenuInput): Promise<{ ok: true } | null> {
  const { rows: optRows } = await pool.query<{ product_id: number }>(
    `SELECT product_id FROM product_options WHERE id = $1`, [optionId],
  );
  if (!optRows[0]) return null;
  const productId = optRows[0].product_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO product_menus (product_id, option_id, title_es, title_en, note_es, note_en, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (option_id) WHERE option_id IS NOT NULL
       DO UPDATE SET title_es = EXCLUDED.title_es, title_en = EXCLUDED.title_en,
                      note_es = EXCLUDED.note_es, note_en = EXCLUDED.note_en,
                      is_visible = EXCLUDED.is_visible, updated_at = NOW()
       RETURNING id`,
      [productId, optionId, input.title_es ?? null, input.title_en ?? null, input.note_es ?? null, input.note_en ?? null, input.is_visible ?? true],
    );
    await replaceMenuCourses(client, rows[0].id, input.courses);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteGeneralMenu(productId: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM product_menus WHERE product_id = $1 AND option_id IS NULL`, [productId]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteOptionMenu(optionId: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM product_menus WHERE option_id = $1`, [optionId]);
  return (result.rowCount ?? 0) > 0;
}
