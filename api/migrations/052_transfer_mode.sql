-- ─────────────────────────────────────────────────────────
-- Reemplaza el booleano has_transfer (solo distinguía "tiene traslado con costo" vs
-- "no tiene") por un modo de 3 estados por tier, mutuamente excluyentes:
--   - none:     no hay traslado — no se muestra en ningún lado.
--   - optional: traslado con costo — el cliente elige sumarlo (transfer_price_usd).
--   - included: traslado ya incluido en el precio del servicio — sin costo extra,
--               pero se muestra igual como "Traslado incluido".
-- Backfill: los tiers que ya tenían has_transfer = TRUE quedan en 'optional' (mismo
-- comportamiento de siempre — cobraban transfer_price_usd). Nadie queda en 'included'
-- automáticamente: el admin lo marca a mano tier por tier donde corresponda.
-- ─────────────────────────────────────────────────────────

ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS transfer_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (transfer_mode IN ('none', 'optional', 'included'));

UPDATE product_options SET transfer_mode = 'optional' WHERE has_transfer = TRUE;

ALTER TABLE product_options DROP COLUMN IF EXISTS has_transfer;
