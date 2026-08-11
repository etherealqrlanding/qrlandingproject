-- ─────────────────────────────────────────────────────────
-- Interruptor maestro de "Mi equipo" (sub-vendedores) por cuenta: solo nosotros lo
-- prendemos/apagamos desde el admin. Apagado, se oculta "Mi Equipo" del portal y se
-- bloquean sus rutas — pero NO se borra nada (sub-vendedores, PIN de admin, historial
-- quedan intactos por si se vuelve a habilitar). Mientras está apagado, las acciones
-- sobre órdenes tampoco piden PIN de sub-vendedor (vuelve a comportarse como un
-- vendedor individual) — ver sellerHasActiveMembers.
-- ─────────────────────────────────────────────────────────

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS team_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: cuentas que ya venían usando el equipo (tienen PIN de administrador
-- configurado) quedan habilitadas para no cortarles la función de un día para el otro.
UPDATE sellers SET team_enabled = TRUE WHERE admin_pin_hash IS NOT NULL AND team_enabled = FALSE;
