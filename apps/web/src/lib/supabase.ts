import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // No tira en build, solo runtime warning — la app pública sigue andando sin admin
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — admin features disabled');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'et_admin_session',
  },
});
