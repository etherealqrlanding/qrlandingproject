-- Ajuste general de comisión DEL TIER/SERVICIO (+, -, 0) -- distintos servicios de la
-- misma casa pueden tener márgenes distintos. Se suma a la base del perfil del
-- vendedor salvo que exista un override puntual para ese (tier, kind).
ALTER TABLE product_options
  ADD COLUMN IF NOT EXISTS commission_adjustment_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Override puntual: REEMPLAZA (no suma) el ajuste general del tier, solo para ese
-- perfil de vendedor puntual. Los demás perfiles de ese mismo tier siguen usando
-- product_options.commission_adjustment_percent.
CREATE TABLE IF NOT EXISTS option_kind_commission_adjustments (
  id                 SERIAL PRIMARY KEY,
  option_id          INT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  seller_kind        TEXT NOT NULL, -- valores de SELLER_KINDS.value, o 'sin_especificar'
  adjustment_percent NUMERIC(5,2) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (option_id, seller_kind)
);

-- Comisión base por perfil de vendedor -- una fila de `settings` (mismo patrón que
-- exchange_rate_usd_ars / modify_window), JSON { "recepcion": 12.5, ..., "sin_especificar": 10 }.
-- Semilla DATA-INFORMADA: promedio de commission_percent entre vendedores activos y
-- NO-house de ese perfil (excluye cuentas internas como ADMINPREVIEW, que no son
-- representativas); 10.00 si ese perfil todavía no tiene ningún vendedor cargado.
-- "sin_especificar" arranca fijo en 10.00 -- no se promedia contra vendedores con
-- kind NULL porque ese grupo puede incluir cuentas internas is_house.
INSERT INTO settings (key, value, description)
SELECT 'seller_kind_base_commission',
       jsonb_object_agg(k.value, COALESCE(avgs.avg_commission, 10.00)),
       'Comisión base (%) por perfil de vendedor. Se combina con el ajuste de comisión del producto (o su override puntual) para calcular la comisión final de cada venta.'
FROM (VALUES ('recepcion'),('choferes'),('guias'),('agencias'),('freelance'),('comercios'),('sin_especificar')) AS k(value)
LEFT JOIN LATERAL (
  SELECT ROUND(AVG(s.commission_percent), 2) AS avg_commission
  FROM sellers s
  WHERE s.is_active = TRUE AND s.is_house = FALSE AND s.kind = k.value AND k.value <> 'sin_especificar'
) avgs ON TRUE
ON CONFLICT (key) DO NOTHING;
