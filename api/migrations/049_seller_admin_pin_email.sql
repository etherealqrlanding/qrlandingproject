-- ─────────────────────────────────────────────────────────
-- Email de contacto del PIN de administrador del vendedor (distinto del email de
-- cada seller_member). Solo para mostrarlo/editarlo dentro de "Mi equipo" — no
-- habilita un flujo de "olvidé mi PIN" por link como el de los sub-vendedores; si
-- se pierde del todo el PIN de admin, se sigue resolviendo desde el panel interno.
-- ─────────────────────────────────────────────────────────

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS admin_pin_email TEXT;
