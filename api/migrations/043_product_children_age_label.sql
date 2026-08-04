-- Texto libre para informar el rango de edad de menores de la casa (ej. "3 a 10 años").
-- Solo tiene sentido cuando accepts_children = true; el precio sigue siendo por tier.
ALTER TABLE products ADD COLUMN IF NOT EXISTS children_age_label TEXT;
