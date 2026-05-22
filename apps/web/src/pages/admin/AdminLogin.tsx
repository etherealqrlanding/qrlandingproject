import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function AdminLogin() {
  const { signIn, session, me, loading } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && me) navigate(from, { replace: true });
  }, [session, me, navigate, from]);

  if (loading) return null;
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
    <div className="min-h-screen flex items-center justify-center bg-ink p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center font-display text-3xl text-gold mb-2">
          Ethereal Tours
        </Link>
        <p className="text-center text-xs uppercase tracking-[0.3em] text-gold-soft mb-10">
          Panel administrativo
        </p>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-7 space-y-5">
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
        </form>

        <p className="mt-6 text-center text-xs text-cream/40">
          ¿Olvidaste tu contraseña? Contactá al super admin para que la resetee.
        </p>
      </div>
    </div>
  );
}
