import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { LoadingScreen } from '../Spinner';

export default function ProtectedRoute({ children }: { readonly children: React.ReactNode }) {
  const { loading, session, me, error, hasTransientError, refresh } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen label="Cargando sesión..." />;
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  // Sesión válida pero no logramos cargar `me` y NO es un error transitorio
  // (es decir: el backend respondió 401/403 → realmente no tenemos permisos).
  if (!me && !hasTransientError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink text-cream/80 px-6">
        <div className="max-w-md text-center">
          <p className="text-2xl font-display text-bordeaux-light">Acceso denegado</p>
          <p className="mt-3 text-sm text-cream/70">
            Tu sesión es válida pero no tenés permisos de administrador. Contactá al super admin para que te habilite.
          </p>
        </div>
      </div>
    );
  }

  // Caso: nunca cargamos me y hay error transitorio → cargando con retry
  if (!me && hasTransientError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink px-6">
        <div className="max-w-md text-center">
          <p className="text-2xl font-display text-gold-soft">Reconectando...</p>
          <p className="mt-3 text-sm text-cream/60">{error ?? 'Problema temporal de conexión.'}</p>
          <button type="button" onClick={() => { refresh(); }}
            className="btn-primary mt-6"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Caso normal: tenemos me. Si además hay un error transitorio en background,
  // mostramos un banner sutil pero seguimos dejando trabajar.
  return (
    <>
      {hasTransientError && (
        <div className="bg-bordeaux-deep/40 border-b border-bordeaux-light/30 px-4 py-2 text-xs text-cream/80 flex items-center justify-between gap-3">
          <span>⚠ Problema de conexión con el servidor. Algunas pantallas pueden no actualizarse.</span>
          <button type="button" onClick={() => { refresh(); }} className="text-gold-soft hover:text-gold underline">
            Reintentar
          </button>
        </div>
      )}
      {children}
    </>
  );
}
