-- ─────────────────────────────────────────────────────────
-- Personalización de la landing pública por vendedor (socios comerciales:
-- hoteles, agencias). Lo habilita el admin por vendedor (landing_customization_enabled);
-- una vez habilitado, el propio vendedor carga logo/lema/teléfono desde su portal.
-- Se muestra en la home pública (RefBadge) solo mientras el ref de ese vendedor esté activo.
-- ─────────────────────────────────────────────────────────

ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS landing_customization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS public_phone TEXT;
