-- Menús de comida por casa/servicio. product_menus.option_id NULL = menú
-- general de la casa (aplica a todo tier con cena que no tenga uno propio);
-- option_id seteado = menú propio de ese tier, que lo sobreescribe por completo.
-- product_id siempre va poblado (incluso en filas de tier) para poder traer
-- "todos los menús de una casa" con una sola query sin joins.
CREATE TABLE IF NOT EXISTS product_menus (
  id             SERIAL PRIMARY KEY,
  product_id     INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id      INT REFERENCES product_options(id) ON DELETE CASCADE,
  title_es       TEXT,
  title_en       TEXT,
  note_es        TEXT,
  note_en        TEXT,
  is_visible     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A lo sumo un menú general por casa, y a lo sumo un menú propio por tier.
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_menus_general ON product_menus(product_id) WHERE option_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_menus_option ON product_menus(option_id) WHERE option_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_menu_courses (
  id             SERIAL PRIMARY KEY,
  menu_id        INT NOT NULL REFERENCES product_menus(id) ON DELETE CASCADE,
  name_es        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  display_order  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_courses_menu ON product_menu_courses(menu_id, display_order);

CREATE TABLE IF NOT EXISTS product_menu_items (
  id             SERIAL PRIMARY KEY,
  course_id      INT NOT NULL REFERENCES product_menu_courses(id) ON DELETE CASCADE,
  name_es        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  display_order  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_course ON product_menu_items(course_id, display_order);
