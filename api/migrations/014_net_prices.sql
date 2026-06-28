-- ─────────────────────────────────────────────────────────
-- Ethereal Tours — Precios netos y comisión por diferencia
-- ─────────────────────────────────────────────────────────
-- Agrega:
--   - product_options: net_price_adult_usd, net_price_child_usd, net_transfer_price_usd
--     El precio neto es el monto mínimo que el operador debe recibir por servicio.
--   - settings: mp_fee_pct (porcentaje que cobra MP sobre el total bruto, default 10%)
--   - order_attributions: net_total_usd_snapshot, mp_fee_pct_snapshot
--     Congelan los valores usados al calcular la comisión.
--     commission_percent_snapshot pasa a nullable (modelo anterior por %, no se usa para nuevas órdenes).
-- ─────────────────────────────────────────────────────────

-- Precios netos por opción (por pax)
ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS net_price_adult_usd   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_price_child_usd   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_transfer_price_usd NUMERIC(10,2);

-- Porcentaje de comisión de Mercado Pago (configurable desde admin)
INSERT INTO settings (key, value, description, updated_at)
VALUES (
  'mp_fee_pct',
  '{"pct": 10}',
  'Porcentaje de comisión que cobra Mercado Pago sobre el total de la operación (default 10%). Se descuenta del bruto antes de calcular la comisión del vendedor.',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Snapshots de la nueva lógica de comisión en order_attributions
ALTER TABLE order_attributions
  ADD COLUMN IF NOT EXISTS net_total_usd_snapshot NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mp_fee_pct_snapshot     NUMERIC(5,2);

-- commission_percent_snapshot pasa a nullable (usado solo por órdenes del modelo anterior)
ALTER TABLE order_attributions
  ALTER COLUMN commission_percent_snapshot DROP NOT NULL;
