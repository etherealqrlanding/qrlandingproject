import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Cliente con service_role: bypassea RLS, solo en backend.
// NUNCA exponer este cliente al frontend.
export const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
