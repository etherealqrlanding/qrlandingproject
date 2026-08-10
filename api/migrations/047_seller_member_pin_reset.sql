-- ─────────────────────────────────────────────────────────
-- Reset de PIN por email para sub-vendedores (seller_members). El email es
-- opcional por persona — si no lo cargó, no tiene esta opción disponible (le
-- queda el reset vía PIN de administrador, que ya existía).
-- ─────────────────────────────────────────────────────────

ALTER TABLE seller_members ADD COLUMN IF NOT EXISTS email TEXT;

-- Único por vendedor (no global: dos vendedores distintos pueden tener gente con el
-- mismo email sin problema) — evita ambigüedad al autogestionar el propio registro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_members_seller_email
  ON seller_members(seller_id, LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS seller_member_pin_resets (
  id                SERIAL PRIMARY KEY,
  token             UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  seller_member_id  INT NOT NULL REFERENCES seller_members(id) ON DELETE CASCADE,
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_member_pin_resets_member ON seller_member_pin_resets(seller_member_id);
