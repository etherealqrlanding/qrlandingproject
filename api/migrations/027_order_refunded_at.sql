-- Trazabilidad de reintegros totales: cuándo se reintegró la orden por completo.
-- Necesario para calcular la retención en la tabla principal antes del auto-archivado.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL;
