-- ─────────────────────────────────────────────────────────
-- Las ampliaciones (order_addons) hasta ahora solo sabían sumar adultos/menores.
-- Se agregan infantes y la posibilidad de activar traslado por primera vez en una
-- ampliación (el traslado ya activo siempre se extiende automático a los pax
-- nuevos, sin necesitar ningún flag -- ver orderIncrease.ts).
-- ─────────────────────────────────────────────────────────

ALTER TABLE order_addons
  ADD COLUMN IF NOT EXISTS extra_infants INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_zone TEXT,
  ADD COLUMN IF NOT EXISTS transfer_hotel TEXT,
  ADD COLUMN IF NOT EXISTS transfer_room TEXT,
  -- Precio por pax congelado al momento de crear la ampliación (solo cuando
  -- add_transfer=TRUE) -- así el cobro real no cambia si el precio de la casa
  -- se actualiza entre que se genera el link/ampliación y se confirma el pago.
  ADD COLUMN IF NOT EXISTS transfer_unit_price_usd NUMERIC(10,2);
