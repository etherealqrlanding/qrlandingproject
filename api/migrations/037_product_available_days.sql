-- Días de operación de TODA la casa (1=Lun, 7=Dom) — se intersecta con los días
-- propios de cada tier: un día está abierto solo si está en ambos conjuntos.
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_days SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}';
