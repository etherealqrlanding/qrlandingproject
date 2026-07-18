-- Marca cuándo el admin abrió por primera vez el detalle de una orden. NULL = todavía
-- no la vio nadie: el listado de órdenes la muestra con una etiqueta "Nueva".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_viewed_at TIMESTAMPTZ;
