-- ─────────────────────────────────────────────────────────
-- Reclamo de atribución: un sub-vendedor puede pedir que se le sume una venta que no
-- tuvo touchpoint humano (ej. Mercado Pago/Pix pagado solo desde la habitación) usando
-- SOLO su propio PIN. Eso no la asigna todavía -- el administrador del vendedor tiene
-- que aprobarla con su propio PIN de administrador antes de que quede escrita en
-- order_attributions. Evita que cualquiera se autoatribuya una venta ajena sin que
-- nadie la valide, y a la vez saca al administrador de tener que salir a investigar
-- quién vendió qué: solo revisa una lista corta de reclamos pendientes.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_attribution_requests (
  id                SERIAL PRIMARY KEY,
  order_id          INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_member_id  INT NOT NULL REFERENCES seller_members(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- Solo un reclamo pendiente por orden a la vez -- si otro intenta reclamarla mientras
-- hay uno sin resolver, se le avisa en vez de acumular reclamos duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_requests_pending_order
  ON order_attribution_requests(order_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_attribution_requests_member ON order_attribution_requests(seller_member_id);
