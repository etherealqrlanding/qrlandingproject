-- ─────────────────────────────────────────────────────────
-- PIN de administrador del vendedor (hotel): separado de los PIN de cada
-- seller_member. Lo carga el equipo (admin) al dar de alta un vendedor con
-- sub-vendedores — sin este PIN nadie puede crear ni editar el equipo del
-- vendedor. Un sub-vendedor solo puede autogestionar SU propio registro con
-- su propio PIN (nunca con este).
-- ─────────────────────────────────────────────────────────

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS admin_pin_hash TEXT;
