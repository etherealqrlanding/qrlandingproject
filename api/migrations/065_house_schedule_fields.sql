-- ─────────────────────────────────────────────────────────
-- Los horarios de show/cena y de traslado dejan de cargarse por tier (texto
-- libre, duplicado y a veces inconsistente entre tiers de la misma casa) y
-- pasan a configurarse UNA sola vez por casa. Cada tier ahora solo elige, con
-- un check, cuáles de esos horarios de la casa le aplican:
--   - has_dinner (ya existía)        -> usa dinner_show_time_es + dinner_transfer_window_es
--   - show_only_time_enabled (nuevo) -> usa show_only_time_es + show_only_transfer_window_es
-- ─────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS dinner_show_time_es TEXT,
  ADD COLUMN IF NOT EXISTS show_only_time_es TEXT,
  ADD COLUMN IF NOT EXISTS dinner_transfer_window_es TEXT,
  ADD COLUMN IF NOT EXISTS show_only_transfer_window_es TEXT;

ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS show_only_time_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: toma el horario ya cargado en cualquier tier con cena de la casa
-- (deberían ser todos iguales entre sí; si no lo eran, se pierde la variación
-- fina que había por tier, que es justamente lo que este cambio busca evitar)
-- y lo sube a la casa.
UPDATE products p
   SET dinner_show_time_es = sub.dinner_time_es,
       dinner_transfer_window_es = sub.pickup_window_es
  FROM (
    SELECT DISTINCT ON (product_id) product_id, dinner_time_es, pickup_window_es
      FROM product_options
     WHERE has_dinner = TRUE
       AND (COALESCE(dinner_time_es, '') <> '' OR COALESCE(pickup_window_es, '') <> '')
     ORDER BY product_id, id
  ) sub
 WHERE sub.product_id = p.id;

UPDATE products p
   SET show_only_time_es = sub.show_time_es,
       show_only_transfer_window_es = sub.pickup_window_es
  FROM (
    SELECT DISTINCT ON (product_id) product_id, show_time_es, pickup_window_es
      FROM product_options
     WHERE has_dinner = FALSE
       AND (COALESCE(show_time_es, '') <> '' OR COALESCE(pickup_window_es, '') <> '')
     ORDER BY product_id, id
  ) sub
 WHERE sub.product_id = p.id;

-- Los tiers sin cena que ya mostraban un horario de show quedan con el check
-- nuevo activado, para no perder lo que ya se veía en el sitio.
UPDATE product_options
   SET show_only_time_enabled = TRUE
 WHERE has_dinner = FALSE
   AND (COALESCE(show_time_es, '') <> '' OR COALESCE(pickup_window_es, '') <> '');

ALTER TABLE product_options
  DROP COLUMN IF EXISTS pickup_window_es,
  DROP COLUMN IF EXISTS pickup_window_en,
  DROP COLUMN IF EXISTS dinner_time_es,
  DROP COLUMN IF EXISTS dinner_time_en,
  DROP COLUMN IF EXISTS show_time_es,
  DROP COLUMN IF EXISTS show_time_en;
