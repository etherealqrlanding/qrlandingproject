-- ─────────────────────────────────────────────────────────
-- Reemplaza transfer_requested (booleano "todos los pasajeros o ninguno") por
-- transfer_qty (cuántos de los pasajeros del ítem van con traslado, 0..adults+children).
-- Permite traslado parcial: no todos los pasajeros de una reserva tienen por qué
-- necesitarlo (ej. algunos ya tienen transporte propio).
--
-- transfer_requested se deja sin usar (no se dropea todavía) para tener una ventana
-- de rollback barata mientras se termina de migrar el código que lee/escribe esta
-- columna. El DROP y el CHECK de rango van en una migración de cleanup posterior,
-- una vez confirmado que todo el código nuevo escribe transfer_qty correctamente.
-- ─────────────────────────────────────────────────────────

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS transfer_qty INT NOT NULL DEFAULT 0;

UPDATE order_items SET transfer_qty = adults + children WHERE transfer_requested = TRUE;
