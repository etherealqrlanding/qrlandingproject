-- ─────────────────────────────────────────────────────────────────────────────
-- Ethereal Tours — Modelo de comisión v2 (simplificado)
--
--   • Efectivo (pago manual): comisión del vendedor = total_venta − neto.
--       El vendedor cobra el total, se queda con (total − neto) y NOS LIQUIDA el neto.
--       Marca de liquidación: order_attributions.net_settled_at.
--
--   • Mercado Pago: comisión del vendedor = commission_percent% × total_venta.
--       Nosotros cobramos por MP y LE LIQUIDAMOS esa comisión al vendedor.
--       Marca de liquidación: order_attributions.paid_to_seller_at (ya existía).
--
--   • Se elimina el concepto de "fee de Mercado Pago" (mp_fee_pct): ya no se descuenta
--     nada de costos financieros al calcular la comisión.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ya no usamos el porcentaje de fee de Mercado Pago.
DELETE FROM settings WHERE key = 'mp_fee_pct';

-- Marca de cuándo el vendedor nos liquidó el neto (solo aplica a ventas en efectivo).
-- NULL = pendiente de que el vendedor nos rinda el neto.
ALTER TABLE order_attributions
  ADD COLUMN IF NOT EXISTS net_settled_at TIMESTAMPTZ;

-- Nota: la columna mp_fee_pct_snapshot queda obsoleta (se conserva por compatibilidad
-- histórica de órdenes viejas, pero ya no se escribe ni se lee).
