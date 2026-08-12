// Seed inicial: categorías + producto demo con sus 5 tiers (Cena Show VIP/Ejecutiva/Platea y Solo Show VIP/Promo).
// Diseñado para ser idempotente — ON CONFLICT DO NOTHING en los slugs únicos.
import { pool } from './db.js';

const CATEGORIES = [
  { slug: 'shows-de-tango', name_es: 'Shows de Tango', name_en: 'Tango Shows',
    description_es: 'Experiencias en las casas de tango más emblemáticas de Buenos Aires.',
    description_en: 'Experiences at the most iconic tango houses of Buenos Aires.',
    display_order: 1 },
  { slug: 'tours-y-excursiones', name_es: 'Tours y Excursiones', name_en: 'Tours & Excursions',
    description_es: 'City tours, day trips y excursiones temáticas.',
    description_en: 'City tours, day trips and themed excursions.',
    display_order: 2 },
  { slug: 'programas', name_es: 'Programas', name_en: 'Programs',
    description_es: 'Programas completos multi-día.',
    description_en: 'Full multi-day programs.',
    display_order: 3 },
  { slug: 'alojamiento', name_es: 'Alojamiento', name_en: 'Lodging',
    description_es: 'Hoteles y apartamentos seleccionados.',
    description_en: 'Selected hotels and apartments.',
    display_order: 4 },
  { slug: 'traslados', name_es: 'Traslados', name_en: 'Transfers',
    description_es: 'Traslados privados desde/hacia aeropuertos y hoteles.',
    description_en: 'Private transfers from/to airports and hotels.',
    display_order: 5 },
];

const DEMO_PRODUCT = {
  slug: 'casa-de-tango-emblema',
  name: 'Casa de Tango Emblema',
  venue_name: 'Casa Emblema',
  short_description_es: 'Una de las casas de tango más reconocidas de la ciudad. Cena, show y traslado incluido.',
  short_description_en: 'One of the most renowned tango houses in the city. Dinner, show and transfer included.',
  long_description_es: 'Vivís una velada inolvidable en una de las casas de tango más prestigiosas de Buenos Aires. Cena a la carta, bailarines de nivel internacional y la atmósfera única del tango porteño.',
  long_description_en: 'Enjoy an unforgettable evening at one of the most prestigious tango houses in Buenos Aires. À la carte dinner, world-class dancers and the unique atmosphere of porteño tango.',
  address_es: 'Av. Corrientes 1234, Buenos Aires',
  address_en: 'Av. Corrientes 1234, Buenos Aires',
  schedule_summary_es: 'Lunes a Domingos. Traslado 19:30-20:00. Cena desde 20:00. Show desde 22:00.',
  schedule_summary_en: 'Monday to Sunday. Transfer 7:30-8:00 PM. Dinner from 8:00 PM. Show from 10:00 PM.',
  starting_price_usd: 38,
};

const DEMO_OPTIONS = [
  {
    code: 'cena-show-vip',
    name_es: 'Cena Show VIP',
    name_en: 'Dinner Show VIP',
    description_es: 'La mejor ubicación, menú premium y bebidas libres.',
    description_en: 'The best location, premium menu and unlimited drinks.',
    includes_es: [
      'Mesa preferencial',
      'Menú a la carta: entrada, principal y postre',
      'Bebidas libres: gaseosas y agua mineral',
      '1 botella de vino o cerveza cada 2 personas',
      'Show de tango',
      'Traslado ida y vuelta desde hoteles seleccionados',
    ],
    includes_en: [
      'Preferential table',
      'À la carte menu: starter, main course and dessert',
      'Free drinks: soft drinks and mineral water',
      '1 bottle of wine or beer per 2 people',
      'Tango show',
      'Round-trip transfer from selected hotels',
    ],
    price_adult_usd: 140,
    price_child_usd: 70,
    has_dinner: true,
    transfer_mode: 'optional',
    available_days: [1, 2, 3, 4, 5, 6, 7],
    pickup_window_es: 'Entre 19:30 y 20:00 (Centro, Recoleta, Puerto Madero, San Telmo, Constitución, Palermo)',
    pickup_window_en: 'Between 7:30 and 8:00 PM (Centro, Recoleta, Puerto Madero, San Telmo, Constitución, Palermo)',
    dinner_time_es: 'Cena desde 20:00',
    dinner_time_en: 'Dinner from 8:00 PM',
    show_time_es: 'Show desde 22:00',
    show_time_en: 'Show from 10:00 PM',
    display_order: 1,
  },
  {
    code: 'cena-show-ejecutiva',
    name_es: 'Cena Show Ejecutiva',
    name_en: 'Dinner Show Executive',
    description_es: 'Excelente ubicación y menú a la carta.',
    description_en: 'Excellent location and à la carte menu.',
    includes_es: [
      'Mesa compartida',
      'Menú a la carta: entrada, principal y postre',
      'Bebidas libres: gaseosas y agua mineral',
      '1 botella de vino o cerveza cada 2 personas',
      'Show de tango',
      'Traslado ida y vuelta desde hoteles seleccionados',
    ],
    includes_en: [
      'Shared table',
      'À la carte menu: starter, main course and dessert',
      'Free drinks: soft drinks and mineral water',
      '1 bottle of wine or beer per 2 people',
      'Tango show',
      'Round-trip transfer from selected hotels',
    ],
    price_adult_usd: 106,
    price_child_usd: 53,
    has_dinner: true,
    transfer_mode: 'optional',
    available_days: [1, 2, 3, 4, 5, 6, 7],
    pickup_window_es: 'Entre 19:30 y 20:00',
    pickup_window_en: 'Between 7:30 and 8:00 PM',
    dinner_time_es: 'Cena desde 20:00',
    dinner_time_en: 'Dinner from 8:00 PM',
    show_time_es: 'Show desde 22:00',
    show_time_en: 'Show from 10:00 PM',
    display_order: 2,
  },
  {
    code: 'cena-show-platea',
    name_es: 'Cena Show Platea',
    name_en: 'Dinner Show Platea',
    description_es: 'Mesa compartida y menú a la carta.',
    description_en: 'Shared table and à la carte menu.',
    includes_es: [
      'Mesa compartida',
      'Menú a la carta',
      'Bebidas: gaseosas, agua y vino de la casa',
      'Show de tango',
      'Traslado ida y vuelta',
    ],
    includes_en: [
      'Shared table',
      'À la carte menu',
      'Drinks: soft drinks, water and house wine',
      'Tango show',
      'Round-trip transfer',
    ],
    price_adult_usd: 96,
    price_child_usd: 48,
    has_dinner: true,
    transfer_mode: 'optional',
    available_days: [1, 2, 3, 4, 5, 6, 7],
    pickup_window_es: 'Entre 19:30 y 20:00',
    pickup_window_en: 'Between 7:30 and 8:00 PM',
    dinner_time_es: 'Cena desde 20:00',
    dinner_time_en: 'Dinner from 8:00 PM',
    show_time_es: 'Show desde 22:00',
    show_time_en: 'Show from 10:00 PM',
    display_order: 3,
  },
  {
    code: 'solo-show-vip',
    name_es: 'Solo Show VIP',
    name_en: 'Show Only VIP',
    description_es: 'Mesa VIP, copa de bienvenida y show.',
    description_en: 'VIP table, welcome drink and show.',
    includes_es: [
      'Mesa preferencial',
      'Copa de champagne de bienvenida',
      'Show de tango',
      'Traslado ida y vuelta desde hoteles seleccionados',
    ],
    includes_en: [
      'Preferential table',
      'Welcome glass of champagne',
      'Tango show',
      'Round-trip transfer from selected hotels',
    ],
    price_adult_usd: 56,
    price_child_usd: 28,
    has_dinner: false,
    transfer_mode: 'optional',
    available_days: [1, 2, 3, 4, 5, 6, 7],
    pickup_window_es: 'Entre 21:00 y 21:30',
    pickup_window_en: 'Between 9:00 and 9:30 PM',
    show_time_es: 'Show desde 22:00',
    show_time_en: 'Show from 10:00 PM',
    display_order: 4,
  },
  {
    code: 'solo-show-promo',
    name_es: 'Solo Show Promo',
    name_en: 'Show Only Promo',
    description_es: 'Acceso al show con copa de bienvenida.',
    description_en: 'Show access with welcome drink.',
    includes_es: [
      'Acceso al show',
      'Copa de bienvenida',
      'Show de tango',
    ],
    includes_en: [
      'Show access',
      'Welcome drink',
      'Tango show',
    ],
    price_adult_usd: 38,
    price_child_usd: null,
    has_dinner: false,
    transfer_mode: 'none',
    available_days: [1, 2, 3, 4, 5, 6, 7],
    show_time_es: 'Show desde 22:00',
    show_time_en: 'Show from 10:00 PM',
    display_order: 5,
  },
];

const DEMO_IMAGES = [
  { url: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?auto=format&fit=crop&w=1600&q=80',
    alt_text: 'Pareja bailando tango en el escenario', is_hero: true, display_order: 1 },
  { url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1600&q=80',
    alt_text: 'Salón de la casa de tango con mesas dispuestas', is_hero: false, display_order: 2 },
  { url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80',
    alt_text: 'Detalle de zapatos de tango y luces tenues', is_hero: false, display_order: 3 },
  { url: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6a3?auto=format&fit=crop&w=1600&q=80',
    alt_text: 'Bailarines en pose dramática', is_hero: false, display_order: 4 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('▶ Seeding categories...');
    for (const cat of CATEGORIES) {
      await client.query(
        `INSERT INTO categories (slug, name_es, name_en, description_es, description_en, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING`,
        [cat.slug, cat.name_es, cat.name_en, cat.description_es, cat.description_en, cat.display_order],
      );
    }

    const { rows: catRows } = await client.query<{ id: number }>(
      `SELECT id FROM categories WHERE slug = 'shows-de-tango' LIMIT 1`,
    );
    const showsCategoryId = catRows[0]?.id;
    if (!showsCategoryId) throw new Error('Shows de Tango category not found after insert');

    console.log('▶ Seeding demo product...');
    const { rows: prodRows } = await client.query<{ id: number }>(
      `INSERT INTO products (
         slug, category_id, name, venue_name,
         short_description_es, short_description_en,
         long_description_es, long_description_en,
         address_es, address_en,
         schedule_summary_es, schedule_summary_en,
         starting_price_usd, display_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [
        DEMO_PRODUCT.slug, showsCategoryId, DEMO_PRODUCT.name, DEMO_PRODUCT.venue_name,
        DEMO_PRODUCT.short_description_es, DEMO_PRODUCT.short_description_en,
        DEMO_PRODUCT.long_description_es, DEMO_PRODUCT.long_description_en,
        DEMO_PRODUCT.address_es, DEMO_PRODUCT.address_en,
        DEMO_PRODUCT.schedule_summary_es, DEMO_PRODUCT.schedule_summary_en,
        DEMO_PRODUCT.starting_price_usd, 1,
      ],
    );
    const productId = prodRows[0].id;

    console.log('▶ Seeding product options...');
    for (const opt of DEMO_OPTIONS) {
      await client.query(
        `INSERT INTO product_options (
           product_id, code, name_es, name_en, description_es, description_en,
           includes_es, includes_en, price_adult_usd, price_child_usd,
           has_dinner, transfer_mode, available_days,
           pickup_window_es, pickup_window_en,
           dinner_time_es, dinner_time_en,
           show_time_es, show_time_en,
           display_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (product_id, code) DO NOTHING`,
        [
          productId, opt.code, opt.name_es, opt.name_en, opt.description_es, opt.description_en,
          opt.includes_es, opt.includes_en, opt.price_adult_usd, opt.price_child_usd,
          opt.has_dinner, opt.transfer_mode, opt.available_days,
          opt.pickup_window_es ?? null, opt.pickup_window_en ?? null,
          opt.dinner_time_es ?? null, opt.dinner_time_en ?? null,
          opt.show_time_es ?? null, opt.show_time_en ?? null,
          opt.display_order,
        ],
      );
    }

    console.log('▶ Seeding product images...');
    // Limpiamos e insertamos para que el orden quede consistente al re-seedear
    await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    for (const img of DEMO_IMAGES) {
      await client.query(
        `INSERT INTO product_images (product_id, url, alt_text, is_hero, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [productId, img.url, img.alt_text, img.is_hero, img.display_order],
      );
    }

    console.log('▶ Seeding settings...');
    // Tipo de cambio inicial (editable desde admin en Fase 5)
    await client.query(
      `INSERT INTO settings (key, value, description)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO NOTHING`,
      [
        'exchange_rate_usd_ars',
        JSON.stringify({ rate: 1100, updated_at: new Date().toISOString() }),
        'Tipo de cambio USD→ARS aplicado al cobrar con Mercado Pago. Editable desde admin.',
      ],
    );

    console.log('▶ Seeding demo seller...');
    await client.query(
      `INSERT INTO sellers (code, name, kind, commission_percent, contact_email, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO NOTHING`,
      ['DEMO01', 'Recomendador Demo', 'recepcion', 15.0, 'demo@tangosymilongastickets.com', 'Recomendador de prueba para validar flujo de incentivos por recomendación.'],
    );

    await client.query('COMMIT');
    console.log('✅ Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch(() => process.exit(1))
  .finally(() => pool.end());
