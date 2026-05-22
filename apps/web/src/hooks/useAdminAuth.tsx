import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { adminApi, AdminApiError, type AdminMe } from '../lib/adminApi';

type LoadMeStatus = 'ok' | 'auth_error' | 'transient_error';

interface AdminAuthState {
  loading: boolean;
  session: Session | null;
  me: AdminMe | null;
  error: string | null;
  /** True si el último intento de cargar `me` falló por algo NO de auth. `me` queda con el último valor bueno. */
  hasTransientError: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

// Periodos
const ME_REFRESH_INTERVAL_MS = 5 * 60_000;       // re-chequea admin_users cada 5 min
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60_000;   // refresca token cada 30 min (vida total = 60min)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTransientError, setHasTransientError] = useState(false);
  const meRef = useRef<AdminMe | null>(null);

  const loadMe = useCallback(async (s: Session | null): Promise<LoadMeStatus> => {
    if (!s) {
      setMe(null); meRef.current = null;
      setError(null); setHasTransientError(false);
      return 'auth_error';
    }
    try {
      const data = await adminApi.me();
      setMe(data); meRef.current = data;
      setError(null); setHasTransientError(false);
      return 'ok';
    } catch (err) {
      const isAuth = err instanceof AdminApiError && err.isAuthError;
      setError((err as Error).message);

      if (isAuth) {
        // Sólo nulleamos `me` ante errores claros de auth/permisos.
        setMe(null); meRef.current = null;
        setHasTransientError(false);
        return 'auth_error';
      }
      // Transitorio: mantenemos el `me` previo y marcamos bandera para UI.
      setHasTransientError(true);
      return 'transient_error';
    }
  }, []);

  // Inicialización + suscripción a cambios de auth
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadMe(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      // No bloqueamos UI mientras recarga me
      loadMe(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadMe]);

  // Refresh proactivo del token cada 30 min — Supabase auto-refresh puede pausarse
  // si la pestaña está en background, así que reforzamos.
  useEffect(() => {
    const id = window.setInterval(() => {
      supabase.auth.refreshSession().catch(() => { /* silencioso, ya hay retry en requests */ });
    }, TOKEN_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Re-chequeo periódico de admin_users en background (sin loading visible)
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => { loadMe(session); }, ME_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [session, loadMe]);

  // Cuando la pestaña vuelve a foco después de inactividad
  useEffect(() => {
    const handleFocus = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
      if (expiresAt - Date.now() < 120_000) {
        await supabase.auth.refreshSession().catch(() => { /* ignore */ });
      }
      // Si tenemos un transient error pendiente, reintentar
      if (hasTransientError) loadMe(data.session);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [hasTransientError, loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null); meRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    await loadMe(session);
  }, [loadMe, session]);

  const value = useMemo<AdminAuthState>(
    () => ({ loading, session, me, error, hasTransientError, signIn, signOut, refresh }),
    [loading, session, me, error, hasTransientError, signIn, signOut, refresh],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
