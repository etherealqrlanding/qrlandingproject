-- Horario límite para reservas del mismo día, por producto (show).
-- Si es NULL, no se aplica restricción de horario.
-- Comparar contra hora de Buenos Aires (ART = UTC-3).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS same_day_cutoff_time TIME;
