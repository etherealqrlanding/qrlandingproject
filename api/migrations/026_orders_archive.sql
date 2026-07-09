-- Renombrar papelera → archivo (sin borrado permanente)
ALTER TABLE orders RENAME COLUMN deleted_at          TO archived_at;
ALTER TABLE orders RENAME COLUMN deleted_by_admin_id TO archived_by_admin_id;

-- Columnas exclusivas de la lógica de papelera que ya no aplican
ALTER TABLE orders DROP COLUMN IF EXISTS seller_trash_hidden;
ALTER TABLE orders DROP COLUMN IF EXISTS restore_requested_at;

-- Actualizar el índice
DROP INDEX IF EXISTS idx_orders_deleted_at;
CREATE INDEX IF NOT EXISTS idx_orders_archived_at
  ON orders(archived_at)
  WHERE archived_at IS NOT NULL;

-- El setting de retención ya no tiene sentido (no hay borrado permanente)
DELETE FROM settings WHERE key = 'trash_retention_days';
