-- Agrega columna payment_method a orders para distinguir pagos MP vs efectivo al vendedor
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'mercadopago';

-- Índice para filtrar por método de pago
CREATE INDEX IF NOT EXISTS orders_payment_method_idx ON orders (payment_method);
