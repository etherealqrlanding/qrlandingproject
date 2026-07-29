-- Ubicación corta (barrio, ej: "Barracas") para el pin sobre la imagen de la card,
-- y frase destacada editable por el admin (ej: "Catedral del Tango") que se muestra
-- arriba del título en la card del listado público (home y shows).
ALTER TABLE products ADD COLUMN IF NOT EXISTS neighborhood_es TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS neighborhood_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tagline_es TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tagline_en TEXT;
