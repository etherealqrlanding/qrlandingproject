-- ─────────────────────────────────────────────────────────
-- Reset de PIN por email para el PIN de administrador del vendedor (distinto del
-- reset por email de cada seller_member, ver 047). Solo funciona si ya cargó un
-- email en admin_pin_email (ver 049) — si no, sigue sin haber recuperación
-- self-service y hay que resolverlo desde el panel interno (super_admin).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seller_admin_pin_resets (
  id          SERIAL PRIMARY KEY,
  token       UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  seller_id   INT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_admin_pin_resets_seller ON seller_admin_pin_resets(seller_id);
