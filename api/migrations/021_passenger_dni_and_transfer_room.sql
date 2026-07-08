-- Feature: DNI del pasajero (guardado en orders)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_dni VARCHAR(40) NULL;

-- Feature: Número de habitación de hotel para traslados (guardado en order_items)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS transfer_room VARCHAR(80) NULL;
