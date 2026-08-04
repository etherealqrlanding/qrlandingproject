-- Política de menores a nivel casa (general, la misma para todos sus tiers) — el precio
-- de menor sigue siendo por tier (product_options.price_child_usd), esto es solo el flag
-- de si la casa, en general, admite menores.
ALTER TABLE products ADD COLUMN IF NOT EXISTS accepts_children BOOLEAN NOT NULL DEFAULT false;

-- Backfill: arrancar en true las casas que ya tienen precio de menor cargado en algún
-- tier hoy, para que el flag nazca coherente con los datos reales en vez de en false
-- para todas (lo que obligaría a repasar casa por casa a mano).
UPDATE products p SET accepts_children = true
 WHERE EXISTS (
   SELECT 1 FROM product_options o WHERE o.product_id = p.id AND o.price_child_usd IS NOT NULL
 );
