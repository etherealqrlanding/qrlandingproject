-- ─────────────────────────────────────────────────────────────────────────────
-- Ethereal Tours — Estado "Caducada" (expired)
--
-- Las reservas en efectivo creadas por un vendedor quedan en estado 'pending' hasta
-- que el vendedor confirma el cobro. Si no lo confirma dentro de las 24 hs de creada,
-- la operación se caduca automáticamente y pasa a estado 'expired' (etiqueta: "Caducada").
--
-- Solo aplica a pagos en efectivo (vendedores permanentes). Las órdenes de Mercado Pago
-- no caducan por esta regla.
-- ─────────────────────────────────────────────────────────────────────────────

-- PostgreSQL 12+ permite ADD VALUE dentro de una transacción siempre que el valor
-- no se use en la misma transacción (acá solo lo agregamos).
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'expired';
