-- ─────────────────────────────────────────────────────────
-- Ethereal Tours — Schema de checkout (Fase 3)
-- ─────────────────────────────────────────────────────────
-- Agrega:
--   - settings: key/value para config dinámica (tipo de cambio USD→ARS, comisiones default, etc.)
--   - sellers: vendedores con código de QR + porcentaje de comisión
--   - orders: cabecera de cada venta
--   - order_items: detalle (servicio, fecha, cantidad adultos/menores)
--   - order_attributions: vínculo orden ↔ vendedor para cálculo de comisión
--   - payments: registro de eventos de pago (preferences MP, webhooks, etc.)
-- ─────────────────────────────────────────────────────────

-- Settings genérico (clave/valor con tipo)
CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vendedores (Uber, conserjes, hoteles, agencias)
CREATE TABLE IF NOT EXISTS sellers (
  id                   SERIAL PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,   -- el código que va en el QR (?ref=CODE)
  name                 TEXT NOT NULL,
  contact_email        TEXT,
  contact_phone        TEXT,
  kind                 TEXT,                   -- 'uber', 'hotel', 'concierge', 'agency', etc.
  commission_percent   NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (commission_percent >= 0 AND commission_percent <= 100),
  CHECK (code ~ '^[A-Za-z0-9_-]{3,32}$')
);

CREATE INDEX IF NOT EXISTS idx_sellers_active ON sellers(is_active) WHERE is_active = TRUE;

-- Estados posibles de una orden
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Órdenes: cabecera (montos congelados al momento de la compra)
CREATE TABLE IF NOT EXISTS orders (
  id                       SERIAL PRIMARY KEY,
  public_id                UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  status                   order_status NOT NULL DEFAULT 'pending',
  -- Datos del cliente (capturados en el form, también enviados a MP)
  customer_name            TEXT NOT NULL,
  customer_email           TEXT NOT NULL,
  customer_phone           TEXT,
  customer_nationality     TEXT,            -- ISO-2 o nombre libre
  -- Totales (congelados, no leer de products en el futuro)
  total_usd                NUMERIC(10,2) NOT NULL,
  total_ars                NUMERIC(12,2) NOT NULL,
  exchange_rate_used       NUMERIC(10,4) NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'ARS',
  -- MP
  mp_preference_id         TEXT,
  mp_payment_id            TEXT,
  mp_payment_status        TEXT,
  mp_payment_method        TEXT,
  -- Trazabilidad
  ref_code                 TEXT,            -- código del vendedor capturado de la cookie
  utm_source               TEXT,
  utm_medium               TEXT,
  utm_campaign             TEXT,
  -- Notas internas
  internal_notes           TEXT,
  paid_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total_usd >= 0),
  CHECK (total_ars >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_mp_preference ON orders(mp_preference_id);
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment ON orders(mp_payment_id);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Items: el detalle (qué servicio, cuándo, cuántos adultos/menores)
CREATE TABLE IF NOT EXISTS order_items (
  id                      SERIAL PRIMARY KEY,
  order_id                INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id              INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  option_id               INT NOT NULL REFERENCES product_options(id) ON DELETE RESTRICT,
  -- Congelamos snapshot al momento de la compra
  product_name_snapshot   TEXT NOT NULL,
  option_name_snapshot    TEXT NOT NULL,
  service_date            DATE NOT NULL,
  adults                  INT NOT NULL,
  children                INT NOT NULL DEFAULT 0,
  unit_price_adult_usd    NUMERIC(10,2) NOT NULL,
  unit_price_child_usd    NUMERIC(10,2),
  subtotal_usd            NUMERIC(10,2) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (adults >= 1),
  CHECK (children >= 0),
  CHECK (subtotal_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_option_date ON order_items(option_id, service_date);

-- Atribución a vendedor: 0 o 1 por orden (en el futuro podría haber multi-attribution)
CREATE TABLE IF NOT EXISTS order_attributions (
  id                         SERIAL PRIMARY KEY,
  order_id                   INT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  seller_id                  INT NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  -- Snapshot del % al momento de la venta (por si el vendedor cambia su comisión después)
  commission_percent_snapshot NUMERIC(5,2) NOT NULL,
  commission_amount_usd      NUMERIC(10,2) NOT NULL,
  commission_amount_ars      NUMERIC(12,2) NOT NULL,
  paid_to_seller_at          TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (commission_amount_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_attributions_seller ON order_attributions(seller_id);
CREATE INDEX IF NOT EXISTS idx_attributions_pending ON order_attributions(seller_id) WHERE paid_to_seller_at IS NULL;

-- Log de eventos de pago (creación de preference, notificaciones de webhook, etc.)
CREATE TABLE IF NOT EXISTS payment_events (
  id            SERIAL PRIMARY KEY,
  order_id      INT REFERENCES orders(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,            -- 'preference_created', 'webhook_received', 'payment_approved', etc.
  mp_resource_id TEXT,                    -- payment_id o preference_id según el evento
  payload       JSONB,                    -- cuerpo completo de la notificación
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_order ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_events_mp_resource ON payment_events(mp_resource_id);
