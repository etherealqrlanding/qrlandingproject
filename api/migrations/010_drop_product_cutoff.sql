-- Mueve el cutoff de reservas del mismo día de producto individual a setting global.
ALTER TABLE products DROP COLUMN IF EXISTS same_day_cutoff_time;
