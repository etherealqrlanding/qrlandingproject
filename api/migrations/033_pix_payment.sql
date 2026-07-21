-- ─────────────────────────────────────────────────────────
-- PIX (Nautt Finance): cobro en reales como tercer medio de pago (junto a MP y efectivo).
-- Guardamos la orden Nautt y los datos del QR PIX en la orden interna. El mapeo del
-- webhook se hace por nautt_order_uuid (Nautt no acepta external_reference propio).
--   • payment_method suma el valor 'pix' (la columna es VARCHAR libre, sin CHECK).
-- ─────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS nautt_order_uuid    TEXT,
  ADD COLUMN IF NOT EXISTS pix_qrcode          TEXT,
  ADD COLUMN IF NOT EXISTS pix_expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_fiat_amount_brl NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_orders_nautt_order ON orders(nautt_order_uuid) WHERE nautt_order_uuid IS NOT NULL;
