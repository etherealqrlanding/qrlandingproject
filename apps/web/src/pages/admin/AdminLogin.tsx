import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../lib/adminApi';
import { parseAuthHashTokens } from '../../lib/authHashTokens';
import Spinner, { LoadingScreen } from '../../components/Spinner';
import Logo from '../../components/Logo';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminLogin() {
  const { signIn, session, me, loading, hasTransientError } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/admin';

  const [hashTokens] = useState(parseAuthHashTokens);
  const [mode, setMode] = useState<'login' | 'set-password' | 'forgot-password'>(hashTokens ? 'set-password' : 'login');
  const [sessionEstablishing, setSessionEstablishing] = useState(Boolean(hashTokens));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Cuando hay tokens en el hash (link de invite/recovery), establecemos la sesión
  // manualmente — el cliente Supabase tiene detectSessionInUrl: false.
  useEffect(() => {
    if (!hashTokens) return;
    supabase.auth
      .setSession({ access_token: hashTokens.accessToken, refresh_token: hashTokens.refreshToken })
      .then(({ error: err }) => {
        if (err) setError('El link ya no es válido o expiró. Pedile al super admin que te lo reenvíe.');
      })
      .finally(() => setSessionEstablishing(false));
  // Solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'login') return;
    if (session && me) navigate(from, { replace: true });
  }, [session, me, navigate, from, mode]);

  // Cubre el caso de llegar a esta pantalla con una sesión vieja ya inválida (ej. cuenta
  // desactivada mientras el navegador todavía tenía la sesión guardada). Se ignora mientras
  // hay un submit en curso: ese caso ya lo maneja directamente el catch de handleLogin,
  // con el mismo mensaje, sin la carrera de un efecto separado reaccionando a medio camino.
  useEffect(() => {
    if (mode !== 'login' || submitting) return;
    if (session && !me && !loading && !hasTransientError) {
      setError('Tu acceso no está habilitado actualmente. Contactá al super admin.');
    }
  }, [session, me, loading, hasTransientError, mode, submitting]);

  if (loading || sessionEstablishing) return <LoadingScreen label="Verificando acceso..." />;
  if (mode === 'login' && session && me) return <Navigate to={from} replace />;

  // ── Crear / resetear contraseña (viene de un link de invite/recovery) ──
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!session) {
      setError('El link ya no es válido o expiró. Pedile al super admin que te lo reenvíe.');
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
      setSuccess('¡Contraseña actualizada! Ingresando al panel...');
      setTimeout(() => navigate(from, { replace: true }), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // refuerzo además de disabled={submitting} en el botón
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

  // ── Olvidé mi contraseña ─────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminApi.forgotPassword(email.trim().toLowerCase());
      setSuccess('Si tu email está registrado, recibirás un link para restablecer tu contraseña en los próximos minutos.');
    } catch {
      // Respuesta genérica para no revelar si el email existe
      setSuccess('Si tu email está registrado, recibirás un link para restablecer tu contraseña en los próximos minutos.');
    } finally {
      setSubmitting(false);
    }
  };

  const isInvite = hashTokens?.type === 'invite';

  return (
    <div className="h-[100dvh] overflow-y-auto flex flex-col items-center bg-ink px-4">
      <div className="w-full max-w-md my-auto py-6">
        <Link to="/" className="flex justify-center mb-3" aria-label="Tangos y Milongas Tickets">
          <Logo className="h-20 w-auto" />
        </Link>
        <p className="text-center text-xs uppercase tracking-[0.3em] text-gold-soft mb-4 sm:mb-8">
          Panel administrativo
        </p>

        {/* ── Crear / resetear contraseña ── */}
        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-4 sm:p-6 space-y-3 sm:space-y-5">
            <div>
              <h1 className="font-display text-2xl text-cream">
                {isInvite ? 'Crear tu contraseña' : 'Nueva contraseña'}
              </h1>
              <p className="mt-1 text-sm text-cream/50">
                {isInvite
                  ? 'Elegí una contraseña para acceder al panel cuando quieras.'
                  : 'Ingresá y confirmá tu nueva contraseña.'}
              </p>
            </div>

            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Contraseña</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required autoFocus autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-cream/40 hover:text-cream/70 transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Confirmar contraseña</span>
              <div className="relative">
                <input
                  type={showPasswordConfirm ? 'text' : 'password'}
                  required autoComplete="new-password"
                  value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="input pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPasswordConfirm((v) => !v)}
                  aria-label={showPasswordConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-cream/40 hover:text-cream/70 transition-colors"
                >
                  {showPasswordConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
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
              {submitting ? <><Spinner size="sm" className="mr-2" />Guardando...</> : (isInvite ? 'Crear contraseña e ingresar' : 'Guardar contraseña')}
            </button>
          </form>
        )}

        {/* ── Login normal ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-4 sm:p-6 space-y-3 sm:space-y-5">
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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required minLength={6} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-cream/40 hover:text-cream/70 transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting ? <><Spinner size="sm" className="mr-2" />Ingresando...</> : 'Ingresar'}
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
          <form onSubmit={handleForgotPassword} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-4 sm:p-6 space-y-3 sm:space-y-5">
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
                {submitting ? <><Spinner size="sm" className="mr-2" />Enviando...</> : 'Enviar link de acceso'}
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
