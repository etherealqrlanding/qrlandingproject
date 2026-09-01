-- ─────────────────────────────────────────────────────────
-- El traslado ahora es siempre automático (adultos + menores + infantes, sin
-- selección manual) y los infantes SIEMPRE pagan traslado cuando el tier lo
-- tiene con costo (transfer_mode = 'optional') — reusan el mismo
-- transfer_price_usd que un adulto, igual que antes, pero ya no es
-- configurable por tier. La columna queda sin uso.
-- ─────────────────────────────────────────────────────────

ALTER TABLE product_options
  DROP COLUMN IF EXISTS infant_transfer_chargeable;
