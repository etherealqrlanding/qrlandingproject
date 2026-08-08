-- ─────────────────────────────────────────────────────────
-- Sub-vendedores dentro de una cuenta de vendedor (ej. conserjes de un hotel).
-- No son un login aparte: comparten el código/QR y la sesión del vendedor padre.
-- Solo sirven para "firmar" con un PIN corto quién de adentro del equipo cerró una
-- venta puntual — trazabilidad interna, no cambia comisión ni liquidación.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seller_members (
  id          SERIAL PRIMARY KEY,
  seller_id   INT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seller_id, name)
);

CREATE INDEX IF NOT EXISTS idx_seller_members_seller ON seller_members(seller_id) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_seller_members_updated_at ON seller_members;
CREATE TRIGGER trg_seller_members_updated_at
  BEFORE UPDATE ON seller_members
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE order_attributions
  ADD COLUMN IF NOT EXISTS seller_member_id INT REFERENCES seller_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attributions_member ON order_attributions(seller_member_id) WHERE seller_member_id IS NOT NULL;
