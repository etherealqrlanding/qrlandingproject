// Carga los menús del resto de las casas (todas menos Señor Tango, que ya
// tiene su propio script seed-menu-senor-tango.ts), transcriptos de sus
// micrositios en tangosymilongas.com. Todos como menú PROPIO de cada tier
// (no general de la casa), porque el sitio original los diferencia por tier.
// Idempotente: no pisa un menú ya cargado a menos que se pase --force.
// Uso:
//   npm run seed:menu-remaining -- --force
import { parseArgs } from 'node:util';
import { pool } from '../db.js';
import { listProductMenus, upsertOptionMenu } from '../repos/admin-menus.js';
import { toAdminMenuInput, type RawMenuInput } from './menuHtmlHelpers.js';

// slug de la casa -> code del tier -> menú
const HOUSES: Record<string, Record<string, RawMenuInput>> = {
  'tango-porteno': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Boedo — Tartar de salmón rosado, remolachas y aguacate con vinagreta de limón', name_en: 'Boedo — Pink salmon tartare, beets and avocado with lemon vinaigrette' },
            { name_es: 'San Telmo — Clásicas empanadas criollas de carne cortada a cuchillo con aceitunas verdes', name_en: 'San Telmo — Classic hand-cut beef empanadas with green olives' },
            { name_es: 'Villa Urquiza — Hummus de remolacha con berenjenas y zucchinis asados, tomates cherry confitados y vinagreta de cítricos', name_en: 'Villa Urquiza — Beet hummus with roasted eggplant and zucchini, confit cherry tomatoes and citrus vinaigrette' },
            { name_es: 'Flores — Sopa crema de cebollas glaseadas, echalotes y puerros, crotones de pan de campo y perejil fresco', name_en: 'Flores — Creamy glazed onion, shallot and leek soup with country bread croutons and fresh parsley' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Parque Patricios — Bife de chorizo grillado con papa ahumada y verdeo', name_en: 'Parque Patricios — Grilled bife de chorizo with smoked potato and scallion' },
            { name_es: 'Caballito — Lomo de ternera con salsa de Malbec, papines andinos aplastados y espárragos grillados', name_en: 'Caballito — Beef tenderloin with Malbec sauce, crushed Andean potatoes and grilled asparagus' },
            { name_es: 'Villa Crespo — Salmón rosado con costra de frutos secos, risotto de arroz salvaje y puré de arvejas', name_en: 'Villa Crespo — Pink salmon with a nut crust, wild rice risotto and pea purée' },
            { name_es: 'Almagro — Roll de pollo relleno de pimientos asados, jamón y mozzarella, crema de verdeo y puré de calabaza', name_en: 'Almagro — Chicken roll stuffed with roasted peppers, ham and mozzarella, scallion cream and pumpkin purée' },
            { name_es: 'Nueva Pompeya — Bondiola de cerdo agridulce con dúo de batatas asadas y aceites de hierbas', name_en: 'Nueva Pompeya — Sweet and sour pork bondiola with roasted sweet potatoes and herb oils' },
            { name_es: 'San Cristóbal — Ravioles de ternera braseada con salsa mediterránea', name_en: 'San Cristóbal — Braised beef ravioli with Mediterranean sauce' },
            { name_es: 'Barracas — Fettuccine al pesto de albahaca y rúcula, salsa de pimientos amarillos, tomates cherry confitados y frutos secos', name_en: 'Barracas — Fettuccine with basil and arugula pesto, yellow pepper sauce, confit cherry tomatoes and nuts' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Tango Porteño — Degustación de clásicos postres porteños: flan con dulce de leche, helado de dulce de leche sobre biscuit de chocolate y naranja, y queso y dulce de batata', name_en: 'Tango Porteño — Tasting of classic Porteño desserts: dulce de leche flan, dulce de leche ice cream over chocolate-orange biscuit, and cheese with quince paste' },
            { name_es: 'Monserrat — Mousse de chocolate al cognac, cremoso de naranja, dulce de leche, sablé de cacao y naranja', name_en: 'Monserrat — Cognac chocolate mousse, orange cream, dulce de leche, cocoa-orange sablé' },
            { name_es: 'Congreso — Mousse de chocolate blanco, gelée de frutos del bosque, brownie de chocolate blanco y arándanos', name_en: 'Congreso — White chocolate mousse, forest berry gelée, white chocolate and blueberry brownie' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino DV Catena Cabernet o Chardonnay', name_en: 'DV Catena Cabernet or Chardonnay wine' },
            { name_es: 'Espumante Bianchi', name_en: 'Bianchi sparkling wine' },
            { name_es: 'Aguas, gaseosas y cerveza', name_en: 'Still water, soft drinks and beer' },
            { name_es: 'Café, té y petit fours', name_en: 'Coffee, tea and petit fours' },
          ],
        },
      ],
    },
    'cena-show-ejecutiva': {
      title_es: 'Menú Cena Show Ejecutiva', title_en: 'Executive Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'San Telmo — Clásicas empanadas criollas de carne cortada a cuchillo con aceitunas verdes', name_en: 'San Telmo — Classic hand-cut beef empanadas with green olives' },
            { name_es: 'Villa Urquiza — Hummus de remolacha con berenjenas y zucchinis asados, tomates cherry confitados y vinagreta de cítricos', name_en: 'Villa Urquiza — Beet hummus with roasted eggplant and zucchini, confit cherry tomatoes and citrus vinaigrette' },
            { name_es: 'Flores — Sopa crema de cebollas glaseadas, echalotes y puerros, crotones de pan de campo y perejil fresco', name_en: 'Flores — Creamy glazed onion, shallot and leek soup with country bread croutons and fresh parsley' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Parque Patricios — Bife de chorizo grillado con papa ahumada, verdeo, salsa criolla y chimichurri', name_en: 'Parque Patricios — Grilled bife de chorizo with smoked potato, scallion, salsa criolla and chimichurri' },
            { name_es: 'Almagro — Roll de pollo relleno de pimientos asados, jamón y mozzarella, crema de verdeo y puré de calabaza', name_en: 'Almagro — Chicken roll stuffed with roasted peppers, ham and mozzarella, scallion cream and pumpkin purée' },
            { name_es: 'Nueva Pompeya — Bondiola de cerdo agridulce con dúo de batatas asadas y aceites de hierbas', name_en: 'Nueva Pompeya — Sweet and sour pork bondiola with roasted sweet potatoes and herb oils' },
            { name_es: 'Barracas — Fettuccine al pesto de albahaca y rúcula, salsa de pimientos amarillos, tomates cherry confitados y frutos secos', name_en: 'Barracas — Fettuccine with basil and arugula pesto, yellow pepper sauce, confit cherry tomatoes and nuts' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Tango Porteño — Degustación de clásicos postres porteños', name_en: 'Tango Porteño — Tasting of classic Porteño desserts' },
            { name_es: 'Monserrat — Mousse de chocolate al cognac, cremoso de naranja, dulce de leche, sablé de cacao y naranja', name_en: 'Monserrat — Cognac chocolate mousse, orange cream, dulce de leche, cocoa-orange sablé' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Álamos Red Blend o Chardonnay', name_en: 'Alamos Red Blend or Chardonnay wine' },
            { name_es: 'Aguas, gaseosas y cerveza', name_en: 'Still water, soft drinks and beer' },
            { name_es: 'Café y té', name_en: 'Coffee and tea' },
          ],
        },
      ],
    },
    'cena-show-platea': {
      title_es: 'Menú Cena Show Platea', title_en: 'Platea Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'San Telmo — Clásicas empanadas criollas de carne cortada a cuchillo con aceitunas verdes', name_en: 'San Telmo — Classic hand-cut beef empanadas with green olives' },
            { name_es: 'Villa Urquiza — Hummus de remolacha con berenjenas y zucchinis asados, tomates cherry confitados y vinagreta de cítricos', name_en: 'Villa Urquiza — Beet hummus with roasted eggplant and zucchini, confit cherry tomatoes and citrus vinaigrette' },
            { name_es: 'Flores — Sopa crema de cebollas glaseadas, echalotes y puerros, crotones de pan de campo y perejil fresco', name_en: 'Flores — Creamy glazed onion, shallot and leek soup with country bread croutons and fresh parsley' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Parque Patricios — Bife de chorizo grillado con papa ahumada, verdeo, salsa criolla y chimichurri', name_en: 'Parque Patricios — Grilled bife de chorizo with smoked potato, scallion, salsa criolla and chimichurri' },
            { name_es: 'Almagro — Roll de pollo relleno de pimientos asados, jamón y mozzarella, crema de verdeo y puré de calabaza', name_en: 'Almagro — Chicken roll stuffed with roasted peppers, ham and mozzarella, scallion cream and pumpkin purée' },
            { name_es: 'Nueva Pompeya — Bondiola de cerdo agridulce con dúo de batatas asadas y aceites de hierbas', name_en: 'Nueva Pompeya — Sweet and sour pork bondiola with roasted sweet potatoes and herb oils' },
            { name_es: 'Barracas — Fettuccine al pesto de albahaca y rúcula, salsa de pimientos amarillos, tomates cherry confitados y frutos secos', name_en: 'Barracas — Fettuccine with basil and arugula pesto, yellow pepper sauce, confit cherry tomatoes and nuts' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Tango Porteño — Degustación de clásicos postres porteños', name_en: 'Tango Porteño — Tasting of classic Porteño desserts' },
            { name_es: 'Monserrat — Mousse de chocolate al cognac, cremoso de naranja, dulce de leche, sablé de cacao y naranja', name_en: 'Monserrat — Cognac chocolate mousse, orange cream, dulce de leche, cocoa-orange sablé' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Benjamín Nieto Malbec', name_en: 'Benjamín Nieto Malbec wine' },
            { name_es: 'Aguas, gaseosas y cerveza', name_en: 'Still water, soft drinks and beer' },
            { name_es: 'Café y té', name_en: 'Coffee and tea' },
          ],
        },
      ],
    },
  },

  'la-ventana': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Carpaccio de lomo marinado con hierbas, parmesano, pickles y alcaparras', name_en: 'Marinated beef carpaccio with herbs, parmesan, pickles and capers' },
            { name_es: 'Choripán argentino: cerdo en pan de masa madre, lechuga, tomate y chimichurri', name_en: 'Argentine choripán: pork on sourdough bread, lettuce, tomato and chimichurri' },
            { name_es: 'Empanada de carne con salsa criolla', name_en: 'Beef empanada with salsa criolla' },
            { name_es: 'Empanada de humita con salsa criolla', name_en: 'Corn empanada with salsa criolla' },
            { name_es: 'Empanada de cordero patagónico con salsa criolla', name_en: 'Patagonian lamb empanada with salsa criolla' },
            { name_es: 'Ensalada vegana: kale, brócoli, calabaza, quinoa, hongos, avellanas y tahini', name_en: 'Vegan salad: kale, broccoli, pumpkin, quinoa, mushrooms, hazelnuts and tahini' },
            { name_es: 'Ensalada Caprese con prosciutto: tomates, bocconcini de búfala y albahaca', name_en: 'Caprese salad with prosciutto: tomatoes, buffalo bocconcini and basil' },
            { name_es: 'Sopa de calabaza con quinoa crocante', name_en: 'Pumpkin soup with crispy quinoa' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo 450g con papas asadas y chimichurri', name_en: '450g bife de chorizo with roasted potatoes and chimichurri' },
            { name_es: 'Milanesa de bife de chorizo con papas, ensalada y mostaza Dijon', name_en: 'Bife de chorizo milanesa with potatoes, salad and Dijon mustard' },
            { name_es: 'Carrillera de ternera con cremoso de papas, quinoa y chimichurri', name_en: 'Beef cheek with creamy potatoes, quinoa and chimichurri' },
            { name_es: 'Bondiola de cerdo ahumada con cerveza patagónica, batatas y salsa criolla', name_en: 'Pork bondiola smoked with Patagonian beer, sweet potatoes and salsa criolla' },
            { name_es: 'Escalopa de pollo napolitana con pesto y papas asadas', name_en: 'Chicken escalope Napolitana with pesto and roasted potatoes' },
            { name_es: 'Pesca del día al limón, alcaparras, puré y espinacas', name_en: "Catch of the day with lemon, capers, purée and spinach" },
            { name_es: 'Raviolones de cabutia, tomillo y ricota con hongos', name_en: 'Pumpkin, thyme and ricotta raviolones with mushrooms' },
            { name_es: 'Pappardelle con hongos pino o portobello', name_en: 'Pappardelle with pine or portobello mushrooms' },
            { name_es: 'Spaghetti al pesto vegano', name_en: 'Spaghetti with vegan pesto' },
            { name_es: 'Ñoquis de sémola y azafrán', name_en: 'Semolina and saffron gnocchi' },
            { name_es: 'Lasaña bolognesa', name_en: 'Bolognese lasagna' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Tabla de quesos y dulces regionales: cuartirolo, batata, membrillo, higos y frutos secos', name_en: 'Regional cheese and preserves board: cuartirolo, sweet potato, quince, figs and nuts' },
            { name_es: 'Flan con dulce de leche y crema', name_en: 'Flan with dulce de leche and cream' },
            { name_es: 'Budín de pan con dulce de leche', name_en: 'Bread pudding with dulce de leche' },
            { name_es: 'Panqueque con dulce de leche', name_en: 'Pancake with dulce de leche' },
            { name_es: 'Crumble de estación con nueces y helado', name_en: 'Seasonal crumble with walnuts and ice cream' },
          ],
        },
      ],
    },
    'cena-show-ejecutiva': {
      title_es: 'Menú Cena Show', title_en: 'Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Carpaccio de lomo marinado con hierbas, parmesano, pickles y alcaparras', name_en: 'Marinated beef carpaccio with herbs, parmesan, pickles and capers' },
            { name_es: 'Choripán argentino: cerdo en pan de masa madre, lechuga, tomate y chimichurri', name_en: 'Argentine choripán: pork on sourdough bread, lettuce, tomato and chimichurri' },
            { name_es: 'Empanada de carne con salsa criolla', name_en: 'Beef empanada with salsa criolla' },
            { name_es: 'Ensalada vegana: kale, brócoli, calabaza, quinoa, hongos, avellanas y tahini', name_en: 'Vegan salad: kale, broccoli, pumpkin, quinoa, mushrooms, hazelnuts and tahini' },
            { name_es: 'Sopa de calabaza con quinoa crocante', name_en: 'Pumpkin soup with crispy quinoa' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo 450g con papas asadas y chimichurri', name_en: '450g bife de chorizo with roasted potatoes and chimichurri' },
            { name_es: 'Milanesa de bife de chorizo con papas, ensalada y mostaza Dijon', name_en: 'Bife de chorizo milanesa with potatoes, salad and Dijon mustard' },
            { name_es: 'Bondiola de cerdo ahumada con cerveza patagónica, batatas y salsa criolla', name_en: 'Pork bondiola smoked with Patagonian beer, sweet potatoes and salsa criolla' },
            { name_es: 'Escalopa de pollo napolitana con pesto y papas asadas', name_en: 'Chicken escalope Napolitana with pesto and roasted potatoes' },
            { name_es: 'Raviolones de cabutia, tomillo y ricota con hongos', name_en: 'Pumpkin, thyme and ricotta raviolones with mushrooms' },
            { name_es: 'Ñoquis de sémola y azafrán', name_en: 'Semolina and saffron gnocchi' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Flan con dulce de leche y crema', name_en: 'Flan with dulce de leche and cream' },
            { name_es: 'Panqueque con dulce de leche', name_en: 'Pancake with dulce de leche' },
            { name_es: 'Pera al Malbec con helado de vainilla', name_en: 'Pear poached in Malbec with vanilla ice cream' },
            { name_es: 'Copa helada de frutos de la Patagonia', name_en: 'Patagonian berry ice cream cup' },
          ],
        },
      ],
    },
  },

  'madero-tango': {
    'cena-show-premium': {
      title_es: 'Menú Cena Show Premium', title_en: 'Premium Dinner Show Menu',
      note_es: 'Se ofrecen también menús especiales (infantil, vegetariano, vegano, hiposódico, apto celíaco) con previo aviso.',
      note_en: 'Special menus (kids, vegetarian, vegan, low-sodium, gluten-free) are also available on request.',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Vichyssoise', name_en: 'Vichyssoise' },
            { name_es: 'Quinoa con hongos dorados, rúcula y aceite de perejil', name_en: 'Quinoa with golden mushrooms, arugula and parsley oil' },
            { name_es: 'Disco de polenta con fondue de morrones y berenjenas asadas', name_en: 'Polenta disc with roasted pepper fondue and roasted eggplant' },
            { name_es: 'Provoleta', name_en: 'Grilled provolone (provoleta)' },
            { name_es: 'Empanadas de carne', name_en: 'Beef empanadas' },
            { name_es: 'Waffle de queso con hojas verdes', name_en: 'Cheese waffle with mixed greens' },
            { name_es: 'Trío de hummus: tradicional, remolacha y palta', name_en: 'Hummus trio: traditional, beet and avocado' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Ragú de ternera', name_en: 'Beef ragù' },
            { name_es: 'Tagliolini con salsa de tomates cherry y bocconcini', name_en: 'Tagliolini with cherry tomato sauce and bocconcini' },
            { name_es: 'Coliflor horneado con especias', name_en: 'Spiced roasted cauliflower' },
            { name_es: 'Bondiola braseada', name_en: 'Braised pork bondiola' },
            { name_es: 'Baby beef', name_en: 'Baby beef' },
            { name_es: 'Suprema de pollo rellena', name_en: 'Stuffed chicken breast' },
            { name_es: 'Bife de chorizo', name_en: 'Bife de chorizo steak' },
            { name_es: 'Milanesa de bife de chorizo', name_en: 'Bife de chorizo milanesa' },
            { name_es: 'Sorrentinos de mozzarella y jamón', name_en: 'Mozzarella and ham sorrentinos' },
            { name_es: 'Pesca del día', name_en: 'Catch of the day' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Arroz con leche', name_en: 'Rice pudding' },
            { name_es: 'Bavaroise de yogurt y maracuyá', name_en: 'Yogurt and passion fruit bavaroise' },
            { name_es: 'Mousse de queso blanco y limón', name_en: 'White cheese and lemon mousse' },
            { name_es: 'Crema de chocolate blanco y naranjas', name_en: 'White chocolate and orange cream' },
            { name_es: 'Flan de dulce de leche', name_en: 'Dulce de leche flan' },
            { name_es: 'Brownie de chocolate y frutos secos', name_en: 'Chocolate and nut brownie' },
            { name_es: 'Chocotorta', name_en: 'Chocotorta' },
          ],
        },
      ],
    },
    'cena-show-ejecutiva': {
      title_es: 'Menú Cena Show Ejecutiva', title_en: 'Executive Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Vichyssoise', name_en: 'Vichyssoise' },
            { name_es: 'Quinoa con hongos dorados, rúcula y aceite de perejil', name_en: 'Quinoa with golden mushrooms, arugula and parsley oil' },
            { name_es: 'Disco de polenta con fondue de morrones y berenjenas asadas', name_en: 'Polenta disc with roasted pepper fondue and roasted eggplant' },
            { name_es: 'Provoleta', name_en: 'Grilled provolone (provoleta)' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Ragú de ternera', name_en: 'Beef ragù' },
            { name_es: 'Tagliolini con salsa de tomates cherry y bocconcini', name_en: 'Tagliolini with cherry tomato sauce and bocconcini' },
            { name_es: 'Coliflor horneado con especias', name_en: 'Spiced roasted cauliflower' },
            { name_es: 'Bondiola braseada', name_en: 'Braised pork bondiola' },
            { name_es: 'Baby beef', name_en: 'Baby beef' },
            { name_es: 'Suprema de pollo rellena', name_en: 'Stuffed chicken breast' },
            { name_es: 'Bife de chorizo', name_en: 'Bife de chorizo steak' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Arroz con leche', name_en: 'Rice pudding' },
            { name_es: 'Bavaroise de yogurt y maracuyá', name_en: 'Yogurt and passion fruit bavaroise' },
            { name_es: 'Mousse de queso blanco y limón', name_en: 'White cheese and lemon mousse' },
            { name_es: 'Crema de chocolate blanco y naranjas', name_en: 'White chocolate and orange cream' },
            { name_es: 'Flan de dulce de leche', name_en: 'Dulce de leche flan' },
          ],
        },
      ],
    },
    'cena-show-platea': {
      title_es: 'Menú Cena Show Platea', title_en: 'Platea Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Vichyssoise', name_en: 'Vichyssoise' },
            { name_es: 'Quinoa con hongos dorados, rúcula y aceite de perejil', name_en: 'Quinoa with golden mushrooms, arugula and parsley oil' },
            { name_es: 'Disco de polenta con fondue de morrones y berenjenas asadas', name_en: 'Polenta disc with roasted pepper fondue and roasted eggplant' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Ragú de ternera', name_en: 'Beef ragù' },
            { name_es: 'Tagliolini con salsa de tomates cherry y bocconcini', name_en: 'Tagliolini with cherry tomato sauce and bocconcini' },
            { name_es: 'Coliflor horneado con especias', name_en: 'Spiced roasted cauliflower' },
            { name_es: 'Bondiola braseada', name_en: 'Braised pork bondiola' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Arroz con leche', name_en: 'Rice pudding' },
            { name_es: 'Bavaroise de yogurt y maracuyá', name_en: 'Yogurt and passion fruit bavaroise' },
            { name_es: 'Mousse de queso blanco y limón', name_en: 'White cheese and lemon mousse' },
            { name_es: 'Crema de chocolate blanco y naranjas', name_en: 'White chocolate and orange cream' },
          ],
        },
      ],
    },
  },

  'homero-manzi': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP (Muy Bacán)', title_en: 'VIP Dinner Show Menu (Muy Bacán)',
      note_es: 'Menú sujeto a sugerencia del chef y estacionalidad de producto.',
      note_en: "Menu subject to the chef's recommendation and seasonal availability.",
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Rabas a la provenzal', name_en: 'Fried calamari Provençal-style' },
            { name_es: 'Milanesa de mozzarella sobre salsa de tomates', name_en: 'Mozzarella milanesa over tomato sauce' },
            { name_es: 'Ensalada Caprese (mozzarella, tomate, albahaca y aceitunas negras)', name_en: 'Caprese salad (mozzarella, tomato, basil and black olives)' },
            { name_es: 'Minestrone de verdura', name_en: 'Vegetable minestrone' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Lomo Homero Manzi', name_en: 'Homero Manzi-style beef tenderloin' },
            { name_es: 'Arroz con calamares', name_en: 'Rice with calamari' },
            { name_es: 'Brochette de lomo, pollo, panceta y vegetales con chimichurri y papas rissolé', name_en: 'Beef, chicken, bacon and vegetable brochette with chimichurri and rissolé potatoes' },
            { name_es: 'Ravioles de salmón con salsa mediterránea', name_en: 'Salmon ravioli with Mediterranean sauce' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Panqueque de manzana', name_en: 'Apple pancake' },
            { name_es: 'Almendrado bañado en chocolate', name_en: 'Chocolate-coated almond cake' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua mineral, gaseosa o jugo', name_en: 'Mineral water, soft drink or juice' },
            { name_es: 'Vino premium Malbec o Chardonnay (una botella cada dos personas)', name_en: 'Premium Malbec or Chardonnay wine (one bottle per two people)' },
          ],
        },
      ],
    },
    'cena-show': {
      title_es: 'Menú Cena Show', title_en: 'Dinner Show Menu',
      note_es: 'Menú sujeto a sugerencia del chef y estacionalidad de producto.',
      note_en: "Menu subject to the chef's recommendation and seasonal availability.",
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Rabas a la provenzal', name_en: 'Fried calamari Provençal-style' },
            { name_es: 'Milanesa de mozzarella sobre salsa de tomates', name_en: 'Mozzarella milanesa over tomato sauce' },
            { name_es: 'Ensalada Caprese (mozzarella, tomate, albahaca y aceitunas negras)', name_en: 'Caprese salad (mozzarella, tomato, basil and black olives)' },
            { name_es: 'Minestrone de verdura', name_en: 'Vegetable minestrone' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Lomo Homero Manzi', name_en: 'Homero Manzi-style beef tenderloin' },
            { name_es: 'Arroz con calamares', name_en: 'Rice with calamari' },
            { name_es: 'Brochette de lomo, pollo, panceta y vegetales con chimichurri y papas rissolé', name_en: 'Beef, chicken, bacon and vegetable brochette with chimichurri and rissolé potatoes' },
            { name_es: 'Ravioles de salmón con salsa mediterránea', name_en: 'Salmon ravioli with Mediterranean sauce' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Panqueque de manzana', name_en: 'Apple pancake' },
            { name_es: 'Almendrado bañado en chocolate', name_en: 'Chocolate-coated almond cake' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua mineral, gaseosa o jugo', name_en: 'Mineral water, soft drink or juice' },
            { name_es: 'Vino premium Malbec o Chardonnay (una botella cada dos personas)', name_en: 'Premium Malbec or Chardonnay wine (one bottle per two people)' },
          ],
        },
      ],
    },
  },

  'cafe-de-los-angelitos': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Gravlax de salmón rosado sobre cous cous cítrico, tomate, olivas y salsa tapenade', name_en: 'Pink salmon gravlax over citrus couscous, tomato, olives and tapenade sauce' },
            { name_es: 'Humita norteña al plato con salsa picante', name_en: 'Northern-style humita with spicy sauce' },
            { name_es: 'Empanadas criollas de carne cortada a cuchillo', name_en: 'Criollo-style hand-cut beef empanadas' },
            { name_es: 'Ciervo ahumado con queso brie, mermelada de tomate y mezclum', name_en: 'Smoked venison with brie cheese, tomato jam and mixed greens' },
            { name_es: 'Carpaccio de jibia con mayonesa casera, aceite de oliva y pimentón', name_en: 'Cuttlefish carpaccio with homemade mayonnaise, olive oil and paprika' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo Angus con papas rösti y bouquet de verdes', name_en: 'Angus bife de chorizo with potato rösti and mixed greens' },
            { name_es: 'Bondiola braseada a cocción lenta con salsa de Cointreau y vegetales asados', name_en: 'Slow-braised pork bondiola with Cointreau sauce and roasted vegetables' },
            { name_es: 'Medallón de lomo con vegetales grillados, cebollas caramelizadas, tomates cherry y reducción de Malbec', name_en: 'Beef tenderloin medallion with grilled vegetables, caramelized onions, cherry tomatoes and Malbec reduction' },
            { name_es: 'Salmón rosado con vegetales, jengibre salteado y confitado de tomates cherry', name_en: 'Pink salmon with vegetables, sautéed ginger and confit cherry tomatoes' },
            { name_es: 'Ravioles de calabaza, queso azul y nueces en masa de espinaca con salsa de vegetales y olivas', name_en: 'Pumpkin, blue cheese and walnut ravioli in spinach pasta with vegetable and olive sauce' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Mousse de chocolate con frutos del bosque', name_en: 'Chocolate mousse with forest berries' },
            { name_es: 'Pavlova con crema batida y frutos rojos', name_en: 'Pavlova with whipped cream and red berries' },
            { name_es: 'Tocinillo del cielo con miel de caña y crema', name_en: 'Tocinillo del cielo with cane honey and cream' },
            { name_es: 'Queso camembert con higos en almíbar, mermelada de naranja, castañas y almendras tostadas', name_en: 'Camembert cheese with figs in syrup, orange marmalade, chestnuts and toasted almonds' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Salentein Primus Malbec o Chardonnay', name_en: 'Salentein Primus Malbec or Chardonnay wine' },
            { name_es: 'Copa de espumante Alyda Van Salentein', name_en: 'Glass of Alyda Van Salentein sparkling wine' },
            { name_es: 'Agua mineral, gaseosas y cerveza', name_en: 'Mineral water, soft drinks and beer' },
          ],
        },
      ],
    },
    'cena-show-ejecutiva': {
      title_es: 'Menú Cena Show Ejecutiva', title_en: 'Executive Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Gravlax de salmón rosado sobre cous cous cítrico, tomate, olivas y salsa tapenade', name_en: 'Pink salmon gravlax over citrus couscous, tomato, olives and tapenade sauce' },
            { name_es: 'Humita norteña al plato con salsa picante', name_en: 'Northern-style humita with spicy sauce' },
            { name_es: 'Empanadas criollas de carne cortada a cuchillo', name_en: 'Criollo-style hand-cut beef empanadas' },
            { name_es: 'Ciervo ahumado con queso brie, mermelada de tomate y mezclum', name_en: 'Smoked venison with brie cheese, tomato jam and mixed greens' },
            { name_es: 'Carpaccio de jibia con mayonesa casera, aceite de oliva y pimentón', name_en: 'Cuttlefish carpaccio with homemade mayonnaise, olive oil and paprika' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo Angus con papas rösti y bouquet de verdes', name_en: 'Angus bife de chorizo with potato rösti and mixed greens' },
            { name_es: 'Bondiola braseada a cocción lenta con salsa de Cointreau y vegetales asados', name_en: 'Slow-braised pork bondiola with Cointreau sauce and roasted vegetables' },
            { name_es: 'Medallón de lomo con vegetales grillados, cebollas caramelizadas, tomates cherry y reducción de Malbec', name_en: 'Beef tenderloin medallion with grilled vegetables, caramelized onions, cherry tomatoes and Malbec reduction' },
            { name_es: 'Salmón rosado con vegetales, jengibre salteado y confitado de tomates cherry', name_en: 'Pink salmon with vegetables, sautéed ginger and confit cherry tomatoes' },
            { name_es: 'Ravioles de calabaza, queso azul y nueces en masa de espinaca con salsa de vegetales y olivas', name_en: 'Pumpkin, blue cheese and walnut ravioli in spinach pasta with vegetable and olive sauce' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Mousse de chocolate con frutos del bosque', name_en: 'Chocolate mousse with forest berries' },
            { name_es: 'Pavlova con crema batida y frutos rojos', name_en: 'Pavlova with whipped cream and red berries' },
            { name_es: 'Tocinillo del cielo con miel de caña y crema', name_en: 'Tocinillo del cielo with cane honey and cream' },
            { name_es: 'Queso camembert con higos en almíbar, mermelada de naranja, castañas y almendras tostadas', name_en: 'Camembert cheese with figs in syrup, orange marmalade, chestnuts and toasted almonds' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Salentein Numina Malbec o Chardonnay', name_en: 'Salentein Numina Malbec or Chardonnay wine' },
            { name_es: 'Agua mineral, gaseosas y cerveza', name_en: 'Mineral water, soft drinks and beer' },
          ],
        },
      ],
    },
    'cena-show-platea': {
      title_es: 'Menú Cena Show Platea', title_en: 'Platea Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Gravlax de salmón rosado sobre cous cous cítrico, tomate, olivas y salsa tapenade', name_en: 'Pink salmon gravlax over citrus couscous, tomato, olives and tapenade sauce' },
            { name_es: 'Humita norteña al plato con salsa picante', name_en: 'Northern-style humita with spicy sauce' },
            { name_es: 'Empanadas criollas de carne cortada a cuchillo', name_en: 'Criollo-style hand-cut beef empanadas' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo Angus con papas rösti y bouquet de verdes', name_en: 'Angus bife de chorizo with potato rösti and mixed greens' },
            { name_es: 'Bondiola braseada a cocción lenta con salsa de Cointreau y vegetales asados', name_en: 'Slow-braised pork bondiola with Cointreau sauce and roasted vegetables' },
            { name_es: 'Trucha patagónica con manteca de eneldo y ensalada de quinoa', name_en: 'Patagonian trout with dill butter and quinoa salad' },
            { name_es: 'Ravioles de calabaza, queso azul y nueces en masa de espinaca con salsa de vegetales y olivas', name_en: 'Pumpkin, blue cheese and walnut ravioli in spinach pasta with vegetable and olive sauce' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Mousse de chocolate con frutos del bosque', name_en: 'Chocolate mousse with forest berries' },
            { name_es: 'Pavlova con crema batida y frutos rojos', name_en: 'Pavlova with whipped cream and red berries' },
            { name_es: 'Tocinillo del cielo con miel de caña y crema', name_en: 'Tocinillo del cielo with cane honey and cream' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Portillo Malbec o Chardonnay', name_en: 'Portillo Malbec or Chardonnay wine' },
            { name_es: 'Agua mineral, gaseosas y cerveza', name_en: 'Mineral water, soft drinks and beer' },
          ],
        },
      ],
    },
  },

  'el-aljibe': {
    'cena-show': {
      title_es: 'Menú Cena Show', title_en: 'Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanadas criollas (opción picante), carne cortada a cuchillo', name_en: 'Criollo-style empanadas (spicy option available), hand-cut beef' },
            { name_es: 'Sopa de verduras de estación con crotones', name_en: 'Seasonal vegetable soup with croutons' },
            { name_es: 'Sopa de calabaza con queso parmesano y crotones', name_en: 'Pumpkin soup with parmesan cheese and croutons' },
            { name_es: 'Ensalada Caprese: tomate confitado, albahaca fresca y bocconcini de búfala', name_en: 'Caprese salad: confit tomato, fresh basil and buffalo bocconcini' },
            { name_es: 'Hummus & miso con verdes de la huerta, aceitunas y limón', name_en: 'Hummus and miso with garden greens, olives and lemon' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo 300g a la parrilla', name_en: 'Grilled 300g bife de chorizo' },
            { name_es: 'Milanesa de pollo crocante', name_en: 'Crispy chicken milanesa' },
            { name_es: 'Pesca del día a la parrilla con puré de papa, alcaparras y espinaca', name_en: 'Grilled catch of the day with potato purée, capers and spinach' },
            { name_es: 'Ravioles de espinaca y ricota', name_en: 'Spinach and ricotta ravioli' },
            { name_es: 'Ñoquis soufflé con salsa pomodoro, crema y albahaca', name_en: 'Soufflé gnocchi with pomodoro sauce, cream and basil' },
          ],
        },
        {
          name_es: 'Guarnición (elegir una)', name_en: 'Side dish (choice of)',
          items: [
            { name_es: 'Papas al horno', name_en: 'Roasted potatoes' },
            { name_es: 'Verduras', name_en: 'Vegetables' },
            { name_es: 'Puré', name_en: 'Mashed potatoes' },
            { name_es: 'Boniato', name_en: 'Sweet potato' },
            { name_es: 'Ensalada', name_en: 'Salad' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Copa helada con frutos rojos y merengue crocante', name_en: 'Ice cream cup with red berries and crispy meringue' },
            { name_es: 'Peras al Malbec con reducción de vino tinto y helado de vainilla', name_en: 'Pears in Malbec with red wine reduction and vanilla ice cream' },
            { name_es: 'Flan casero con dulce de leche y crema', name_en: 'Homemade flan with dulce de leche and cream' },
          ],
        },
        {
          name_es: 'Bebidas libres', name_en: 'Free drinks',
          items: [
            { name_es: 'Cerveza, gaseosas y agua mineral', name_en: 'Beer, soft drinks and mineral water' },
            { name_es: '1 botella de vino cada 2 personas', name_en: '1 bottle of wine per 2 people' },
          ],
        },
      ],
    },
  },

  'mansion-tango': {
    'cena-show-premium': {
      title_es: 'Menú Cena Show Premium', title_en: 'Premium Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanadas clásicas de carne cortada a cuchillo', name_en: 'Classic hand-cut beef empanadas' },
            { name_es: 'Salmón gravlax sobre tostadas de pan brioche con mayonesa de papas y eneldo', name_en: 'Salmon gravlax over brioche toast with potato and dill mayonnaise' },
            { name_es: 'Caponata de vegetales sobre hojas verdes con jamón serrano, mermelada de tomate y queso brie', name_en: 'Vegetable caponata over greens with serrano ham, tomato jam and brie cheese' },
            { name_es: 'Bocconcino empanado en coulis de tomate y pesto genovés', name_en: 'Breaded bocconcini in tomato coulis and Genovese pesto' },
            { name_es: 'Ensalada de peras asadas con hojas verdes, hinojos, nueces, tomates cherry, aceto balsámico y queso azul', name_en: 'Roasted pear salad with greens, fennel, walnuts, cherry tomatoes, balsamic emulsion and blue cheese' },
            { name_es: 'Vol au vent relleno de mollejas glaseadas y crema de portobellos', name_en: 'Vol-au-vent filled with glazed sweetbreads and portobello cream' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo con papas rústicas y cebollas caramelizadas', name_en: 'Bife de chorizo with rustic potatoes and caramelized onions' },
            { name_es: 'Crepe de cabutia ahumada con queso de cabra, nueces y salsa de girgolas', name_en: 'Smoked pumpkin crêpe with goat cheese, walnuts and oyster mushroom sauce' },
            { name_es: 'Bondiola braseada con puré de boniato, manzanas asadas y miel', name_en: 'Braised pork bondiola with sweet potato purée, roasted apples and honey' },
            { name_es: 'Pamplona de pollo con risotto de quinoa al Malbec, queso brie y crema de espárragos', name_en: 'Stuffed chicken pamplona with Malbec quinoa risotto, brie cheese and asparagus cream' },
            { name_es: 'Pesca del día con cuscús, ratatouille y reducción de naranjas', name_en: 'Catch of the day with couscous, ratatouille and orange reduction' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Panna cotta de chocolate blanco con reducción de casis y frutos rojos', name_en: 'White chocolate panna cotta with cassis reduction and red berries' },
            { name_es: 'Cheesecake de dulce de leche con salsa de chocolate y tuile', name_en: 'Dulce de leche cheesecake with chocolate sauce and tuile' },
            { name_es: 'Mousse de chocolate con praliné de pistachos y almíbar de menta', name_en: 'Chocolate mousse with pistachio praline and mint syrup' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua, gaseosa, cerveza y vino espumante libres', name_en: 'Free water, soft drinks, beer and sparkling wine' },
            { name_es: 'Vino Rutini Cabernet, Malbec o Chardonnay', name_en: 'Rutini Cabernet, Malbec or Chardonnay wine' },
          ],
        },
      ],
    },
    'cena-show-platino': {
      title_es: 'Menú Cena Show Platino', title_en: 'Platinum Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanadas clásicas de carne cortada a cuchillo', name_en: 'Classic hand-cut beef empanadas' },
            { name_es: 'Salmón gravlax sobre tostadas de pan brioche con mayonesa de papas y eneldo', name_en: 'Salmon gravlax over brioche toast with potato and dill mayonnaise' },
            { name_es: 'Caponata de vegetales sobre hojas verdes con jamón serrano, mermelada de tomate y queso brie', name_en: 'Vegetable caponata over greens with serrano ham, tomato jam and brie cheese' },
            { name_es: 'Bocconcino empanado en coulis de tomate y pesto genovés', name_en: 'Breaded bocconcini in tomato coulis and Genovese pesto' },
            { name_es: 'Ensalada de peras asadas con hojas verdes, hinojos, nueces, tomates cherry, aceto balsámico y queso azul', name_en: 'Roasted pear salad with greens, fennel, walnuts, cherry tomatoes, balsamic emulsion and blue cheese' },
            { name_es: 'Vol au vent relleno de mollejas glaseadas y crema de portobellos', name_en: 'Vol-au-vent filled with glazed sweetbreads and portobello cream' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo con papas rústicas y cebollas caramelizadas', name_en: 'Bife de chorizo with rustic potatoes and caramelized onions' },
            { name_es: 'Crepe de cabutia ahumada con queso de cabra, nueces y salsa de girgolas', name_en: 'Smoked pumpkin crêpe with goat cheese, walnuts and oyster mushroom sauce' },
            { name_es: 'Bondiola braseada con puré de boniato, manzanas asadas y miel', name_en: 'Braised pork bondiola with sweet potato purée, roasted apples and honey' },
            { name_es: 'Pamplona de pollo con risotto de quinoa al Malbec, queso brie y crema de espárragos', name_en: 'Stuffed chicken pamplona with Malbec quinoa risotto, brie cheese and asparagus cream' },
            { name_es: 'Pesca del día con cuscús, ratatouille y reducción de naranjas', name_en: 'Catch of the day with couscous, ratatouille and orange reduction' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Panna cotta de chocolate blanco con reducción de casis y frutos rojos', name_en: 'White chocolate panna cotta with cassis reduction and red berries' },
            { name_es: 'Cheesecake de dulce de leche con salsa de chocolate y tuile', name_en: 'Dulce de leche cheesecake with chocolate sauce and tuile' },
            { name_es: 'Mousse de chocolate con praliné de pistachos y almíbar de menta', name_en: 'Chocolate mousse with pistachio praline and mint syrup' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua, gaseosa, cerveza y vino espumante libres', name_en: 'Free water, soft drinks, beer and sparkling wine' },
            { name_es: 'Vino Trumpeter Malbec o Chardonnay', name_en: 'Trumpeter Malbec or Chardonnay wine' },
          ],
        },
      ],
    },
    'cena-show-ejecutiva': {
      title_es: 'Menú Cena Show Ejecutiva', title_en: 'Executive Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanadas clásicas de carne cortada a cuchillo', name_en: 'Classic hand-cut beef empanadas' },
            { name_es: 'Bocconcino empanado en coulis de tomate y pesto genovés', name_en: 'Breaded bocconcini in tomato coulis and Genovese pesto' },
            { name_es: 'Caponata de vegetales sobre hojas verdes con jamón serrano, mermelada de tomate y queso brie', name_en: 'Vegetable caponata over greens with serrano ham, tomato jam and brie cheese' },
            { name_es: 'Ensalada de peras asadas con hojas verdes, hinojos, nueces, tomates cherry, aceto balsámico y queso azul', name_en: 'Roasted pear salad with greens, fennel, walnuts, cherry tomatoes, balsamic emulsion and blue cheese' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo con papas rústicas y cebollas caramelizadas', name_en: 'Bife de chorizo with rustic potatoes and caramelized onions' },
            { name_es: 'Crepe de cabutia ahumada con queso de cabra, nueces y salsa de girgolas', name_en: 'Smoked pumpkin crêpe with goat cheese, walnuts and oyster mushroom sauce' },
            { name_es: 'Bondiola braseada con puré de boniato, manzanas asadas y miel', name_en: 'Braised pork bondiola with sweet potato purée, roasted apples and honey' },
            { name_es: 'Pamplona de pollo con risotto de quinoa al Malbec, queso brie y crema de espárragos', name_en: 'Stuffed chicken pamplona with Malbec quinoa risotto, brie cheese and asparagus cream' },
            { name_es: 'Pesca del día con cuscús, ratatouille y reducción de naranjas', name_en: 'Catch of the day with couscous, ratatouille and orange reduction' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Panna cotta de chocolate blanco con reducción de casis y frutos rojos', name_en: 'White chocolate panna cotta with cassis reduction and red berries' },
            { name_es: 'Cheesecake de dulce de leche con salsa de chocolate y tuile', name_en: 'Dulce de leche cheesecake with chocolate sauce and tuile' },
            { name_es: 'Mousse de chocolate con praliné de pistachos y almíbar de menta', name_en: 'Chocolate mousse with pistachio praline and mint syrup' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua, gaseosa y cerveza libres', name_en: 'Free water, soft drinks and beer' },
            { name_es: 'Vino San Felipe Malbec o Chardonnay', name_en: 'San Felipe Malbec or Chardonnay wine' },
          ],
        },
      ],
    },
  },

  'piazzolla-tango': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elegir)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanada criolla de ternera Angus', name_en: 'Criollo-style Angus beef empanada' },
            { name_es: 'Ensalada Caesar con pollo grillado', name_en: 'Caesar salad with grilled chicken' },
            { name_es: 'Sopa de calabaza orgánica ahumada', name_en: 'Smoked organic pumpkin soup' },
            { name_es: 'Tartar de salmón con langostinos', name_en: 'Salmon tartare with prawns' },
          ],
        },
        {
          name_es: 'Plato principal (a elegir)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Ojo de bife Angus con papas rústicas', name_en: 'Angus ribeye with rustic potatoes' },
            { name_es: 'Tagliatelle al pomodoro y albahaca', name_en: 'Tagliatelle with tomato sauce and basil' },
            { name_es: 'Pamplona de pollo rellena de frutos secos', name_en: 'Chicken pamplona stuffed with nuts' },
            { name_es: 'Salmón rosado grillado con risotto', name_en: 'Grilled pink salmon with risotto' },
            { name_es: 'Risotto de quinoa vegano', name_en: 'Vegan quinoa risotto' },
          ],
        },
        {
          name_es: 'Postre (a elegir)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Panna cotta de chocolate blanco', name_en: 'White chocolate panna cotta' },
            { name_es: 'Crocante de chocolate con crema de lima', name_en: 'Chocolate crunch with lime cream' },
            { name_es: 'Brownie con dulce de leche', name_en: 'Brownie with dulce de leche' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Trivento Golden Reserve Malbec o Chardonnay', name_en: 'Trivento Golden Reserve Malbec or Chardonnay wine' },
            { name_es: 'Cervezas, gaseosas o agua mineral', name_en: 'Beer, soft drinks or mineral water' },
          ],
        },
      ],
    },
    'cena-show-ejecutiva': {
      title_es: 'Menú Cena Show Ejecutiva', title_en: 'Executive Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Plato principal (a elegir)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Ojo de bife Angus con papas rústicas', name_en: 'Angus ribeye with rustic potatoes' },
            { name_es: 'Tagliatelle al pomodoro y albahaca', name_en: 'Tagliatelle with tomato sauce and basil' },
            { name_es: 'Pamplona de pollo rellena de frutos secos', name_en: 'Chicken pamplona stuffed with nuts' },
            { name_es: 'Salmón rosado grillado con risotto', name_en: 'Grilled pink salmon with risotto' },
            { name_es: 'Risotto de quinoa vegano', name_en: 'Vegan quinoa risotto' },
          ],
        },
        {
          name_es: 'Postre (a elegir)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Panna cotta de chocolate blanco', name_en: 'White chocolate panna cotta' },
            { name_es: 'Crocante de chocolate con crema de lima', name_en: 'Chocolate crunch with lime cream' },
            { name_es: 'Brownie con dulce de leche', name_en: 'Brownie with dulce de leche' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Tribu Malbec o Chardonnay', name_en: 'Tribu Malbec or Chardonnay wine' },
            { name_es: 'Cervezas, gaseosas, agua mineral, café o té', name_en: 'Beer, soft drinks, mineral water, coffee or tea' },
          ],
        },
      ],
    },
    'cena-show-platea': {
      title_es: 'Menú Cena Show Platea', title_en: 'Platea Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Plato principal (a elegir)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Ojo de bife Angus con papas rústicas', name_en: 'Angus ribeye with rustic potatoes' },
            { name_es: 'Tagliatelle al pomodoro y albahaca', name_en: 'Tagliatelle with tomato sauce and basil' },
            { name_es: 'Pamplona de pollo rellena de frutos secos', name_en: 'Chicken pamplona stuffed with nuts' },
            { name_es: 'Salmón rosado grillado con risotto', name_en: 'Grilled pink salmon with risotto' },
            { name_es: 'Risotto de quinoa vegano', name_en: 'Vegan quinoa risotto' },
          ],
        },
        {
          name_es: 'Postre (a elegir)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Panna cotta de chocolate blanco', name_en: 'White chocolate panna cotta' },
            { name_es: 'Crocante de chocolate con crema de lima', name_en: 'Chocolate crunch with lime cream' },
            { name_es: 'Brownie con dulce de leche', name_en: 'Brownie with dulce de leche' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino Tribu Malbec o Chardonnay', name_en: 'Tribu Malbec or Chardonnay wine' },
            { name_es: 'Cervezas, gaseosas, agua mineral, café o té', name_en: 'Beer, soft drinks, mineral water, coffee or tea' },
          ],
        },
      ],
    },
  },

  'catulo-tango': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanada de carne cortada a cuchillo', name_en: 'Hand-cut beef empanada' },
            { name_es: 'Empanada de roquefort y cebolla caramelizada', name_en: 'Roquefort and caramelized onion empanada' },
            { name_es: 'Ensalada Caprese (tomate, albahaca, mozzarella y aceite de oliva)', name_en: 'Caprese salad (tomato, basil, mozzarella and olive oil)' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo con papas fritas', name_en: 'Bife de chorizo with fries' },
            { name_es: 'Pollo relleno con salsa de champiñones y papas al horno', name_en: 'Stuffed chicken with mushroom sauce and roasted potatoes' },
            { name_es: 'Pesca del día con mix de verduras asadas', name_en: 'Catch of the day with roasted vegetable mix' },
            { name_es: 'Ravioles de espinaca (salsa a elección: pomodoro, crema, mixta o bechamel)', name_en: 'Spinach ravioli (choice of sauce: pomodoro, cream, mixed or béchamel)' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Apple crumble tibio con helado', name_en: 'Warm apple crumble with ice cream' },
            { name_es: 'Flan con dulce de leche y crema', name_en: 'Flan with dulce de leche and cream' },
            { name_es: 'Brownie con helado de crema y salsa de chocolate', name_en: 'Brownie with cream ice cream and chocolate sauce' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: '1 copa de vino, gaseosa o chopp de cerveza artesanal', name_en: '1 glass of wine, soft drink or craft beer' },
          ],
        },
      ],
    },
    'cena-show': {
      title_es: 'Menú Cena Show', title_en: 'Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Empanada de carne cortada a cuchillo', name_en: 'Hand-cut beef empanada' },
            { name_es: 'Empanada de roquefort y cebolla caramelizada', name_en: 'Roquefort and caramelized onion empanada' },
            { name_es: 'Ensalada Caprese (tomate, albahaca, mozzarella y aceite de oliva)', name_en: 'Caprese salad (tomato, basil, mozzarella and olive oil)' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo con papas fritas', name_en: 'Bife de chorizo with fries' },
            { name_es: 'Pollo relleno con salsa de champiñones y papas al horno', name_en: 'Stuffed chicken with mushroom sauce and roasted potatoes' },
            { name_es: 'Pesca del día con mix de verduras asadas', name_en: 'Catch of the day with roasted vegetable mix' },
            { name_es: 'Ravioles de espinaca (salsa a elección: pomodoro, crema, mixta o bechamel)', name_en: 'Spinach ravioli (choice of sauce: pomodoro, cream, mixed or béchamel)' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Apple crumble tibio con helado', name_en: 'Warm apple crumble with ice cream' },
            { name_es: 'Flan con dulce de leche y crema', name_en: 'Flan with dulce de leche and cream' },
            { name_es: 'Brownie con helado de crema y salsa de chocolate', name_en: 'Brownie with cream ice cream and chocolate sauce' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: '1 botella de vino cada 2 personas', name_en: '1 bottle of wine per 2 people' },
            { name_es: 'Chopp de cerveza artesanal', name_en: 'Draft craft beer' },
            { name_es: 'Aguas y gaseosas libres', name_en: 'Free still water and soft drinks' },
          ],
        },
      ],
    },
  },

  'el-querandi': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entrada (a elección)', name_en: 'Starter (choice of)',
          items: [
            { name_es: 'Salmón gravlax con rúcula, naranjas, tomates confitados, palta y salsa de leche de coco con eneldo', name_en: 'Salmon gravlax with arugula, oranges, confit tomatoes, avocado and coconut milk-dill sauce' },
            { name_es: 'Crocante de brie en masa filo con setas, frutillas y tomates cherry', name_en: 'Crispy phyllo brie with mushrooms, strawberries and cherry tomatoes' },
            { name_es: 'Carpaccio de lomo con rúcula y láminas de queso gruyere', name_en: 'Beef carpaccio with arugula and gruyère cheese shavings' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Rolls de cordero horneados al Josper, rellenos de cebolla y zanahoria, con papines', name_en: 'Josper-baked lamb rolls stuffed with onion and carrot, with baby potatoes' },
            { name_es: 'Salmón crocante envuelto en hojaldre y algas, con salsa crema de champagne', name_en: 'Crispy salmon wrapped in puff pastry and seaweed, with champagne cream sauce' },
            { name_es: 'Ojo de bife con puré de papas trufado y salsa criolla de manzana y especias', name_en: 'Ribeye with truffled potato purée and apple-spice salsa criolla' },
            { name_es: 'Pollo al ajillo con papas noisette', name_en: 'Garlic chicken with noisette potatoes' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Profiterol y pistacho helado bañados en chocolate', name_en: 'Profiteroles and pistachio ice cream coated in chocolate' },
            { name_es: 'Vol au vent sorpresa con masita de maicena', name_en: 'Surprise vol-au-vent with cornstarch shortbread' },
            { name_es: 'Mousse de chocolate con frutos rojos', name_en: 'Chocolate mousse with red berries' },
          ],
        },
        {
          name_es: 'Bebidas libres', name_en: 'Free drinks',
          items: [
            { name_es: 'Vino, cerveza, gaseosas y agua mineral', name_en: 'Wine, beer, soft drinks and mineral water' },
          ],
        },
      ],
    },
    'cena-show-tradicional': {
      title_es: 'Menú Cena Show Tradicional', title_en: 'Traditional Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas frías (a elección)', name_en: 'Cold starters (choice of)',
          items: [
            { name_es: 'Antipasto argentino (quesos, embutidos variados, encurtidos)', name_en: 'Argentine antipasto (cheeses, assorted cold cuts, pickles)' },
            { name_es: 'Ensalada San Telmo (hojas verdes, quesos locales, tomates cherry, semillas)', name_en: 'San Telmo salad (greens, local cheeses, cherry tomatoes, seeds)' },
          ],
        },
        {
          name_es: 'Entradas calientes (a elección)', name_en: 'Hot starters (choice of)',
          items: [
            { name_es: 'Empanadas criollas fritas', name_en: 'Fried criollo-style empanadas' },
            { name_es: 'Sopa crema de calabaza con parmesano gratinado', name_en: 'Creamy pumpkin soup with gratinated parmesan' },
            { name_es: 'Humita norteña', name_en: 'Northern-style humita' },
            { name_es: 'Milanesa de mozzarella en salsa pomodoro', name_en: 'Mozzarella milanesa in pomodoro sauce' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Sorrentinos de jamón y mozzarella', name_en: 'Ham and mozzarella sorrentinos' },
            { name_es: 'Crepes de espinaca en salsa de champiñones', name_en: 'Spinach crêpes in mushroom sauce' },
            { name_es: 'Pesca argentina con limones asados', name_en: 'Argentine catch with roasted lemons' },
            { name_es: 'Pechuga de pollo al dijon', name_en: 'Chicken breast with Dijon sauce' },
            { name_es: 'Pollo al ajillo', name_en: 'Garlic chicken' },
            { name_es: 'Bife de chorizo', name_en: 'Bife de chorizo steak' },
            { name_es: 'Pastel de papas argentino', name_en: 'Argentine shepherd\'s pie (pastel de papas)' },
            { name_es: 'Escalope al verdeo', name_en: 'Scallop-cut beef with scallion sauce' },
            { name_es: 'Cazuela patagónica de cordero', name_en: 'Patagonian lamb casserole' },
            { name_es: 'Matambrito al verdeo', name_en: 'Matambrito with scallion sauce' },
          ],
        },
        {
          name_es: 'Postre', name_en: 'Dessert',
          items: [
            { name_es: 'Flan', name_en: 'Flan' },
            { name_es: 'Postre "Vigilante" (queso y dulce)', name_en: '"Vigilante" dessert (cheese and quince paste)' },
            { name_es: 'Ensalada de frutas', name_en: 'Fruit salad' },
            { name_es: 'Panqueque de dulce de leche', name_en: 'Dulce de leche pancake' },
            { name_es: 'Helados variados', name_en: 'Assorted ice cream' },
            { name_es: 'Arroz con leche', name_en: 'Rice pudding' },
          ],
        },
      ],
    },
  },

  'gala-tango': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas frías (a elección)', name_en: 'Cold starters (choice of)',
          items: [
            { name_es: 'Carpaccio de lomo', name_en: 'Beef carpaccio' },
            { name_es: 'Ensalada Caprese y prosciutto', name_en: 'Caprese salad with prosciutto' },
            { name_es: 'Berenjena asada', name_en: 'Roasted eggplant' },
            { name_es: 'Hummus y miso', name_en: 'Hummus and miso' },
          ],
        },
        {
          name_es: 'Entradas calientes (a elección)', name_en: 'Hot starters (choice of)',
          items: [
            { name_es: 'Carne', name_en: 'Beef' },
            { name_es: 'Carne picante', name_en: 'Spicy beef' },
            { name_es: 'Cordero braseado', name_en: 'Braised lamb' },
            { name_es: 'Pacú ahumado', name_en: 'Smoked pacú' },
            { name_es: 'Sopa del día', name_en: 'Soup of the day' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo', name_en: 'Bife de chorizo steak' },
            { name_es: 'Entraña', name_en: 'Skirt steak' },
            { name_es: 'Milanesa', name_en: 'Milanesa' },
            { name_es: 'Cerdo ahumado', name_en: 'Smoked pork' },
            { name_es: 'Pesca del día', name_en: 'Catch of the day' },
            { name_es: 'Raviolones', name_en: 'Raviolones' },
            { name_es: 'Ñoquis', name_en: 'Gnocchi' },
            { name_es: 'Tagliatelle', name_en: 'Tagliatelle' },
          ],
        },
        {
          name_es: 'Postre (a elección)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Flan casero', name_en: 'Homemade flan' },
            { name_es: 'Panqueque quemado', name_en: 'Crème brûlée pancake' },
            { name_es: 'Copa helada', name_en: 'Ice cream cup' },
            { name_es: 'Peras al Malbec', name_en: 'Pears in Malbec' },
            { name_es: 'Queso y dulce', name_en: 'Cheese and quince paste' },
            { name_es: 'Frutas de estación', name_en: 'Seasonal fruit' },
            { name_es: 'Key lime pie', name_en: 'Key lime pie' },
          ],
        },
        {
          name_es: 'Café y té', name_en: 'Coffee and tea',
          items: [{ name_es: 'Café y té', name_en: 'Coffee and tea' }],
        },
      ],
    },
  },

  michelangelo: {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas (a elección)', name_en: 'Starters (choice of)',
          items: [
            { name_es: 'Carpaccio de lomo', name_en: 'Beef carpaccio' },
            { name_es: 'Chorizo puro cerdo', name_en: 'Pure pork chorizo' },
            { name_es: 'Empanada de carne', name_en: 'Beef empanada' },
            { name_es: 'Ensalada Caprese y prosciutto', name_en: 'Caprese salad with prosciutto' },
            { name_es: 'Berenjena asada', name_en: 'Roasted eggplant' },
            { name_es: 'Ensalada vegana de quinoa y garbanzos', name_en: 'Vegan quinoa and chickpea salad' },
            { name_es: 'Empanada de roquefort y mozzarella', name_en: 'Roquefort and mozzarella empanada' },
            { name_es: 'Sopa del día', name_en: 'Soup of the day' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo 400g', name_en: '400g bife de chorizo steak' },
            { name_es: 'Matambre de cerdo a la parrilla', name_en: 'Grilled pork matambre' },
            { name_es: 'Milanesa de bife de chorizo', name_en: 'Bife de chorizo milanesa' },
            { name_es: 'Milanesa de pollo crocante', name_en: 'Crispy chicken milanesa' },
            { name_es: 'Carrillera de ternera', name_en: 'Beef cheek' },
            { name_es: 'Pesca del día a la parrilla', name_en: 'Grilled catch of the day' },
            { name_es: 'Ravioles', name_en: 'Ravioli' },
            { name_es: 'Sorrentinos', name_en: 'Sorrentinos' },
            { name_es: 'Tagliatelle', name_en: 'Tagliatelle' },
            { name_es: 'Malfattis', name_en: 'Malfatti' },
          ],
        },
        {
          name_es: 'Postre (a elección)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Flan casero', name_en: 'Homemade flan' },
            { name_es: 'Panqueque quemado', name_en: 'Crème brûlée pancake' },
            { name_es: 'Copa helada', name_en: 'Ice cream cup' },
            { name_es: 'Peras al Malbec', name_en: 'Pears in Malbec' },
            { name_es: 'Queso y dulce', name_en: 'Cheese and quince paste' },
            { name_es: 'Budín de pan', name_en: 'Bread pudding' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino', name_en: 'Wine' },
            { name_es: 'Agua con y sin gas', name_en: 'Still and sparkling water' },
            { name_es: 'Gaseosas', name_en: 'Soft drinks' },
            { name_es: 'Cerveza', name_en: 'Beer' },
            { name_es: 'Espumante', name_en: 'Sparkling wine' },
          ],
        },
      ],
    },
    'cena-show': {
      title_es: 'Menú Cena Show', title_en: 'Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas (a elección)', name_en: 'Starters (choice of)',
          items: [
            { name_es: 'Carpaccio de lomo', name_en: 'Beef carpaccio' },
            { name_es: 'Chorizo puro cerdo', name_en: 'Pure pork chorizo' },
            { name_es: 'Empanada de carne', name_en: 'Beef empanada' },
            { name_es: 'Ensalada Caprese y prosciutto', name_en: 'Caprese salad with prosciutto' },
            { name_es: 'Berenjena asada', name_en: 'Roasted eggplant' },
            { name_es: 'Ensalada vegana de quinoa y garbanzos', name_en: 'Vegan quinoa and chickpea salad' },
            { name_es: 'Empanada de roquefort y mozzarella', name_en: 'Roquefort and mozzarella empanada' },
            { name_es: 'Sopa del día', name_en: 'Soup of the day' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo 400g', name_en: '400g bife de chorizo steak' },
            { name_es: 'Matambre de cerdo a la parrilla', name_en: 'Grilled pork matambre' },
            { name_es: 'Milanesa de bife de chorizo', name_en: 'Bife de chorizo milanesa' },
            { name_es: 'Milanesa de pollo crocante', name_en: 'Crispy chicken milanesa' },
            { name_es: 'Carrillera de ternera', name_en: 'Beef cheek' },
            { name_es: 'Pesca del día a la parrilla', name_en: 'Grilled catch of the day' },
            { name_es: 'Ravioles', name_en: 'Ravioli' },
            { name_es: 'Sorrentinos', name_en: 'Sorrentinos' },
            { name_es: 'Tagliatelle', name_en: 'Tagliatelle' },
            { name_es: 'Malfattis', name_en: 'Malfatti' },
          ],
        },
        {
          name_es: 'Postre (a elección)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Flan casero', name_en: 'Homemade flan' },
            { name_es: 'Panqueque quemado', name_en: 'Crème brûlée pancake' },
            { name_es: 'Copa helada', name_en: 'Ice cream cup' },
            { name_es: 'Peras al Malbec', name_en: 'Pears in Malbec' },
            { name_es: 'Queso y dulce', name_en: 'Cheese and quince paste' },
            { name_es: 'Budín de pan', name_en: 'Bread pudding' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Vino', name_en: 'Wine' },
            { name_es: 'Cerveza', name_en: 'Beer' },
            { name_es: 'Gaseosas', name_en: 'Soft drinks' },
            { name_es: 'Agua mineral', name_en: 'Mineral water' },
          ],
        },
      ],
    },
  },

  'el-viejo-almacen': {
    'cena-show-vip': {
      title_es: 'Menú Cena Show VIP', title_en: 'VIP Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas (a elección)', name_en: 'Starters (choice of)',
          items: [
            { name_es: 'Empanadas criollas (carne cortada a cuchillo)', name_en: 'Criollo-style beef empanadas (hand-cut beef)' },
            { name_es: 'Tartar de salmón con palta, tomate, cebolla morada, cilantro y limón, sobre mezclum de verdes', name_en: 'Salmon tartare with avocado, tomato, red onion, cilantro and lime, over mixed greens' },
            { name_es: 'Sopa de camarones y choclo', name_en: 'Shrimp and corn soup' },
            { name_es: 'Ensalada Arrabal: quinoa, calabaza asada, tomates confitados, verdes y semillas tostadas', name_en: 'Arrabal salad: quinoa, roasted pumpkin, confit tomatoes, greens and toasted seeds' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Tournedo de lomo en salsa bordalesa con gratín de papas', name_en: 'Beef tenderloin tournedos in bordelaise sauce with potato gratin' },
            { name_es: 'Envoltini de pollo relleno de espinaca, salsa amaretto y cremoso de choclo, puerro y miel, con chips de papa', name_en: 'Chicken envoltini stuffed with spinach, amaretto sauce, creamy corn, leek and honey, with potato chips' },
            { name_es: 'Salmón en croute de semillas con ratatouille de vegetales al teriyaki', name_en: 'Seed-crusted salmon with teriyaki vegetable ratatouille' },
            { name_es: 'Penne rigate con salsa basílica (tomate, albahaca, ajo, oliva) y brócoli salteado', name_en: 'Penne rigate with basil sauce (tomato, basil, garlic, olive oil) and sautéed broccoli' },
            { name_es: 'Ragú de legumbres con arroz yamaní', name_en: 'Legume ragù with yamaní rice' },
          ],
        },
        {
          name_es: 'Postre (a elección)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Torta Viejo Almacén', name_en: 'Viejo Almacén cake' },
            { name_es: 'Mousse de chocolate con coulis de frutos rojos', name_en: 'Chocolate mousse with red berry coulis' },
            { name_es: 'Crumble tibio de peras con crema americana', name_en: 'Warm pear crumble with American-style cream' },
            { name_es: 'Parfait de coco con salsa de dulce de leche', name_en: 'Coconut parfait with dulce de leche sauce' },
            { name_es: 'Ensalada de frutas', name_en: 'Fruit salad' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua mineral con y sin gas', name_en: 'Still and sparkling mineral water' },
            { name_es: 'Bebidas sin alcohol', name_en: 'Soft drinks' },
            { name_es: 'Vino Malbec y Chardonnay Trapiche Reserva', name_en: 'Trapiche Reserva Malbec and Chardonnay wine' },
          ],
        },
      ],
    },
    'cena-show-tradicional': {
      title_es: 'Menú Cena Show Tradicional', title_en: 'Traditional Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas (a elección)', name_en: 'Starters (choice of)',
          items: [
            { name_es: 'Empanadas criollas', name_en: 'Criollo-style empanadas' },
            { name_es: 'Ensalada alemana (papas, alcaparras, pepinillos, perifollo, cebolla y aderezo Dijon) con chip de jamón crudo tostado', name_en: 'German-style salad (potatoes, capers, gherkins, chervil, onion and Dijon dressing) with toasted prosciutto chip' },
            { name_es: 'Sopa de calabaza, zanahoria y jengibre', name_en: 'Pumpkin, carrot and ginger soup' },
            { name_es: 'Ensalada porteña: mix de verdes, chutney de tomate, palta y garbanzos', name_en: 'Porteña salad: mixed greens, tomato chutney, avocado and chickpeas' },
          ],
        },
        {
          name_es: 'Plato principal (a elección)', name_en: 'Main course (choice of)',
          items: [
            { name_es: 'Bife de chorizo con papas asadas, mix de verdes y salsa criolla', name_en: 'Bife de chorizo with roasted potatoes, mixed greens and salsa criolla' },
            { name_es: 'Bondiola braseada con batatas caramelizadas y salsa de oporto', name_en: 'Braised pork bondiola with caramelized sweet potatoes and port wine sauce' },
            { name_es: 'Balotina de ave rellena de vegetales asados, puré especiado y salsa Chablis', name_en: 'Poultry ballotine stuffed with roasted vegetables, spiced purée and Chablis sauce' },
            { name_es: 'Sorrentinos de salmón con salsa de puerros', name_en: 'Salmon sorrentinos with leek sauce' },
            { name_es: 'Risotto de hongos', name_en: 'Mushroom risotto' },
          ],
        },
        {
          name_es: 'Postre (a elección)', name_en: 'Dessert (choice of)',
          items: [
            { name_es: 'Postre vigilante (queso y dulce)', name_en: '"Vigilante" dessert (cheese and quince paste)' },
            { name_es: 'Torta Viejo Almacén', name_en: 'Viejo Almacén cake' },
            { name_es: 'Flan casero mixto', name_en: 'Homemade mixed flan' },
            { name_es: 'Trifle helado (helado, merengue, biscuit y frutos rojos)', name_en: 'Iced trifle (ice cream, meringue, biscuit and red berries)' },
          ],
        },
        {
          name_es: 'Bebidas', name_en: 'Drinks',
          items: [
            { name_es: 'Agua mineral con y sin gas', name_en: 'Still and sparkling mineral water' },
            { name_es: 'Bebidas sin alcohol', name_en: 'Soft drinks' },
            { name_es: 'Vino Malbec y Chardonnay Trapiche', name_en: 'Trapiche Malbec and Chardonnay wine' },
          ],
        },
      ],
    },
  },

  'rojo-tango': {
    'cena-show': {
      title_es: 'Menú Cena Show', title_en: 'Dinner Show Menu',
      is_visible: true,
      courses: [
        {
          name_es: 'Entradas (a elección)', name_en: 'Starters (choice of)',
          items: [
            { name_es: 'Queso burrata — con rúcula crocante, tomates secos marinados, pesto de albahaca, almendras tostadas y polvo de prosciutto', name_en: 'Burrata cheese — with crispy arugula, marinated sun-dried tomatoes, basil pesto, toasted almonds and prosciutto powder' },
            { name_es: 'Carpaccio de pulpo — con aceite de pimentón, polvo de aceitunas negras, tomate cherry asado, alioli de aceitunas verdes y chips de papines', name_en: 'Octopus carpaccio — with paprika oil, black olive powder, roasted cherry tomato, green olive aioli and baby potato chips' },
            { name_es: 'Crocante de masa filo — relleno de ragout de hongos, aceite de trufa y queso parmesano, con salsa muhammara y reducción de aceto balsámico', name_en: 'Crispy phyllo pastry — filled with mushroom ragout, truffle oil and parmesan cheese, with muhammara sauce and balsamic reduction' },
          ],
        },
        {
          name_es: 'Principales (a elección)', name_en: 'Main courses (choice of)',
          items: [
            { name_es: 'Cordero patagónico braseado — cremoso de batata, cebollas caramelizadas y vegetales de estación, salsa de Malbec y oporto', name_en: 'Braised Patagonian lamb — sweet potato purée, caramelized onions and seasonal vegetables, Malbec and port wine sauce' },
            { name_es: 'Salmón rosado grillado — puré de boniato, vegetales salteados, crema de limón y langostinos', name_en: 'Grilled pink salmon — sweet potato purée, sautéed vegetables, lemon cream and prawns' },
            { name_es: 'Agnolottis rellenos de parmesano, ricota y pecorino — con crema de queso de cabra, aceite de albahaca y limón', name_en: 'Agnolotti stuffed with parmesan, ricotta and pecorino — goat cheese cream, basil oil and lemon' },
          ],
        },
        {
          name_es: 'Postres (a elección)', name_en: 'Desserts (choice of)',
          items: [
            { name_es: 'Flan de tres leches y vainilla — con dulce de leche y crema', name_en: 'Three-milk and vanilla flan — with dulce de leche and cream' },
            { name_es: 'Cremoso de chocolate semiamargo 55% — con curd de maracuyá, frutillas y crumble de cacao y avellanas', name_en: '55% semi-bittersweet chocolate cremoso — with passion fruit curd, strawberries and cocoa-hazelnut crumble' },
            { name_es: 'Cheesecake tradicional estilo New York — con frutas frescas de estación y reducción de frambuesa', name_en: 'Traditional New York-style cheesecake — with fresh seasonal fruit and raspberry reduction' },
          ],
        },
        {
          name_es: 'Bebidas libres', name_en: 'Free drinks',
          items: [
            { name_es: 'Champagne (Baron B.)', name_en: 'Champagne (Baron B.)' },
            { name_es: 'Vinos línea Terrazas', name_en: 'Terrazas line wines' },
            { name_es: 'Bebidas sin alcohol', name_en: 'Soft drinks' },
            { name_es: 'Café Nespresso', name_en: 'Nespresso coffee' },
          ],
        },
      ],
    },
  },
};

async function main() {
  const { values } = parseArgs({
    options: { force: { type: 'boolean', default: false } },
    allowPositionals: false,
  });

  for (const [slug, tiers] of Object.entries(HOUSES)) {
    const { rows: prodRows } = await pool.query<{ id: number }>(`SELECT id FROM products WHERE slug = $1`, [slug]);
    const productId = prodRows[0]?.id;
    if (!productId) {
      console.warn(`⚠ No se encontró el producto "${slug}" — se salteó.`);
      continue;
    }
    const { rows: optRows } = await pool.query<{ id: number; code: string }>(
      `SELECT id, code FROM product_options WHERE product_id = $1`, [productId],
    );
    const existing = await listProductMenus(productId);

    for (const [code, raw] of Object.entries(tiers)) {
      const option = optRows.find((o) => o.code === code);
      if (!option) {
        console.warn(`⚠ [${slug}] No se encontró el tier "${code}" — se salteó.`);
        continue;
      }
      const already = existing.find((m) => m.option_id === option.id);
      if (already && already.content_html.trim() && !values.force) {
        console.log(`⚠ [${slug}] "${code}" ya tiene menú cargado. No se pisa.`);
        continue;
      }
      await upsertOptionMenu(option.id, toAdminMenuInput(raw));
      console.log(`  ✓ [${slug}] Menú cargado para "${code}" (${raw.courses.length} cursos)`);
    }
  }

  console.log('✅ Listo.');
}

main()
  .catch((err) => {
    console.error('❌ Seed de menús falló:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
