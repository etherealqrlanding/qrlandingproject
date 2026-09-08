-- ─────────────────────────────────────────────────────────
-- Igual que transfer_price_usd_palermo (ver 066) pero para el NETO: algunas casas
-- también le pagan distinto al operador según la zona del hotel del pasajero
-- (Palermo vs. el resto). Campo opcional que se suma a net_transfer_price_usd /
-- net_transfer_price_ars (que siguen siendo el neto para el resto de las zonas)
-- en vez de reemplazarlos.
--
-- NULL = la casa no distingue neto por zona, se usa siempre el neto general
-- (comportamiento actual, sin cambios).
-- ─────────────────────────────────────────────────────────

ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS net_transfer_price_usd_palermo NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS net_transfer_price_ars_palermo NUMERIC(12,2);
