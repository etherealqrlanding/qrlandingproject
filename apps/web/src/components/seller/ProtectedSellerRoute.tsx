import { Navigate, useLocation } from 'react-router-dom';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { LoadingScreen } from '../Spinner';

export default function ProtectedSellerRoute({ children }: { readonly children: React.ReactNode }) {
  const { loading, session, me, error, hasTransientError, refresh } = useSellerAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen label="Cargando sesión..." />;
  }

  if (!session) {
    return <Navigate to="/seller/login" replace state={{ from: location }} />;
  }

  if (!me && !hasTransientError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink text-cream/80 px-6">
        <div className="max-w-md text-center">
          <p className="text-2xl font-display text-bordeaux-light">Acceso denegado</p>
          <p className="mt-3 text-sm text-cream/70">
            Tu sesión es válida pero no tenés acceso al portal de vendedores. Contactá a Tangos y Milongas Tickets para que te habiliten.
          </p>
        </div>
      </div>
    );
  }

  if (!me && hasTransientError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink px-6">
        <div className="max-w-md text-center">
          <p className="text-2xl font-display text-gold-soft">Reconectando...</p>
          <p className="mt-3 text-sm text-cream/60">{error ?? 'Problema temporal de conexión.'}</p>
          <button type="button" onClick={() => { refresh(); }} className="btn-primary mt-6">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {hasTransientError && (
        <div className="bg-bordeaux-deep/40 border-b border-bordeaux-light/30 px-4 py-2 text-xs text-cream/80 flex items-center justify-between gap-3">
          <span>⚠ Problema de conexión con el servidor.</span>
          <button type="button" onClick={() => { refresh(); }} className="text-gold-soft hover:text-gold underline">
            Reintentar
          </button>
        </div>
      )}
      {children}
    </>
  );
}
