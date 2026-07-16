-- Cuenta propia de la agencia: un vendedor que representa ventas directas del negocio
-- (Instagram, WhatsApp, mostrador), no un afiliado externo. Se usa normalmente con
-- commission_percent = 0. Se excluye de los agregados de revenue/comisión del listado
-- de vendedores para no mezclar ventas propias con las de afiliados reales.
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_house BOOLEAN NOT NULL DEFAULT false;
