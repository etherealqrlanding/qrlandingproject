-- Logo de la casa — reemplaza la foto de portada en las cards del catálogo público y
-- en el listado del admin (independiente de la galería de fotos en product_images).
ALTER TABLE products ADD COLUMN IF NOT EXISTS logo_url TEXT;
