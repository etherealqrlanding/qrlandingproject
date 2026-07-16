-- Marca cuándo una orden archivada fue restaurada, para poder distinguirla en
-- los listados activos y ofrecer un "volver a archivar" directo desde ahí.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ NULL;
