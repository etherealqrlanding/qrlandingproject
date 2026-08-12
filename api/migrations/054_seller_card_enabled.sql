-- ─────────────────────────────────────────────────────────
-- Medios de pago configurables por cuenta, a cargo del admin de la plataforma (nunca
-- del vendedor/dueño de la cuenta): "Tarjeta" (Mercado Pago + Pix juntos, un solo
-- interruptor) y "Pago manual" (efectivo, ya existía como sellers.is_permanent pese al
-- nombre histórico -- ver comentario en repos/sellers.ts). Nunca pueden quedar los dos
-- apagados a la vez: el checkout de esa cuenta se quedaría sin ninguna forma de pagar.
-- ─────────────────────────────────────────────────────────

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS card_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sellers ADD CONSTRAINT chk_sellers_payment_method_active
  CHECK (is_permanent OR card_enabled);
