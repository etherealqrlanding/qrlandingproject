-- Moneda en la que el vendedor cobró efectivamente al pasajero (ARS o USD). Solo
-- se completa al confirmar el cobro; NULL mientras la orden está pendiente.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cash_collected_currency VARCHAR(3)
  CHECK (cash_collected_currency IN ('ARS', 'USD'));
