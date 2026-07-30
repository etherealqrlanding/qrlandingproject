-- Cupo "congelado" para el checkout público (MP/PIX) mientras el pago está en curso,
-- ANTES de crear la orden. La orden solo se crea (ya 'paid') cuando el pago se
-- confirma — ver createOrderFromHold en repos/orders.ts.
--
-- Liberación de cupo: NO requiere ningún proceso — la disponibilidad
-- (runAvailabilityCheck) filtra expires_at > NOW(), así que un hold vencido deja de
-- contar automáticamente apenas pasa su expiración. La fila física se conserva un
-- rato más (ventana de gracia) para poder reconciliar pagos tardíos, y recién
-- después la purga un barrido de baja frecuencia (services/expireHolds.ts).
CREATE TABLE IF NOT EXISTS checkout_holds (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_method       TEXT NOT NULL CHECK (payment_method IN ('mercadopago', 'pix')),
  option_id            INT NOT NULL REFERENCES product_options(id) ON DELETE RESTRICT,
  service_date         DATE NOT NULL,
  pax                  INT NOT NULL CHECK (pax >= 1),
  expires_at           TIMESTAMPTZ NOT NULL,
  -- Snapshot completo (customer, item, totales, tasa de cambio, ref_code, utm) para
  -- reconstruir la orden al confirmarse el pago, sin recalcular precios/tasa.
  payload              JSONB NOT NULL,
  mp_preference_id     TEXT,
  mp_init_point        TEXT,
  nautt_order_uuid     TEXT,
  pix_qrcode           TEXT,
  pix_fiat_amount_brl  NUMERIC(12,2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SUM de disponibilidad por opción+fecha (solo holds vigentes, filtrado en la query).
CREATE INDEX IF NOT EXISTS idx_holds_option_date_expiry
  ON checkout_holds (option_id, service_date, expires_at);

-- Barrido de holds vencidos (reconciliación + purga).
CREATE INDEX IF NOT EXISTS idx_holds_expires_at ON checkout_holds (expires_at);

-- Mapeo inverso para el webhook de Nautt.
CREATE INDEX IF NOT EXISTS idx_holds_nautt_order
  ON checkout_holds (nautt_order_uuid) WHERE nautt_order_uuid IS NOT NULL;

DROP TRIGGER IF EXISTS trg_checkout_holds_updated_at ON checkout_holds;
CREATE TRIGGER trg_checkout_holds_updated_at
  BEFORE UPDATE ON checkout_holds
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Pago aprobado después de que el hold ya había vencido (dentro de la ventana de
-- gracia, todavía no purgado): la orden se crea igual como 'paid' (el cliente sí
-- pagó), pero queda marcada para que el admin sepa que el cupo no estaba
-- garantizado en el momento del pago (pudo haberse revendido).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS hold_expired_before_payment BOOLEAN NOT NULL DEFAULT FALSE;
