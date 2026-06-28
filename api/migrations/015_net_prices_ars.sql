-- ─────────────────────────────────────────────────────────────────────────────
-- Ethereal Tours — Soporte de netos en ARS además de USD por opción
-- Cada casa de tango puede tener netos en la moneda que acuerde con el operador.
-- ─────────────────────────────────────────────────────────────────────────────

-- Moneda de los valores netos de esta opción ('USD' o 'ARS')
-- DEFAULT 'USD' para retrocompatibilidad con opciones ya cargadas.
ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS net_price_currency     VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS net_price_adult_ars    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS net_price_child_ars    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS net_transfer_price_ars NUMERIC(12,2);
