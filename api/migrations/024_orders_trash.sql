-- Papelera de órdenes: soft-delete con retención configurable.
-- El admin mueve órdenes a la papelera (soft delete); un job o acción manual las
-- borra permanentemente cuando se superan los días de retención configurados.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_admin_id   UUID         NULL,
  ADD COLUMN IF NOT EXISTS seller_trash_hidden   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restore_requested_at  TIMESTAMPTZ  NULL;

CREATE INDEX IF NOT EXISTS idx_orders_deleted_at
  ON orders(deleted_at) WHERE deleted_at IS NOT NULL;

-- Setting de retención (días antes del borrado definitivo, default 30)
INSERT INTO settings (key, value, description)
VALUES (
  'trash_retention_days',
  '30'::jsonb,
  'Días que las órdenes permanecen en la papelera antes de ser eliminadas definitivamente.'
)
ON CONFLICT (key) DO NOTHING;
