import { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { supabase } from '../../lib/supabase';
import { sellerApi } from '../../lib/sellerApi';

// El cliente Supabase tiene detectSessionInUrl: false (para no interferir con el admin).
// Cuando llegamos vía link de invite/recovery, necesitamos establecer la sesión manualmente
// parseando los tokens del hash de la URL.

function parseHashTokens(): { accessToken: string; refreshToken: string; type: string } | null {
  const hash = globalThis.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type') ?? '';
  if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) {
    return { accessToken, refreshToken, type };
  }
  return null;
}

export default function SellerLogin() {
  const { signIn, session, me, loading, meLoading, hasTransientError } = useSellerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/seller';

  const [hashTokens] = useState(parseHashTokens);
  const [mode, setMode] = useState<'login' | 'set-password' | 'forgot-password'>(hashTokens ? 'set-password' : 'login');
  const [sessionEstablishing, setSessionEstablishing] = useState(Boolean(hashTokens));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Cuando hay tokens en el hash, establecemos la sesión manualmente
  // (el cliente tiene detectSessionInUrl: false).
  useEffect(() => {
    if (!hashTokens) return;
    supabase.auth
      .setSession({ access_token: hashTokens.accessToken, refresh_token: hashTokens.refreshToken })
      .then(({ error: err }) => {
        if (err) setError('El link ya no es válido o expiró. Pedile al administrador que te reenvíe el acceso.');
      })
      .finally(() => setSessionEstablishing(false));
  // Solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect al portal solo en modo login
  useEffect(() => {
    if (mode !== 'login') return;
    if (session && me) navigate(from, { replace: true });
  }, [session, me, navigate, from, mode]);

  // Sesión válida pero API rechazó con 403 → cuenta inactiva o no vinculada
  useEffect(() => {
    if (mode !== 'login') return;
    if (session && !me && !loading && !meLoading && !hasTransientError) {
      setError('Tu acceso no está habilitado actualmente. Si alguna vez tuviste una cuenta activa, contactá al administrador.');
    }
  }, [session, me, loading, meLoading, hasTransientError, mode]);

  // ── Olvidé mi contraseña ─────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sellerApi.forgotPassword(email.trim().toLowerCase());
      setSuccess('Si tu email está registrado, recibirás un link para restablecer tu contraseña en los próximos minutos.');
    } catch {
      // Respuesta genérica para no revelar si el email existe
      setSuccess('Si tu email está registrado, recibirás un link para restablecer tu contraseña en los próximos minutos.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || sessionEstablishing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <p className="text-sm text-cream/50">Verificando acceso...</p>
      </div>
    );
  }

  if (mode === 'login' && session && me) return <Navigate to={from} replace />;

  // ── Crear / resetear contraseña ──────────────────────────
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!session) {
      setError('El link ya no es válido o expiró. Pedile al administrador que te reenvíe el acceso.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setSuccess('¡Contraseña creada! Ingresando al portal...');
      setTimeout(() => navigate('/seller', { replace: true }), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Login normal ─────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const isInvite = hashTokens?.type === 'invite';
  const submitLabel = isInvite ? 'Crear contraseña e ingresar' : 'Guardar contraseña';

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-6">
      <div className="w-full max-w-md">
        <p className="block text-center font-display text-3xl text-gold mb-2">
          Ethereal Tours
        </p>
        <p className="text-center text-xs uppercase tracking-[0.3em] text-gold-soft mb-10">
          Portal de vendedores
        </p>

        {/* ── Crear / resetear contraseña ── */}
        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-7 space-y-5">
            <div>
              <h1 className="font-display text-2xl text-cream">
                {isInvite ? 'Crear tu contraseña' : 'Nueva contraseña'}
              </h1>
              <p className="mt-1 text-sm text-cream/50">
                {isInvite
                  ? 'Bienvenido a Ethereal Tours. Elegí una contraseña para acceder al portal cuando quieras.'
                  : 'Ingresá y confirmá tu nueva contraseña.'}
              </p>
            </div>

            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Contraseña</span>
              <input
                type="password" required autoFocus autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Mínimo 8 caracteres"
              />
            </label>

            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Confirmar contraseña</span>
              <input
                type="password" required autoComplete="new-password"
                value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                className="input"
              />
            </label>

            {error && (
              <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-800/40 bg-emerald-900/20 p-3 text-sm text-emerald-400">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || Boolean(success)}
              className="btn-primary w-full disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : submitLabel}
            </button>
          </form>
        )}

        {/* ── Login normal ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-7 space-y-5">
            <h1 className="font-display text-2xl text-cream">Iniciar sesión</h1>

            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Email</span>
              <input
                type="email" required autoFocus autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </label>

            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Contraseña</span>
              <input
                type="password" required minLength={6} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </label>

            {error && (
              <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting ? 'Ingresando...' : 'Ingresar'}
            </button>

            <button
              type="button"
              onClick={() => { setError(null); setSuccess(null); setMode('forgot-password'); }}
              className="block w-full text-center text-xs text-cream/40 hover:text-cream/70 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        {/* ── Olvidé mi contraseña ── */}
        {mode === 'forgot-password' && (
          <form onSubmit={handleForgotPassword} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-7 space-y-5">
            <div>
              <h1 className="font-display text-2xl text-cream">Restablecer contraseña</h1>
              <p className="mt-1 text-sm text-cream/50">
                Ingresá tu email y te enviamos un link para crear una nueva contraseña.
              </p>
            </div>

            {!success && (
              <label className="block">
                <span className="block text-sm text-cream/80 mb-1.5">Email</span>
                <input
                  type="email" required autoFocus autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input"
                />
              </label>
            )}

            {success && (
              <div className="rounded-md border border-emerald-800/40 bg-emerald-900/20 p-3 text-sm text-emerald-400">
                {success}
              </div>
            )}

            {!success && (
              <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
                {submitting ? 'Enviando...' : 'Enviar link de acceso'}
              </button>
            )}

            <button
              type="button"
              onClick={() => { setError(null); setSuccess(null); setEmail(''); setMode('login'); }}
              className="block w-full text-center text-xs text-cream/40 hover:text-cream/70 transition-colors"
            >
              ← Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
