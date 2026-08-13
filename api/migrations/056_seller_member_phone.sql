-- Teléfono de contacto del sub-vendedor (seller_members). Nullable a nivel de base
-- (los miembros ya cargados antes de esto no tienen uno) pero el alta nueva desde
-- el portal del vendedor lo va a exigir siempre — es la forma de poder llamar a
-- alguien puntual del equipo (ej. un conserje) si hace falta.
ALTER TABLE seller_members ADD COLUMN IF NOT EXISTS phone TEXT;
