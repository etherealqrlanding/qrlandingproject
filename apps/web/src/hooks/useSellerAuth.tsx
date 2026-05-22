import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { sellerApi, SellerApiError, type SellerMe } from '../lib/sellerApi';

type LoadMeStatus = 'ok' | 'auth_error' | 'transient_error';

interface SellerAuthState {
  loading: boolean;
  meLoading: boolean;
  session: Session | null;
  me: SellerMe | null;
  error: string | null;
  hasTransientError: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SellerAuthContext = createContext<SellerAuthState | null>(null);

const ME_REFRESH_INTERVAL_MS = 5 * 60_000;
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60_000;

export function SellerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [meLoading, setMeLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<SellerMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTransientError, setHasTransientError] = useState(false);
  const meRef = useRef<SellerMe | null>(null);

  const loadMe = useCallback(async (s: Session | null): Promise<LoadMeStatus> => {
    if (!s) {
      setMe(null); meRef.current = null;
      setError(null); setHasTransientError(false);
      return 'auth_error';
    }
    setMeLoading(true);
    try {
      const data = await sellerApi.me();
      setMe(data); meRef.current = data;
      setError(null); setHasTransientError(false);
      return 'ok';
    } catch (err) {
      const isAuth = err instanceof SellerApiError && err.isAuthError;
      setError((err as Error).message);
      if (isAuth) {
        setMe(null); meRef.current = null;
        setHasTransientError(false);
        return 'auth_error';
      }
      setHasTransientError(true);
      return 'transient_error';
    } finally {
      setMeLoading(false);
    }
  }, []);

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
      loadMe(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadMe]);

  useEffect(() => {
    const id = window.setInterval(() => {
      supabase.auth.refreshSession().catch(() => {});
    }, TOKEN_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => { loadMe(session); }, ME_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [session, loadMe]);

  useEffect(() => {
    const handleFocus = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
      if (expiresAt - Date.now() < 120_000) {
        await supabase.auth.refreshSession().catch(() => {});
      }
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

  const value = useMemo<SellerAuthState>(
    () => ({ loading, meLoading, session, me, error, hasTransientError, signIn, signOut, refresh }),
    [loading, meLoading, session, me, error, hasTransientError, signIn, signOut, refresh],
  );

  return <SellerAuthContext.Provider value={value}>{children}</SellerAuthContext.Provider>;
}

export function useSellerAuth(): SellerAuthState {
  const ctx = useContext(SellerAuthContext);
  if (!ctx) throw new Error('useSellerAuth must be used inside SellerAuthProvider');
  return ctx;
}
