-- Botón flotante de WhatsApp en el portal del vendedor, para contactar al equipo de
-- Tango QR rápido -- el admin lo habilita solo para recomendadores más estables/de
-- confianza. Default false: los recomendadores ocasionales no lo ven hasta que se
-- active a mano.
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS whatsapp_button_enabled BOOLEAN NOT NULL DEFAULT FALSE;
