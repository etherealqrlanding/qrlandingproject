-- ─────────────────────────────────────────────────────────
-- Completa price_child_usd con un placeholder (50% del precio de adulto) en los
-- tiers que no lo tenían cargado, para que el selector de "Menores" no aparezca
-- de forma inconsistente entre tiers de una misma casa (rompía la visual).
--
-- VALORES FAKE: son un placeholder, no precios reales de cada casa. Hay que
-- revisarlos y ajustarlos desde el admin antes de cobrarle a un cliente real.
-- Idempotente: solo toca filas con price_child_usd NULL.
-- ─────────────────────────────────────────────────────────

UPDATE product_options
   SET price_child_usd = ROUND(price_adult_usd * 0.5, 2)
 WHERE price_child_usd IS NULL;
