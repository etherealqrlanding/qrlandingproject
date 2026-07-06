-- ─────────────────────────────────────────────────────────────────────────────
-- Tangos y Milongas Tickets — Links de pago persistidos + ampliaciones en efectivo
--
--  • mp_init_point: guardamos el link de pago de MP en la orden y en el addon, para
--    que el vendedor pueda re-compartirlo mientras la reserva/ampliación siga pendiente.
--  • order_addons.payment_method: los addons ahora también pueden ser en EFECTIVO
--    (ampliación pendiente de cobro). Reservan cupo y se confirman como el cobro original.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_init_point TEXT;

ALTER TABLE order_addons
  ADD COLUMN IF NOT EXISTS mp_init_point  TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'mercadopago';

-- Reemplazamos el CHECK de status por si acaso no afecta; el de payment_method sí.
DO $$ BEGIN
  ALTER TABLE order_addons ADD CONSTRAINT order_addons_payment_method_chk
    CHECK (payment_method IN ('mercadopago', 'cash'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
