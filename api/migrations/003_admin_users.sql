-- ─────────────────────────────────────────────────────────
-- Ethereal Tours — Admin users (Fase 5)
-- ─────────────────────────────────────────────────────────
-- Mapea usuarios de Supabase Auth (auth.users) a roles internos.
-- El backend verifica el JWT con Supabase, después chequea si el user_id
-- está en esta tabla y activo. Si no, devuelve 403.
--
-- Roles:
--   - super_admin: puede todo, incluido crear/borrar admins
--   - admin: CRUD de productos, ventas, vendedores
--   - operator: solo lectura + cambiar estados de órdenes (futuro)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id          UUID PRIMARY KEY,                  -- == auth.users.id de Supabase
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'operator')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
