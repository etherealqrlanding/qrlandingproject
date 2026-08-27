-- ─────────────────────────────────────────────────────────
-- Nueva categoría de pasajero: infantes (bebés). Existen siempre, en todos los
-- servicios (a diferencia de menores, que depende de accepts_children a nivel
-- casa). Nunca pagan tarifa de entrada — el ticket del infante siempre es USD 0.
--
-- Pueden generar cargo de traslado, configurable por tier, pero solo tiene
-- sentido en tiers con transfer_mode='optional' (ahí es donde transfer_price_usd
-- tiene un valor real y editable). Cuando aplica, reusa ese mismo precio de
-- adultos — no hay precio de traslado propio para infante.
--
-- infant_transfer_usd se congela como columna propia (no inferido por resta del
-- subtotal, como se hace con transferPortion) para poder prorratear reducciones
-- de infantes de forma independiente y exacta, sin mezclarlo con el prorrateo
-- de transfer_qty de adultos/menores.
-- ─────────────────────────────────────────────────────────

ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS infant_transfer_chargeable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS infants INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infant_transfer_usd NUMERIC(10,2) NOT NULL DEFAULT 0;
