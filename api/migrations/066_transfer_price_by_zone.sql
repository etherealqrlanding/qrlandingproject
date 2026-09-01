-- ─────────────────────────────────────────────────────────
-- Algunas casas cobran distinto el traslado según la zona del hotel del
-- pasajero (Palermo vs. el resto -- Centro, Recoleta, Puerto Madero, San
-- Telmo, Retiro). No todas las casas hacen esta distinción: por eso es un
-- campo opcional que se suma a transfer_price_usd (que sigue siendo el precio
-- para todo el resto de las zonas) en vez de reemplazarlo.
--
-- NULL = la casa no distingue por zona, transfer_price_usd aplica siempre
-- (comportamiento actual, sin cambios).
-- ─────────────────────────────────────────────────────────

ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS transfer_price_usd_palermo NUMERIC(10,2);
