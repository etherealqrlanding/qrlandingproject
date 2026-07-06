-- ─────────────────────────────────────────────────────────────────────────────
-- Tangos y Milongas Tickets — Modificación de reservas con reintegro parcial
--
-- Cuando un cliente reduce su reserva (menos pasajeros o quita traslado), se le
-- reintegra el delta. La orden se ajusta a la NUEVA composición (total_usd/ars pasan
-- a ser el valor vigente), y estas columnas registran cuánto se le reintegró en total
-- sin perder el histórico: lo pagado originalmente = total actual + refunded_amount.
--
-- Sirve para MP (refund real via API) y para efectivo (devolución en mano registrada).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount_ars NUMERIC(12,2) NOT NULL DEFAULT 0;
