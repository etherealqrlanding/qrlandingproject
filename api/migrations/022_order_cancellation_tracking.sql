-- Trazabilidad de cancelaciones: quién canceló, por qué y cuándo.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_by   TEXT         NULL,  -- 'seller' | 'admin'
  ADD COLUMN IF NOT EXISTS cancel_reason  TEXT         NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ  NULL;
