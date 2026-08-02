-- Se saca el concepto de "menú general de la casa": cada menú es siempre
-- propio de un servicio (option_id), determinado por el flag has_dinner de
-- ese tier, no por su nombre. Limpieza de seguridad por si quedó alguna fila
-- general de pruebas, y luego option_id pasa a ser obligatorio.
DELETE FROM product_menus WHERE option_id IS NULL;

ALTER TABLE product_menus ALTER COLUMN option_id SET NOT NULL;

DROP INDEX IF EXISTS idx_product_menus_general;
DROP INDEX IF EXISTS idx_product_menus_option;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_menus_option ON product_menus(option_id);
