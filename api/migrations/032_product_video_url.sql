-- Link de YouTube del video de cada casa/producto, mostrado en el detalle público.
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;
