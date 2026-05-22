-- Precio del traslado por persona (adultos + menores) en cada opción
ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS transfer_price_usd NUMERIC(10,2) NOT NULL DEFAULT 0;
