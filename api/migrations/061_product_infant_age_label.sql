-- Rango de edad de infantes (texto libre, ej. "0 a 2 años"), configurable por casa,
-- mismo patrón que children_age_label -- se muestra junto al stepper de infantes en
-- la reserva y en los emails/voucher, para que el pasajero sepa la política antes de
-- cargar la cantidad (los infantes nunca pagan entrada, un error de criterio de edad
-- puede traer problemas en la puerta de la casa).
ALTER TABLE products ADD COLUMN IF NOT EXISTS infant_age_label TEXT;
