-- ─────────────────────────────────────────────────────────
-- Ethereal Tours — Schema inicial (Fase 2)
-- ─────────────────────────────────────────────────────────
-- Modelo:
--   categories ──< products (una "casa de tango" / experiencia)
--                    │
--                    ├──< product_options  (tiers: Cena VIP, Solo Show, etc.)
--                    │       │
--                    │       └──< option_availability  (cupos/bloqueos por fecha)
--                    │
--                    └──< product_images   (galería para carousel)
-- ─────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categorías: Shows de Tango, Tours, Programas, Alojamiento, Traslados
CREATE TABLE IF NOT EXISTS categories (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  name_es         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  description_es  TEXT,
  description_en  TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Productos = cada casa de tango / experiencia única
CREATE TABLE IF NOT EXISTS products (
  id                     SERIAL PRIMARY KEY,
  slug                   TEXT UNIQUE NOT NULL,
  category_id            INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name                   TEXT NOT NULL,
  venue_name             TEXT NOT NULL,
  short_description_es   TEXT,
  short_description_en   TEXT,
  long_description_es    TEXT,
  long_description_en    TEXT,
  address_es             TEXT,
  address_en             TEXT,
  schedule_summary_es    TEXT,   -- texto libre descriptivo (overview)
  schedule_summary_en    TEXT,
  starting_price_usd     NUMERIC(10,2),  -- denormalizado: precio mínimo entre options (para "desde $X")
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  display_order          INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = TRUE;

-- Opciones/tiers por producto. Cada casa define las suyas, no hay lista fija.
-- Ej: Casa A tiene ["Cena VIP", "Cena Ejecutiva", "Solo Show Promo"]; Casa B tiene ["Premium", "Solo Show"].
CREATE TABLE IF NOT EXISTS product_options (
  id                       SERIAL PRIMARY KEY,
  product_id               INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,  -- identificador interno: 'cena-vip', 'solo-show-promo', etc.
  name_es                  TEXT NOT NULL,
  name_en                  TEXT NOT NULL,
  description_es           TEXT,
  description_en           TEXT,
  includes_es              TEXT[] NOT NULL DEFAULT '{}',
  includes_en              TEXT[] NOT NULL DEFAULT '{}',
  price_adult_usd          NUMERIC(10,2) NOT NULL,
  price_child_usd          NUMERIC(10,2),  -- NULL si no admite menores con tarifa
  has_dinner               BOOLEAN NOT NULL DEFAULT FALSE,
  has_transfer             BOOLEAN NOT NULL DEFAULT FALSE,
  -- Días de operación (1=Lun, 7=Dom). Array vacío = sin restricción.
  available_days           SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  -- Horarios (texto libre para poder describir "19:30 a 20:00" en pickup)
  pickup_window_es         TEXT,            -- ej: "Entre 19:30 y 20:00"
  pickup_window_en         TEXT,
  dinner_time_es           TEXT,            -- ej: "Cena desde 20:00"
  dinner_time_en           TEXT,
  show_time_es             TEXT,            -- ej: "Show desde 22:00"
  show_time_en             TEXT,
  -- Cupo por defecto cuando no hay override en option_availability
  default_capacity_per_day INT NOT NULL DEFAULT 80,
  display_order            INT NOT NULL DEFAULT 0,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, code),
  CHECK (price_adult_usd >= 0),
  CHECK (price_child_usd IS NULL OR price_child_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_options_product ON product_options(product_id);
CREATE INDEX IF NOT EXISTS idx_options_active ON product_options(is_active) WHERE is_active = TRUE;

-- Override de cupos / cierres por fecha. Si no hay row, vale default_capacity_per_day.
CREATE TABLE IF NOT EXISTS option_availability (
  id                  SERIAL PRIMARY KEY,
  option_id           INT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  capacity_override   INT,         -- NULL = usar default; 0 = cerrado ese día
  is_closed           BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (option_id, date)
);

CREATE INDEX IF NOT EXISTS idx_availability_option_date ON option_availability(option_id, date);

-- Galería de imágenes para el carousel
CREATE TABLE IF NOT EXISTS product_images (
  id             SERIAL PRIMARY KEY,
  product_id     INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  alt_text       TEXT,
  display_order  INT NOT NULL DEFAULT 0,
  is_hero        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, display_order);

-- Control de migraciones aplicadas
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
