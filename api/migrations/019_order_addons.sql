-- ─────────────────────────────────────────────────────────────────────────────
-- Tangos y Milongas Tickets — Agregados con link incremental de Mercado Pago
--
-- Cuando una reserva pagada por MP quiere SUMAR pasajeros, no se puede "sumar" al
-- pago original (está cerrado). Se genera un cobro NUEVO solo por la diferencia:
-- un "addon" con su propio link de MP. Mientras está pendiente reserva el cupo
-- (la disponibilidad lo cuenta); cuando el pago se aprueba, se fusiona en la orden
-- (sube pax/total, recalcula comisión) y el addon queda 'paid'. Si no se paga, caduca.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_addons (
  id                 SERIAL PRIMARY KEY,
  public_id          UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,  -- external_reference del pago
  order_id           INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | expired | cancelled
  -- Para el chequeo/reserva de cupo mientras está pendiente
  option_id          INT NOT NULL REFERENCES product_options(id) ON DELETE RESTRICT,
  service_date       DATE NOT NULL,
  extra_adults       INT NOT NULL DEFAULT 0,
  extra_children     INT NOT NULL DEFAULT 0,
  -- Montos del delta (congelados al generar el link)
  charge_usd         NUMERIC(10,2) NOT NULL,
  charge_ars         NUMERIC(12,2) NOT NULL,
  new_subtotal_usd   NUMERIC(10,2) NOT NULL,
  new_total_ars      NUMERIC(12,2) NOT NULL,
  exchange_rate_used NUMERIC(10,4) NOT NULL,
  -- Mercado Pago
  mp_preference_id   TEXT,
  mp_payment_id      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ,
  CHECK (status IN ('pending','paid','expired','cancelled')),
  CHECK (extra_adults >= 0 AND extra_children >= 0),
  CHECK (charge_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_addons_order ON order_addons(order_id);
-- Para sumar rápido el cupo reservado por addons pendientes de una opción+fecha.
CREATE INDEX IF NOT EXISTS idx_addons_pending_slot
  ON order_addons(option_id, service_date) WHERE status = 'pending';
