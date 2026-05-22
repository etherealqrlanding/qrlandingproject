-- Umbral configurable por tier para mostrar "bajos cupos"
-- low_availability_threshold: cuando remaining <= este valor → status 'low'
-- show_remaining_count: si TRUE, el API público expone el número exacto restante

ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS low_availability_threshold integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS show_remaining_count boolean NOT NULL DEFAULT false;
