-- Simplifica el menú: en vez de cursos/platos estructurados y bilingües, un
-- título + un bloque de texto enriquecido (HTML con negrita/subrayado/listas)
-- en un solo idioma (el original del sitio) — la carga es mucho más simple
-- para el admin (copiar/pegar desde un PDF y formatear un poco).
ALTER TABLE product_menus ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE product_menus ADD COLUMN IF NOT EXISTS content_html TEXT NOT NULL DEFAULT '';
ALTER TABLE product_menus DROP COLUMN IF EXISTS title_es;
ALTER TABLE product_menus DROP COLUMN IF EXISTS title_en;
ALTER TABLE product_menus DROP COLUMN IF EXISTS note_es;
ALTER TABLE product_menus DROP COLUMN IF EXISTS note_en;

DROP TABLE IF EXISTS product_menu_items;
DROP TABLE IF EXISTS product_menu_courses;
