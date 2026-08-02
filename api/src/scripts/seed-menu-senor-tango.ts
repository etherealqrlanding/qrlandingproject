// Carga el menú piloto de Señor Tango (casa "senor-tango"), transcripto de
// tangosymilongas.com/micrositio-senor-tango/, como menú PROPIO de cada tier
// (no como menú general de la casa — cada tier tiene contenido distinto).
// Idempotente: no pisa un menú ya cargado a menos que se pase --force.
// Uso:
//   npm run seed:menu-senor-tango
//   npm run seed:menu-senor-tango -- --force
import { parseArgs } from 'node:util';
import { pool } from '../db.js';
import { listProductMenus, upsertOptionMenu } from '../repos/admin-menus.js';
import { toAdminMenuInput, type RawMenuInput } from './menuHtmlHelpers.js';

const PRODUCT_SLUG = 'senor-tango';

const NOTE_ES = 'Menú sujeto a sugerencia del chef y estacionalidad.';
const NOTE_EN = "Menu subject to the chef's recommendation and seasonal availability."; // no se usa (sin traducción), se deja por si se necesita en el futuro

const RAW_MENUS: Record<string, RawMenuInput> = {
  'cena-show-vip': {
    title_es: 'Menú Cena Show VIP',
    title_en: 'VIP Dinner Show Menu',
    note_es: NOTE_ES,
    note_en: NOTE_EN,
    is_visible: true,
    courses: [
      {
        name_es: 'Entrada', name_en: 'Starter',
        items: [
          { name_es: 'Variedad de canapés con copa de bienvenida (champagne)', name_en: 'Assorted canapés with a welcome glass of champagne' },
        ],
      },
      {
        name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
        items: [
          { name_es: 'Mollejas de corazón, langostinos y rúcula', name_en: 'Sweetbreads, prawns and arugula' },
          { name_es: 'Creps rellenos', name_en: 'Stuffed crêpes' },
        ],
      },
      {
        name_es: 'Segundo (a elección)', name_en: 'Second course (choice of)',
        items: [
          { name_es: 'Medallón de lomo con duxelles', name_en: 'Beef tenderloin medallion with duxelles' },
          { name_es: 'Bife de chorizo', name_en: 'Bife de chorizo steak' },
          { name_es: 'Trucha patagónica grillada', name_en: 'Grilled Patagonian trout' },
        ],
      },
      {
        name_es: 'Postre (a elección)', name_en: 'Dessert (choice of)',
        items: [
          { name_es: 'Pie de manzana con crema helada', name_en: 'Apple pie with ice cream' },
          { name_es: 'Mousse de maracuyá', name_en: 'Passion fruit mousse' },
        ],
      },
      {
        name_es: 'Bebidas', name_en: 'Drinks',
        items: [
          { name_es: 'Vino Luigi Bosca', name_en: 'Luigi Bosca wine' },
          { name_es: 'Vino Terrazas Reserva', name_en: 'Terrazas Reserva wine' },
          { name_es: 'Champagne Chandon', name_en: 'Chandon champagne' },
          { name_es: 'Cerveza', name_en: 'Beer' },
        ],
      },
    ],
  },
  'cena-show-ejecutiva': {
    title_es: 'Menú Cena Show Ejecutiva',
    title_en: 'Executive Dinner Show Menu',
    note_es: NOTE_ES,
    note_en: NOTE_EN,
    is_visible: true,
    courses: [
      {
        name_es: 'Entrada', name_en: 'Starter',
        items: [
          { name_es: 'Crepe de espinaca a la crema', name_en: 'Creamy spinach crêpe' },
        ],
      },
      {
        name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
        items: [
          { name_es: 'Bife de chorizo', name_en: 'Bife de chorizo steak' },
          { name_es: 'Pollo', name_en: 'Chicken' },
          { name_es: 'Trucha', name_en: 'Trout' },
          { name_es: 'Sorrentinos de jamón y queso', name_en: 'Ham and cheese sorrentinos' },
          { name_es: 'Sorrentinos de calabaza', name_en: 'Pumpkin sorrentinos' },
        ],
      },
      {
        name_es: 'Postre', name_en: 'Dessert',
        items: [
          { name_es: 'Pastel de chocolate húmedo', name_en: 'Moist chocolate cake' },
        ],
      },
    ],
  },
};

async function main() {
  const { values } = parseArgs({
    options: { force: { type: 'boolean', default: false } },
    allowPositionals: false,
  });

  const { rows: prodRows } = await pool.query<{ id: number }>(
    `SELECT id FROM products WHERE slug = $1`, [PRODUCT_SLUG],
  );
  const productId = prodRows[0]?.id;
  if (!productId) {
    console.error(`❌ No se encontró el producto con slug "${PRODUCT_SLUG}". Corré antes npm run import:houses.`);
    process.exit(1);
  }

  const { rows: optRows } = await pool.query<{ id: number; code: string }>(
    `SELECT id, code FROM product_options WHERE product_id = $1`, [productId],
  );

  const existing = await listProductMenus(productId);

  for (const [code, raw] of Object.entries(RAW_MENUS)) {
    const option = optRows.find((o) => o.code === code);
    if (!option) {
      console.warn(`⚠ No se encontró el tier "${code}" en Señor Tango — se salteó.`);
      continue;
    }
    const already = existing.find((m) => m.option_id === option.id);
    if (already && already.content_html.trim() && !values.force) {
      console.log(`⚠ El tier "${code}" ya tiene un menú cargado. No se pisa.`);
      continue;
    }
    await upsertOptionMenu(option.id, toAdminMenuInput(raw));
    console.log(`  ✓ Menú cargado para "${code}" (${raw.courses.length} cursos)`);
  }

  console.log('✅ Listo.');
}

main()
  .catch((err) => {
    console.error('❌ Seed de menú falló:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
