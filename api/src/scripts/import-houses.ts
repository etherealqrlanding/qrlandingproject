// Importador de casas de tango — datos extraídos de los micrositios de tangosymilongas.com.
// Respeta nombres de casas y servicios (texto ES verbatim de la web; EN traducido).
// Idempotente: re-ejecutar refresca el texto/tiers desde esta fuente (ON CONFLICT DO UPDATE).
// NO toca imágenes (se cargan aparte por el admin / script de upload).
//
// Uso:  npm run import:houses
//
// Precios: cargados como referencia (los de la web). Se revisan/ajustan luego desde el admin.
import { pool } from '../db.js';

type Option = {
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
  show_only_time_enabled: boolean;
  available_days: number[];
};

type House = {
  slug: string;
  name: string;
  venue_name: string;
  short_description_es: string;
  short_description_en: string;
  long_description_es: string;
  long_description_en: string;
  address_es: string;
  address_en: string;
  schedule_summary_es: string;
  schedule_summary_en: string;
  dinner_show_time_es: string | null;
  show_only_time_es: string | null;
  dinner_transfer_window_es: string | null;
  show_only_transfer_window_es: string | null;
  options: Option[];
};

const PICKUP_ES = 'Entre 19:30 y 20:00 (Centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo)';

const HOUSES: House[] = [
  {
    slug: 'senor-tango',
    name: 'Señor Tango',
    venue_name: 'Señor Tango',
    short_description_es:
      'Sumérgete en este espacio mágico donde el espíritu del tango cobra vida en cada rincón.',
    short_description_en:
      'Immerse yourself in this magical venue where the spirit of tango comes alive in every corner.',
    long_description_es:
      'En el amanecer del siglo pasado, una familia de inmigrantes italianos construía en Barracas, Buenos Aires, el prestigioso Almacén Brenta y Roncoroni. Hoy, Fernando Soler lo ha transformado en un magnífico teatro llamado Señor Tango. Conservando su arquitectura tradicional, el lugar emana elegancia y buen gusto.',
    long_description_en:
      'At the dawn of the last century, a family of Italian immigrants built the prestigious Almacén Brenta y Roncoroni in Barracas, Buenos Aires. Today, Fernando Soler has transformed it into a magnificent theater called Señor Tango. Preserving its traditional architecture, the venue exudes elegance and fine taste.',
    address_es: 'Av. Vieytes 1655, Barracas, Buenos Aires',
    address_en: 'Av. Vieytes 1655, Barracas, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:00. Cena desde 20:00. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:00 PM. Dinner from 8:00 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:00',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: PICKUP_ES,
    show_only_transfer_window_es: PICKUP_ES,
    options: [
      {
        code: 'cena-show-vip',
        name_es: 'Cena Show VIP',
        name_en: 'Dinner Show VIP',
        description_es: null,
        description_en: null,
        includes_es: [
          'Mesa compartida',
          'Menú a la carta: plato de entrada, plato principal y postre',
          'Bebidas libres: gaseosas y agua mineral',
          '1 botella de vino o cerveza cada 2 personas',
          'Show de tango',
          'Traslado ida y vuelta desde hoteles ubicados en centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo',
        ],
        includes_en: [
          'Shared table',
          'À la carte menu: starter, main course and dessert',
          'Free drinks: soft drinks and mineral water',
          '1 bottle of wine or beer per 2 people',
          'Tango show',
          'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo',
        ],
        price_adult_usd: 270,
        price_child_usd: null,
        has_dinner: true,
        has_transfer: true,
        show_only_time_enabled: false,
        available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva',
        name_es: 'Cena Show Ejecutiva',
        name_en: 'Dinner Show Executive',
        description_es: null,
        description_en: null,
        includes_es: [
          'Mesa compartida',
          'Menú a la carta 3 pasos: entrada, principal y postre',
          'Bebidas libres: gaseosas y agua mineral',
          '1 botella de vino 375ml o 2 chop de cerveza por persona',
          'Show de tango',
          'Traslado ida y vuelta desde hoteles ubicados en centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo',
        ],
        includes_en: [
          'Shared table',
          '3-course à la carte menu: starter, main course and dessert',
          'Free drinks: soft drinks and mineral water',
          '1 bottle of wine 375ml or 2 draft beers per person',
          'Tango show',
          'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo',
        ],
        price_adult_usd: 145,
        price_child_usd: null,
        has_dinner: true,
        has_transfer: true,
        show_only_time_enabled: false,
        available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip',
        name_es: 'Solo Show VIP',
        name_en: 'Show Only VIP',
        description_es: null,
        description_en: null,
        includes_es: [
          'Mesa privada (con la mejor vista al escenario)',
          'Bebidas libres: gaseosas y agua mineral',
          '1 botella de vino 375ml o 2 chop de cerveza por persona',
          'Show de tango',
          'Traslado ida y vuelta desde hoteles ubicados en centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo',
        ],
        includes_en: [
          'Private table (with the best view of the stage)',
          'Free drinks: soft drinks and mineral water',
          '1 bottle of wine 375ml or 2 draft beers per person',
          'Tango show',
          'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo',
        ],
        price_adult_usd: 164,
        price_child_usd: null,
        has_dinner: false,
        has_transfer: true,
        show_only_time_enabled: true,
        available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-ejecutivo',
        name_es: 'Solo Show Ejecutivo',
        name_en: 'Show Only Executive',
        description_es: null,
        description_en: null,
        includes_es: [
          'Mesa compartida',
          'Show de tango',
          '2 bebidas por persona (1 con alcohol y 1 sin alcohol)',
        ],
        includes_en: [
          'Shared table',
          'Tango show',
          '2 drinks per person (1 alcoholic and 1 non-alcoholic)',
        ],
        price_adult_usd: 63,
        price_child_usd: null,
        has_dinner: false,
        has_transfer: false, // este paquete NO incluye traslado
        show_only_time_enabled: true,
        available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Tango Porteño ──────────────────────────────────────────
  // TODO(schedule-migration): dinner tiers had conflicting pickup_window_es —
  //   'Entre 19:30 y 20:00 (zona céntrica y Palermo)' (cena-show-vip) vs
  //   'Entre 19:30 y 20:00' (cena-show-ejecutiva, cena-show-platea).
  //   Used the cena-show-vip value as the house-level default; review by hand.
  // TODO(schedule-migration): show-only tiers had conflicting pickup_window_es —
  //   'Entre 20:30 y 21:00 (zona céntrica) / 19:30 a 20:00 (Palermo)' (solo-show-vip) vs
  //   'Entre 20:30 y 21:00' (solo-show-promo).
  //   Used the solo-show-vip value as the house-level default; review by hand.
  {
    slug: 'tango-porteno',
    name: 'Tango Porteño',
    venue_name: 'Tango Porteño',
    short_description_es: 'Elegancia y glamour de la época dorada del tango, a pasos del Obelisco.',
    short_description_en: 'Elegance and glamour of the golden age of tango, steps from the Obelisco.',
    long_description_es: 'Tango Porteño te transporta a la época dorada del tango con un espectáculo de primer nivel, ambientación art déco de los años 40 y una gastronomía a la altura, en pleno centro de Buenos Aires.',
    long_description_en: 'Tango Porteño takes you back to the golden age of tango with a top-level show, 1940s art déco décor and fine cuisine, in the heart of Buenos Aires.',
    address_es: 'Cerrito 570, Buenos Aires',
    address_en: 'Cerrito 570, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:00. Cena desde 20:00. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:00 PM. Dinner from 8:00 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:00',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 19:30 y 20:00 (zona céntrica y Palermo)',
    show_only_transfer_window_es: 'Entre 20:30 y 21:00 (zona céntrica) / 19:30 a 20:00 (Palermo)',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', 'Menú a la carta: plato de entrada, plato principal y postre', 'Bebidas libres: gaseosas y agua mineral', '1 botella de vino o cerveza cada 2 personas', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad'],
        includes_en: ['Shared table', 'À la carte menu: starter, main course and dessert', 'Free drinks: soft drinks and mineral water', '1 bottle of wine or beer per 2 people', 'Tango show', 'Round-trip transfer from hotels in downtown'],
        price_adult_usd: 140, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva', name_es: 'Cena Show Ejecutiva', name_en: 'Dinner Show Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', 'Menú a la carta 3 pasos: entrada, principal y postre', 'Bebidas libres: gaseosas y agua mineral', '1 botella de vino 375ml o 2 chop de cerveza por persona', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Shared table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: soft drinks and mineral water', '1 bottle of wine 375ml or 2 draft beers per person', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 106, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-platea', name_es: 'Cena Show Platea', name_en: 'Dinner Show Platea',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', 'Menú a la carta 3 pasos', 'Bebidas libres: gaseosas y agua mineral', '1 botella de vino 375ml o 2 chop de cerveza', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Shared table', '3-course à la carte menu', 'Free drinks: soft drinks and mineral water', '1 bottle of wine 375ml or 2 draft beers', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 96, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Bebidas libres: gaseosas y agua mineral', '1 botella de vino 375ml o 2 chop de cerveza', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Private table (with the best view of the stage)', 'Free drinks: soft drinks and mineral water', '1 bottle of wine 375ml or 2 draft beers', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 56, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-promo', name_es: 'Solo Show Promo', name_en: 'Show Only Promo',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', 'Show de tango', '2 bebidas por persona (1 con alcohol y 1 sin alcohol)'],
        includes_en: ['Shared table', 'Tango show', '2 drinks per person (1 alcoholic and 1 non-alcoholic)'],
        price_adult_usd: 38, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── La Ventana ─────────────────────────────────────────────
  {
    slug: 'la-ventana',
    name: 'La Ventana',
    venue_name: 'La Ventana',
    short_description_es: 'Zambúllete en la magia de La Ventana, el escenario perfecto para disfrutar de un espectáculo inigualable de tango y folclore.',
    short_description_en: 'Dive into the magic of La Ventana, the perfect stage to enjoy an unrivalled show of tango and folklore.',
    long_description_es: 'Déjate cautivar por la pasión y el ritmo mientras saboreas una gastronomía espectacular y exploras una amplia selección de los mejores vinos argentinos.',
    long_description_en: 'Let yourself be captivated by the passion and rhythm while you savor spectacular cuisine and explore a wide selection of the finest Argentine wines.',
    address_es: 'Balcarce 431, San Telmo, Buenos Aires',
    address_en: 'Balcarce 431, San Telmo, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:00. Cena desde 20:00. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:00 PM. Dinner from 8:00 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:00',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 19:30 y 20:00 (Palermo desde 19:00)',
    show_only_transfer_window_es: 'Entre 21:00 y 21:30 (Palermo 20:45)',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Incluye degustación de vinos o clase de tango gratis', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table (with the best view of the stage)', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Includes free wine tasting or tango lesson', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 180, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva', name_es: 'Cena Show Ejecutiva', name_en: 'Dinner Show Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: cerveza, gaseosas y agua mineral', '1 botella de vino cada 2 personas', 'Servicio opcional adicional: degustación de vinos o clase de tango', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: beer, soft drinks and mineral water', '1 bottle of wine per 2 people', 'Optional add-on service: wine tasting or tango lesson', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Bebidas libres: agua mineral, gaseosas y cervezas', '1 botella de vino cada 2 personas', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table (with the best view of the stage)', 'Free drinks: mineral water, soft drinks and beer', '1 bottle of wine per 2 people', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: agua mineral, gaseosas y cervezas', '1 botella de vino cada 2 personas', 'Show de tango'],
        includes_en: ['Private table', 'Free drinks: mineral water, soft drinks and beer', '1 bottle of wine per 2 people', 'Tango show'],
        price_adult_usd: 70, price_child_usd: null, has_dinner: false, has_transfer: false, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Madero Tango ───────────────────────────────────────────
  {
    slug: 'madero-tango',
    name: 'Madero Tango',
    venue_name: 'Madero Tango',
    short_description_es: 'Vive la elegancia y la pasión del tango en Madero Tango, en el icónico barrio de Puerto Madero, el más moderno y exclusivo de Buenos Aires.',
    short_description_en: 'Experience the elegance and passion of tango at Madero Tango, in the iconic Puerto Madero, the most modern and exclusive neighborhood of Buenos Aires.',
    long_description_es: 'Disfrutá de una vista impresionante del río y la ciudad, creando un ambiente mágico y único. Sumérgete en un espectáculo cautivador que combina la danza, el canto y una gastronomía espectacular. El salón donde se lleva a cabo el show deslumbra por su diseño y ambientación de gran categoría.',
    long_description_en: 'Enjoy a stunning view of the river and the city, creating a magical and unique atmosphere. Immerse yourself in a captivating show that combines dance, song and spectacular cuisine. The hall where the show takes place dazzles with its high-class design and ambiance.',
    address_es: 'Av. Alicia Moreau de Justo 1601, Puerto Madero, Buenos Aires',
    address_en: 'Av. Alicia Moreau de Justo 1601, Puerto Madero, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 20:00–20:30. Cena desde 20:30. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 8:00–8:30 PM. Dinner from 8:30 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:30',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 20:00 y 20:30 (Palermo 19:40)',
    show_only_transfer_window_es: 'Entre 20:00 y 20:30 (Palermo 19:40)',
    options: [
      {
        code: 'cena-show-premium', name_es: 'Cena Show Premium', name_en: 'Dinner Show Premium',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual en frente del escenario', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino Rutini, agua, gaseosa, cerveza, champagne Chandon Brut Nature', 'Show de tango', 'Voucher de regalo por QR con $3.000 pesos por persona para disfrutar en el Casino de Buenos Aires', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Individual table in front of the stage', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: Rutini wine, water, soft drinks, beer, Chandon Brut Nature champagne', 'Tango show', 'QR gift voucher worth $3,000 pesos per person to use at the Casino de Buenos Aires', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 222, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida frente al escenario', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Shared table in front of the stage', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 154, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva', name_es: 'Cena Show Ejecutiva', name_en: 'Dinner Show Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida al frente del escenario', 'Menú a la carta 3 pasos: entrada, plato principal y postre', '1 botella de vino cada 2 personas (etiqueta nacional). Agua, gaseosa y cerveza libres. Copa de champagne para el brindis', 'Show de tango', 'Voucher de regalo por QR con $3.000 pesos por persona', 'Traslado ida y vuelta'],
        includes_en: ['Shared table in front of the stage', '3-course à la carte menu: starter, main course and dessert', '1 bottle of wine per 2 people (national label). Free water, soft drinks and beer. Glass of champagne for the toast', 'Tango show', 'QR gift voucher worth $3,000 pesos per person', 'Round-trip transfer'],
        price_adult_usd: 116, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-platea', name_es: 'Cena Show Platea', name_en: 'Dinner Show Platea',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida (hasta 8 personas) sobre el lateral del escenario', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Copa de vino etiqueta nacional. Agua, gaseosa y cerveza libres', 'Show de tango', 'Voucher de regalo por QR con $3.000 pesos por persona', 'Traslado ida y vuelta'],
        includes_en: ['Shared table (up to 8 people) on the side of the stage', '3-course à la carte menu: starter, main course and dessert', 'Glass of national-label wine. Free water, soft drinks and beer', 'Tango show', 'QR gift voucher worth $3,000 pesos per person', 'Round-trip transfer'],
        price_adult_usd: 96, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Shared table', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 39, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Homero Manzi ───────────────────────────────────────────
  {
    slug: 'homero-manzi',
    name: 'Homero Manzi',
    venue_name: 'Esquina Homero Manzi',
    short_description_es: 'Descubre la esencia del tango en Homero Manzi, la Esquina de San Juan y Boedo, un lugar histórico y tradicional en Buenos Aires.',
    short_description_en: 'Discover the essence of tango at Homero Manzi, the corner of San Juan and Boedo, a historic and traditional venue in Buenos Aires.',
    long_description_es: 'Desde su construcción en 1927, este icónico bar ha sido un símbolo de la cultura urbana de los años cuarenta. En sus mesas se sentaron los músicos que hicieron del tango el máximo exponente artístico de la ciudad. Disfruta de un espectáculo cautivador en vivo con un cuarteto, talentosos cantantes y bailarines, creando el ambiente perfecto para transmitir el auténtico sentimiento tanguero.',
    long_description_en: 'Since it was built in 1927, this iconic bar has been a symbol of the urban culture of the 1940s. At its tables sat the musicians who made tango the city’s greatest artistic expression. Enjoy a captivating live show with a quartet, talented singers and dancers, creating the perfect atmosphere to convey authentic tango feeling.',
    address_es: 'Av. San Juan 3601, Boedo, Buenos Aires',
    address_en: 'Av. San Juan 3601, Boedo, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 20:00–20:30. Cena desde 20:30. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 8:00–8:30 PM. Dinner from 8:30 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:30',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 20:00 y 20:30',
    show_only_transfer_window_es: 'Entre 20:00 y 20:30',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP (Muy Bacán)', name_en: 'Dinner Show VIP (Muy Bacán)',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Menú a la carta 3 pasos: entrada, principal y postre', 'Bebidas: vino cada dos personas o cerveza o gaseosas, agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Individual table', '3-course à la carte menu: starter, main course and dessert', 'Drinks: wine per 2 people or beer or soft drinks, mineral water', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 104, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show', name_es: 'Cena Show', name_en: 'Dinner Show',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Menú a la carta 3 pasos: entrada, principal y postre', 'Bebidas: vino cada dos personas o cerveza o gaseosas, agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Individual table', '3-course à la carte menu: starter, main course and dessert', 'Drinks: wine per 2 people or beer or soft drinks, mineral water', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Individual table', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 39, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Café de los Angelitos ──────────────────────────────────
  {
    slug: 'cafe-de-los-angelitos',
    name: 'Café de los Angelitos',
    venue_name: 'Café de los Angelitos',
    short_description_es: 'Adentrate en el Café de los Angelitos, un testigo vivo de la rica historia porteña que hoy lidera la vanguardia del tango.',
    short_description_en: 'Step into Café de los Angelitos, a living witness of rich Buenos Aires history that today leads the vanguard of tango.',
    long_description_es: 'Sumérgete en una experiencia lujosa y distinguida con su cena show, donde revivirás una época de tradición porteña vibrante. Cada noche, 21 talentosos artistas en escena te invitarán a disfrutar de una velada única, acompañada de una exquisita gastronomía de calidad.',
    long_description_en: 'Immerse yourself in a luxurious and distinguished experience with its dinner show, where you’ll relive an era of vibrant Buenos Aires tradition. Each night, 21 talented artists on stage invite you to enjoy a unique evening, accompanied by exquisite quality cuisine.',
    address_es: 'Av. Rivadavia 2100, Buenos Aires',
    address_en: 'Av. Rivadavia 2100, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:00. Cena desde 20:00. Show desde 21:45.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:00 PM. Dinner from 8:00 PM. Show from 9:45 PM.',
    dinner_show_time_es: 'Cena desde 20:00',
    show_only_time_es: 'Show desde 21:45',
    dinner_transfer_window_es: 'Entre 19:30 y 20:00',
    show_only_transfer_window_es: 'Entre 20:45 y 21:15',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en centro, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table (with the best view of the stage)', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 220, price_child_usd: 110, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva', name_es: 'Cena Show Ejecutiva', name_en: 'Dinner Show Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table (with the best view of the stage)', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 180, price_child_usd: 90, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-platea', name_es: 'Cena Show Platea', name_en: 'Dinner Show Platea',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 130, price_child_usd: 65, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table (with the best view of the stage)', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 150, price_child_usd: 75, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-platea', name_es: 'Solo Show Platea', name_en: 'Show Only Platea',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 90, price_child_usd: 45, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── El Aljibe ──────────────────────────────────────────────
  {
    slug: 'el-aljibe',
    name: 'El Aljibe',
    venue_name: 'El Aljibe',
    short_description_es: 'Sumérgete en la esencia del tango en El Aljibe, una casa tradicional que te transportará a un mundo de pasión y tradición.',
    short_description_en: 'Immerse yourself in the essence of tango at El Aljibe, a traditional house that transports you to a world of passion and tradition.',
    long_description_es: 'Disfruta de una experiencia gastronómica gourmet excepcional, donde cada plato es una obra maestra culinaria.',
    long_description_en: 'Enjoy an exceptional gourmet dining experience, where every dish is a culinary masterpiece.',
    address_es: 'Balcarce 425, San Telmo, Buenos Aires',
    address_en: 'Balcarce 425, San Telmo, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 18:30–19:00. Cena desde 19:00. Show desde 20:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 6:30–7:00 PM. Dinner from 7:00 PM. Show from 8:00 PM.',
    dinner_show_time_es: 'Cena desde 19:00',
    show_only_time_es: 'Show desde 20:00',
    dinner_transfer_window_es: 'Entre 18:30 y 19:00',
    show_only_transfer_window_es: 'Entre 19:30 y 20:00',
    options: [
      {
        code: 'cena-show', name_es: 'Cena Show', name_en: 'Dinner Show',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: cerveza, gaseosas y agua mineral', '1 botella de vino cada 2 personas', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: beer, soft drinks and mineral water', '1 bottle of wine per 2 people', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 130, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: cerveza, gaseosas y agua mineral', '1 botella de vino cada 2 personas', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', 'Free drinks: beer, soft drinks and mineral water', '1 bottle of wine per 2 people', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 100, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Mansión Tango ──────────────────────────────────────────
  {
    slug: 'mansion-tango',
    name: 'Mansión Tango',
    venue_name: 'Mansión Tango',
    short_description_es: 'Maravillate con la pasión del tango en Mansión Tango, donde recreamos la esencia de la gran pasión argentina.',
    short_description_en: 'Marvel at the passion of tango at Mansión Tango, where we recreate the essence of the great Argentine passion.',
    long_description_es: 'Déjate cautivar por un despliegue escenográfico, majestuosos vestuarios y talentosos músicos, cantantes y bailarines que te transportarán a una experiencia inolvidable.',
    long_description_en: 'Let yourself be captivated by a scenographic display, majestic costumes and talented musicians, singers and dancers that will transport you to an unforgettable experience.',
    address_es: 'Tte. Gral. Juan D. Perón 1362, Buenos Aires',
    address_en: 'Tte. Gral. Juan D. Perón 1362, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 20:00–20:30. Cena desde 20:30. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 8:00–8:30 PM. Dinner from 8:30 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:30',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 20:00 y 20:30 (Palermo 19:45)',
    show_only_transfer_window_es: 'Entre 21:00 y 21:30 (Palermo 19:45)',
    options: [
      {
        code: 'cena-show-premium', name_es: 'Cena Show Premium', name_en: 'Dinner Show Premium',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebida libre: agua mineral, gaseosa, cerveza', 'Vinos Rutini: Cabernet, Malbec y Chardonnay', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Individual table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: mineral water, soft drinks, beer', 'Rutini wines: Cabernet, Malbec and Chardonnay', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 200, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-platino', name_es: 'Cena Show Platino', name_en: 'Dinner Show Platinum',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebida libre: agua mineral, gaseosa, cerveza', 'Vinos Trumpeter: Malbec y Chardonnay', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Individual table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: mineral water, soft drinks, beer', 'Trumpeter wines: Malbec and Chardonnay', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 150, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva', name_es: 'Cena Show Ejecutiva', name_en: 'Dinner Show Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebida libre: agua mineral, gaseosa, cerveza', 'Vinos San Felipe: Malbec y Chardonnay', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: mineral water, soft drinks, beer', 'San Felipe wines: Malbec and Chardonnay', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'drink-show', name_es: 'Drink Show', name_en: 'Drink Show',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Bebidas libres: gaseosas y agua mineral', '1 botella de vino 375ml o 2 chop de cerveza por persona', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table (with the best view of the stage)', 'Free drinks: soft drinks and mineral water', '1 bottle of wine 375ml or 2 draft beers per person', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 100, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Piazzolla Tango ────────────────────────────────────────
  // TODO(schedule-migration): show-only tiers had conflicting show_time_es —
  //   'Show desde 22:00' (solo-show-vip, solo-show-platea) vs 'Show desde 22:15' (solo-show-promo).
  //   Used 'Show desde 22:00' (first option) as the house-level default; review by hand.
  {
    slug: 'piazzolla-tango',
    name: 'Piazzolla Tango',
    venue_name: 'Teatro Astor Piazzolla',
    short_description_es: 'Encuentra una experiencia única en el Teatro Astor Piazzolla, una de las salas de variedades más importantes del mundo.',
    short_description_en: 'Find a unique experience at the Astor Piazzolla Theater, one of the most important variety halls in the world.',
    long_description_es: 'En el corazón de Buenos Aires, el Teatro Astor Piazzolla te recibe con su arquitectura art nouveau para vivir una velada de tango de primer nivel, con gastronomía de autor y opciones vegetarianas, celíacas y veganas.',
    long_description_en: 'In the heart of Buenos Aires, the Astor Piazzolla Theater welcomes you with its art nouveau architecture for a top-level tango evening, with signature cuisine and vegetarian, gluten-free and vegan options.',
    address_es: 'Galería Güemes, Florida 165, Buenos Aires',
    address_en: 'Galería Güemes, Florida 165, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:00–19:45. Cena desde 20:30. Show desde 22:15.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:00–7:45 PM. Dinner from 8:30 PM. Show from 10:15 PM.',
    dinner_show_time_es: 'Cena desde 20:30',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 19:00 y 19:45 (Palermo desde 18:45)',
    show_only_transfer_window_es: 'Entre 19:00 y 19:45 (Palermo desde 18:45)',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Copa de bienvenida', 'Mesa privada (palco privado con la mejor vista al escenario)', 'Menú a la carta 3 pasos: entrada, plato principal y postre a elección (con opción vegetariana, celíaca y vegana)', 'Bebidas libres: vino Trivento Golden Reserve Malbec o Chardonnay, cervezas, gaseosas o agua mineral', 'Show de tango', 'Traslado ida y vuelta desde y hacia el hotel'],
        includes_en: ['Welcome drink', 'Private table (private box with the best view of the stage)', '3-course à la carte menu: starter, main course and dessert of choice (with vegetarian, gluten-free and vegan options)', 'Free drinks: Trivento Golden Reserve Malbec or Chardonnay wine, beers, soft drinks or mineral water', 'Tango show', 'Round-trip transfer to and from the hotel'],
        price_adult_usd: 200, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-ejecutiva', name_es: 'Cena Show Ejecutiva', name_en: 'Dinner Show Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Cena de 3 pasos: entrada, plato principal y postre a elección (opciones vegetariana, celíaca y vegana)', 'Bebidas libres: vino Tribu Malbec o Chardonnay Bodega Trivento, cervezas, gaseosas o agua mineral', 'Infusiones: café, cortado, lágrima o té', 'Show de tango', 'Traslado ida y vuelta desde y hacia el hotel'],
        includes_en: ['Individual table', '3-course dinner: starter, main course and dessert of choice (vegetarian, gluten-free and vegan options)', 'Free drinks: Tribu Malbec or Chardonnay wine by Bodega Trivento, beers, soft drinks or mineral water', 'Hot drinks: coffee, cortado, lágrima or tea', 'Tango show', 'Round-trip transfer to and from the hotel'],
        price_adult_usd: 150, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-platea', name_es: 'Cena Show Platea', name_en: 'Dinner Show Platea',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Cena de 3 pasos: entrada, plato principal y postre a elección (opciones vegetariana, celíaca y vegana)', 'Bebidas libres: vino Tribu Malbec o Chardonnay Bodega Trivento, cervezas, gaseosas o agua mineral', 'Infusiones: café, cortado, lágrima o té', 'Show de tango', 'Traslado ida y vuelta desde y hacia el hotel'],
        includes_en: ['Individual table', '3-course dinner: starter, main course and dessert of choice (vegetarian, gluten-free and vegan options)', 'Free drinks: Tribu Malbec or Chardonnay wine by Bodega Trivento, beers, soft drinks or mineral water', 'Hot drinks: coffee, cortado, lágrima or tea', 'Tango show', 'Round-trip transfer to and from the hotel'],
        price_adult_usd: 100, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (palco con la mejor vista al escenario)', 'Entrada o postre, 2 bebidas a elección, agua o gaseosa, copa de vino o cerveza', 'Show de tango', 'Traslado ida y vuelta desde y hacia el hotel'],
        includes_en: ['Private table (box with the best view of the stage)', 'Starter or dessert, 2 drinks of choice, water or soft drink, glass of wine or beer', 'Tango show', 'Round-trip transfer to and from the hotel'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-platea', name_es: 'Solo Show Platea', name_en: 'Show Only Platea',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (palco con la mejor vista al escenario)', 'Entrada o postre, 2 bebidas a elección, agua o gaseosa, copa de vino o cerveza', 'Show de tango', 'Traslado ida y vuelta desde y hacia el hotel'],
        includes_en: ['Private table (box with the best view of the stage)', 'Starter or dessert, 2 drinks of choice, water or soft drink, glass of wine or beer', 'Tango show', 'Round-trip transfer to and from the hotel'],
        price_adult_usd: 70, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-promo', name_es: 'Solo Show Promo', name_en: 'Show Only Promo',
        description_es: null, description_en: null,
        includes_es: ['Solo incluye el show (no incluye bebidas ni traslado)'],
        includes_en: ['Show only (does not include drinks or transfer)'],
        price_adult_usd: 55, price_child_usd: null, has_dinner: false, has_transfer: false, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Cátulo Tango ───────────────────────────────────────────
  {
    slug: 'catulo-tango',
    name: 'Cátulo Tango',
    venue_name: 'Cátulo Tango',
    short_description_es: 'Cátulo es un espacio cultural donde la mística y la música porteña se viven con todos los sentidos, en el barrio del Abasto, el barrio de Gardel.',
    short_description_en: 'Cátulo is a cultural space where the mystique and music of Buenos Aires are experienced with all the senses, in the Abasto neighborhood, the neighborhood of Gardel.',
    long_description_es: 'Con escenario central y diez bailarines, Cátulo Tango te invita a una velada íntima donde la música y la danza porteña cobran vida.',
    long_description_en: 'With a central stage and ten dancers, Cátulo Tango invites you to an intimate evening where the music and dance of Buenos Aires come alive.',
    address_es: 'Dr. Tomás M. de Anchorena 647, Abasto, Buenos Aires',
    address_en: 'Dr. Tomás M. de Anchorena 647, Abasto, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:15. Cena desde 20:30. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:15 PM. Dinner from 8:30 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:30',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 19:30 y 20:15',
    show_only_transfer_window_es: 'Entre 19:30 y 20:15',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', 'Menú a la carta 3 pasos: entrada, principal y postre', 'Bebidas: 1 copa de vino, gaseosa o chopp', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Shared table', '3-course à la carte menu: starter, main course and dessert', 'Drinks: 1 glass of wine, soft drink or draft beer', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 96, price_child_usd: 48, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show', name_es: 'Cena Show', name_en: 'Dinner Show',
        description_es: null, description_en: null,
        includes_es: ['Mesa individual', 'Menú a la carta 3 pasos: entrada, principal y postre', '1 botella de vino cada 2 personas + chopp de cerveza artesanal. Aguas y gaseosas libres', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Individual table', '3-course à la carte menu: starter, main course and dessert', '1 bottle of wine per 2 people + craft draft beer. Free water and soft drinks', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 77, price_child_usd: 38.5, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa compartida', '2 empanadas a elección', '1 bebida a elección: copa de vino, gaseosa o chopp de cerveza', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Shared table', '2 empanadas of choice', '1 drink of choice: glass of wine, soft drink or draft beer', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 34, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── El Querandí ────────────────────────────────────────────
  {
    slug: 'el-querandi',
    name: 'El Querandí',
    venue_name: 'El Querandí',
    short_description_es: 'Revela la esencia del tango en El Querandí, un ícono de Buenos Aires reconocido como Museo Histórico y Restaurante Notable de la ciudad.',
    short_description_en: 'Reveal the essence of tango at El Querandí, an icon of Buenos Aires recognized as a Historic Museum and Notable Restaurant of the city.',
    long_description_es: 'Este lugar cautiva con su autenticidad y fidelidad histórica. Sumérgete en una noche inolvidable de cena y show de tango en el corazón de San Telmo.',
    long_description_en: 'This place captivates with its authenticity and historical fidelity. Immerse yourself in an unforgettable night of dinner and tango show in the heart of San Telmo.',
    address_es: 'Perú 322, Monserrat, Buenos Aires',
    address_en: 'Perú 322, Monserrat, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 20:00–20:30. Cena desde 20:30. Show desde 22:15.',
    schedule_summary_en: 'Monday to Sunday. Transfer 8:00–8:30 PM. Dinner from 8:30 PM. Show from 10:15 PM.',
    dinner_show_time_es: 'Cena desde 20:30',
    show_only_time_es: 'Show desde 22:15',
    dinner_transfer_window_es: 'Entre 20:00 y 20:30 (Palermo 19:30 a 20:00)',
    show_only_transfer_window_es: 'Entre 21:00 y 21:30',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 180, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-tradicional', name_es: 'Cena Show Tradicional', name_en: 'Dinner Show Traditional',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 100, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-ejecutivo', name_es: 'Solo Show Ejecutivo', name_en: 'Show Only Executive',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 60, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Gala Tango ─────────────────────────────────────────────
  {
    slug: 'gala-tango',
    name: 'Gala Tango',
    venue_name: 'Gala Tango',
    short_description_es: 'Vive la pasión del tango en Gala Tango, en el casco histórico de San Telmo.',
    short_description_en: 'Experience the passion of tango at Gala Tango, in the historic quarter of San Telmo.',
    long_description_es: 'Una velada de tango de primer nivel con degustación de vinos, gastronomía y los mejores artistas, en el corazón histórico de Buenos Aires.',
    long_description_en: 'A top-level tango evening with wine tasting, fine cuisine and the best artists, in the historic heart of Buenos Aires.',
    address_es: 'Pasaje 5 de Julio, San Telmo, Buenos Aires',
    address_en: 'Pasaje 5 de Julio, San Telmo, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:00. Cena desde 20:00. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:00 PM. Dinner from 8:00 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:00',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 19:30 y 20:00',
    show_only_transfer_window_es: 'Entre 21:00 y 21:30',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: cerveza, gaseosas y agua mineral', 'Degustación de vinos', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: beer, soft drinks and mineral water', 'Wine tasting', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 190, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: agua mineral, gaseosas y cervezas', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', 'Free drinks: mineral water, soft drinks and beer', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Michelangelo ───────────────────────────────────────────
  // TODO(schedule-migration): dinner tiers had conflicting pickup_window_es —
  //   'Entre 19:00 y 19:30 (Palermo 18:30)' (cena-show-vip) vs 'Entre 19:00 y 19:30' (cena-show).
  //   Used the cena-show-vip value as the house-level default; review by hand.
  {
    slug: 'michelangelo',
    name: 'Michelangelo',
    venue_name: 'Michelangelo',
    short_description_es: 'Deslúmbrate con Michelangelo, en un edificio histórico de 1850 en el corazón de San Telmo.',
    short_description_en: 'Be dazzled by Michelangelo, in a historic 1850 building in the heart of San Telmo.',
    long_description_es: 'Disfruta de una experiencia de encanto y sofisticación con salones exquisitos, una propuesta gastronómica de primer nivel y un show protagonizado por artistas reconocidos mundialmente.',
    long_description_en: 'Enjoy an experience of charm and sophistication with exquisite halls, top-level cuisine and a show starring world-renowned artists.',
    address_es: 'Balcarce 433, San Telmo, Buenos Aires',
    address_en: 'Balcarce 433, San Telmo, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:00–19:30. Cena desde 19:30. Show desde 21:30.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:00–7:30 PM. Dinner from 7:30 PM. Show from 9:30 PM.',
    dinner_show_time_es: 'Cena desde 19:30',
    show_only_time_es: 'Show desde 21:30',
    dinner_transfer_window_es: 'Entre 19:00 y 19:30 (Palermo 18:30)',
    show_only_transfer_window_es: 'Entre 20:45 y 21:15',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, aguas, gaseosas, cerveza, espumante', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, water, soft drinks, beer, sparkling wine', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 190, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show', name_es: 'Cena Show', name_en: 'Dinner Show',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 150, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: vino, aguas, gaseosas, cerveza, espumante', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Private table', 'Free drinks: wine, water, soft drinks, beer, sparkling wine', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: aguas, gaseosas, cerveza y vinos de Bodega Catena Zapata', 'Show de tango', 'Traslado ida y vuelta'],
        includes_en: ['Private table', 'Free drinks: water, soft drinks, beer and Bodega Catena Zapata wines', 'Tango show', 'Round-trip transfer'],
        price_adult_usd: 80, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── El Viejo Almacén ───────────────────────────────────────
  {
    slug: 'el-viejo-almacen',
    name: 'El Viejo Almacén',
    venue_name: 'El Viejo Almacén',
    short_description_es: 'Revive la época dorada del tango en este lugar lleno de encanto y disfruta de un espectáculo aclamado a nivel mundial.',
    short_description_en: 'Relive the golden age of tango in this charming venue and enjoy a world-acclaimed show.',
    long_description_es: 'Además, deleita tu paladar con una propuesta gastronómica excepcional. El Viejo Almacén te invita a sumergirte en la historia y la pasión del tango, creando recuerdos inolvidables.',
    long_description_en: 'You will also delight your palate with exceptional cuisine. El Viejo Almacén invites you to immerse yourself in the history and passion of tango, creating unforgettable memories.',
    address_es: 'Balcarce 793 y Independencia, San Telmo, Buenos Aires',
    address_en: 'Balcarce 793 and Independencia, San Telmo, Buenos Aires',
    schedule_summary_es: 'Lunes a Domingos. Traslado 19:30–20:00. Cena desde 20:00. Show desde 22:00.',
    schedule_summary_en: 'Monday to Sunday. Transfer 7:30–8:00 PM. Dinner from 8:00 PM. Show from 10:00 PM.',
    dinner_show_time_es: 'Cena desde 20:00',
    show_only_time_es: 'Show desde 22:00',
    dinner_transfer_window_es: 'Entre 19:30 y 20:00 (Palermo desde 19:00)',
    show_only_transfer_window_es: 'Entre 21:00 y 21:30',
    options: [
      {
        code: 'cena-show-vip', name_es: 'Cena Show VIP', name_en: 'Dinner Show VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada (con la mejor vista al escenario)', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas: vino y bebidas sin alcohol', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table (with the best view of the stage)', '3-course à la carte menu: starter, main course and dessert', 'Drinks: wine and non-alcoholic beverages', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 170, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'cena-show-tradicional', name_es: 'Cena Show Tradicional', name_en: 'Dinner Show Traditional',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', '2 bebidas por persona', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', '2 drinks per person', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show-vip', name_es: 'Solo Show VIP', name_en: 'Show Only VIP',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', '2 bebidas por persona', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '2 drinks per person', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 120, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', '2 bebidas por persona', 'Show de tango', 'Traslado ida y vuelta desde hoteles'],
        includes_en: ['Private table', '2 drinks per person', 'Tango show', 'Round-trip transfer from hotels'],
        price_adult_usd: 70, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },

  // ── Rojo Tango ─────────────────────────────────────────────
  {
    slug: 'rojo-tango',
    name: 'Rojo Tango',
    venue_name: 'Rojo Tango — Hotel Faena',
    short_description_es: 'Descubre el encanto irresistible de Rojo Tango, ubicado en el emblemático Hotel Faena, en Puerto Madero.',
    short_description_en: 'Discover the irresistible charm of Rojo Tango, located in the emblematic Hotel Faena, in Puerto Madero.',
    long_description_es: 'Sumérgete en una experiencia fascinante que despierta tus sentidos y te transporta a un mundo de pasión y elegancia. Con una combinación perfecta de música cautivadora, aromas seductores, sabores exquisitos, colores vibrantes y movimientos envolventes, Rojo Tango te ofrece una velada inolvidable.',
    long_description_en: 'Immerse yourself in a fascinating experience that awakens your senses and transports you to a world of passion and elegance. With a perfect combination of captivating music, seductive aromas, exquisite flavors, vibrant colors and enveloping movements, Rojo Tango offers you an unforgettable evening.',
    address_es: 'Martha Salotti 445, Puerto Madero, Buenos Aires (Hotel Faena)',
    address_en: 'Martha Salotti 445, Puerto Madero, Buenos Aires (Hotel Faena)',
    schedule_summary_es: 'Lunes a Domingos. Cena desde 19:30. Show desde 21:15.',
    schedule_summary_en: 'Monday to Sunday. Dinner from 7:30 PM. Show from 9:15 PM.',
    dinner_show_time_es: 'Cena desde 19:30',
    show_only_time_es: 'Show desde 21:15',
    dinner_transfer_window_es: 'Desde zona centro o Palermo',
    show_only_transfer_window_es: 'Desde zona centro o Palermo',
    options: [
      {
        code: 'cena-show', name_es: 'Cena Show', name_en: 'Dinner Show',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Menú a la carta 3 pasos: entrada, plato principal y postre', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral. Copa de champagne Baron B', 'Vinos Terrazas Reserva Malbec y Chardonnay y bebidas sin alcohol', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', '3-course à la carte menu: starter, main course and dessert', 'Free drinks: wine, beer, soft drinks and mineral water. Glass of Baron B champagne', 'Terrazas Reserva Malbec and Chardonnay wines and non-alcoholic beverages', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 290, price_child_usd: null, has_dinner: true, has_transfer: true, show_only_time_enabled: false, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
      {
        code: 'solo-show', name_es: 'Solo Show', name_en: 'Show Only',
        description_es: null, description_en: null,
        includes_es: ['Mesa privada', 'Bebidas libres: vino, cerveza, gaseosas y agua mineral. Copa de champagne Baron B', 'Vinos Terrazas Reserva Malbec y Chardonnay y bebidas sin alcohol', 'Show de tango', 'Traslado ida y vuelta desde hoteles ubicados en el centro de la ciudad, Recoleta, Puerto Madero, San Telmo, Constitución y Palermo'],
        includes_en: ['Private table', 'Free drinks: wine, beer, soft drinks and mineral water. Glass of Baron B champagne', 'Terrazas Reserva Malbec and Chardonnay wines and non-alcoholic beverages', 'Tango show', 'Round-trip transfer from hotels in downtown, Recoleta, Puerto Madero, San Telmo, Constitución and Palermo'],
        price_adult_usd: 220, price_child_usd: null, has_dinner: false, has_transfer: true, show_only_time_enabled: true, available_days: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  },
];

async function importHouses() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // La categoría "shows-de-tango" ya existe (seed/migraciones). La aseguramos por las dudas.
    await client.query(
      `INSERT INTO categories (slug, name_es, name_en, description_es, description_en, display_order)
       VALUES ('shows-de-tango', 'Shows de Tango', 'Tango Shows',
               'Experiencias en las casas de tango más emblemáticas de Buenos Aires.',
               'Experiences at the most iconic tango houses of Buenos Aires.', 1)
       ON CONFLICT (slug) DO NOTHING`,
    );
    const { rows: catRows } = await client.query<{ id: number }>(
      `SELECT id FROM categories WHERE slug = 'shows-de-tango' LIMIT 1`,
    );
    const categoryId = catRows[0]?.id;
    if (!categoryId) throw new Error('Categoría "shows-de-tango" no encontrada.');

    // display_order arranca después de lo existente para no pisar la casa de referencia.
    const { rows: maxRows } = await client.query<{ max: number | null }>(
      `SELECT MAX(display_order) AS max FROM products`,
    );
    let order = (maxRows[0]?.max ?? 0) + 1;

    for (const house of HOUSES) {
      const startingPrice = Math.min(...house.options.map((o) => o.price_adult_usd));

      const { rows: prodRows } = await client.query<{ id: number }>(
        `INSERT INTO products (
           slug, category_id, name, venue_name,
           short_description_es, short_description_en,
           long_description_es, long_description_en,
           address_es, address_en,
           schedule_summary_es, schedule_summary_en,
           dinner_show_time_es, show_only_time_es,
           dinner_transfer_window_es, show_only_transfer_window_es,
           starting_price_usd, display_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           venue_name = EXCLUDED.venue_name,
           short_description_es = EXCLUDED.short_description_es,
           short_description_en = EXCLUDED.short_description_en,
           long_description_es = EXCLUDED.long_description_es,
           long_description_en = EXCLUDED.long_description_en,
           address_es = EXCLUDED.address_es,
           address_en = EXCLUDED.address_en,
           schedule_summary_es = EXCLUDED.schedule_summary_es,
           schedule_summary_en = EXCLUDED.schedule_summary_en,
           dinner_show_time_es = EXCLUDED.dinner_show_time_es,
           show_only_time_es = EXCLUDED.show_only_time_es,
           dinner_transfer_window_es = EXCLUDED.dinner_transfer_window_es,
           show_only_transfer_window_es = EXCLUDED.show_only_transfer_window_es,
           starting_price_usd = EXCLUDED.starting_price_usd,
           updated_at = NOW()
         RETURNING id`,
        [
          house.slug, categoryId, house.name, house.venue_name,
          house.short_description_es, house.short_description_en,
          house.long_description_es, house.long_description_en,
          house.address_es, house.address_en,
          house.schedule_summary_es, house.schedule_summary_en,
          house.dinner_show_time_es, house.show_only_time_es,
          house.dinner_transfer_window_es, house.show_only_transfer_window_es,
          startingPrice, order,
        ],
      );
      const productId = prodRows[0].id;
      order += 1;

      let optOrder = 1;
      for (const opt of house.options) {
        await client.query(
          `INSERT INTO product_options (
             product_id, code, name_es, name_en, description_es, description_en,
             includes_es, includes_en, price_adult_usd, price_child_usd,
             has_dinner, transfer_mode, available_days,
             show_only_time_enabled,
             display_order
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (product_id, code) DO UPDATE SET
             name_es = EXCLUDED.name_es,
             name_en = EXCLUDED.name_en,
             description_es = EXCLUDED.description_es,
             description_en = EXCLUDED.description_en,
             includes_es = EXCLUDED.includes_es,
             includes_en = EXCLUDED.includes_en,
             price_adult_usd = EXCLUDED.price_adult_usd,
             price_child_usd = EXCLUDED.price_child_usd,
             has_dinner = EXCLUDED.has_dinner,
             transfer_mode = EXCLUDED.transfer_mode,
             available_days = EXCLUDED.available_days,
             show_only_time_enabled = EXCLUDED.show_only_time_enabled,
             display_order = EXCLUDED.display_order`,
          [
            productId, opt.code, opt.name_es, opt.name_en, opt.description_es, opt.description_en,
            opt.includes_es, opt.includes_en, opt.price_adult_usd, opt.price_child_usd,
            // has_transfer del import (paquetes preexistentes) siempre fue "con costo" —
            // 'included' se marca a mano después desde el admin donde corresponda.
            opt.has_dinner, opt.has_transfer ? 'optional' : 'none', opt.available_days,
            opt.show_only_time_enabled,
            optOrder,
          ],
        );
        optOrder += 1;
      }

      console.log(`  ✓ ${house.name} — ${house.options.length} paquetes (desde USD ${startingPrice})`);
    }

    await client.query('COMMIT');
    console.log(`✅ Importación completa: ${HOUSES.length} casa(s).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Importación falló:', err);
    throw err;
  } finally {
    client.release();
  }
}

importHouses()
  .catch(() => process.exit(1))
  .finally(() => pool.end());
