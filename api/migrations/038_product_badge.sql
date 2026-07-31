-- Etiqueta corta y reutilizable para destacar una casa en su card del listado
-- público (ej. "¡Últimos lugares!", "Recomendado"). NULL/vacío = no se muestra nada.
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_es TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_en TEXT;
