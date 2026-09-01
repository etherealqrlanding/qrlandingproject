-- ─────────────────────────────────────────────────────────
-- La comisión del recomendador se calcula sobre el dólar SIN el markup del admin
-- (dolarapi.com "pelado"), aunque al cliente se le siga cobrando con el markup
-- incluido -- el margen que agrega la plataforma sobre el dólar oficial es
-- ganancia propia, no algo que deba repartirse también como comisión.
--
-- Se congela en la orden (igual que exchange_rate_used) para que reducciones y
-- ampliaciones futuras recalculen la comisión con el mismo valor histórico, sin
-- depender de la configuración de markup vigente al momento de la modificación.
--
-- NULL en órdenes existentes: no hay markup histórico que restar (el markup es una
-- feature nueva), así que siguen usando exchange_rate_used como venían haciendo
-- (fallback ya contemplado en el código).
-- ─────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commission_exchange_rate_used NUMERIC(10,4);
