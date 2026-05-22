-- Campos de traslado en la orden (por ítem, ya que el traslado aplica al servicio)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS transfer_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_hotel TEXT;
