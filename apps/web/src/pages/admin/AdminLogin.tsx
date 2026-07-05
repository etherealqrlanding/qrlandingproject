import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
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
  const { signIn, session, me, loading } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && me) navigate(from, { replace: true });
  }, [session, me, navigate, from]);

  if (loading) return <LoadingScreen label="Verificando acceso..." />;
  if (session && me) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="h-[100dvh] overflow-y-auto flex flex-col items-center bg-ink px-4">
      <div className="w-full max-w-md my-auto py-6">
        <Link to="/" className="flex justify-center mb-3" aria-label="Tangos y Milongas Tickets">
          <Logo className="h-20 w-auto" />
        </Link>
        <p className="text-center text-xs uppercase tracking-[0.3em] text-gold-soft mb-4 sm:mb-8">
          Panel administrativo
        </p>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-4 sm:p-6 space-y-3 sm:space-y-5">
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
        </form>

        <p className="mt-4 text-center text-xs text-cream/40">
          ¿Olvidaste tu contraseña? Contactá al super admin para que la resetee.
        </p>
      </div>
    </div>
  );
}
