-- Distingue vendedores permanentes (pueden cobrar en efectivo) de ocasionales
ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false;
