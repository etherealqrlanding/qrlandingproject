-- Vincula cada vendedor con una cuenta de Supabase Auth para el portal self-service.
-- El user_id es nullable: sellers sin portal simplemente no tienen supabase_user_id.
ALTER TABLE sellers
  ADD COLUMN supabase_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_sellers_supabase_user_id ON sellers(supabase_user_id);
