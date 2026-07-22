import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useNavIndicator } from '../../hooks/useNavIndicator';
import { adminApi, getAdminNotificationStreamUrl, type AdminNewOrderPaidEvent } from '../../lib/adminApi';
import BottomNavAdmin from './BottomNavAdmin';
import Logo from '../Logo';

const SSE_RECONNECT_MS = 5_000;

// Nombre del evento global que dispara el toast — OrdersList.tsx lo escucha para
// refrescar la lista en vivo si el admin ya está mirando esa pantalla.
export const NEW_ORDER_PAID_EVENT = 'admin:new-order-paid';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '◆', end: true },
  { to: '/admin/products', label: 'Productos', icon: '⌂' },
  { to: '/admin/sellers', label: 'Vendedores', icon: '☉' },
  { to: '/admin/orders', label: 'Órdenes', icon: '✦' },
  { to: '/admin/content', label: 'Contenido', icon: '✎' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
];

export default function AdminLayout() {
  const { me, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [toast, setToast] = useState<AdminNewOrderPaidEvent | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Sidebar colapsable — preferencia persistida para que no se resetee al navegar/recargar.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin_sidebar_collapsed') === '1');
  useEffect(() => {
    localStorage.setItem('admin_sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);
  const navRef = useRef<HTMLElement>(null);
  const navIndicator = useNavIndicator(navRef, [location.pathname, collapsed]);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abre el sitio público en otra pestaña ya "adentro" del muro de exclusividad, sin
  // tener que pedirle el código a un vendedor real (ver GET /api/admin/preview-link).
  const handlePreviewSite = async () => {
    setPreviewLoading(true);
    try {
      const { ref_code } = await adminApi.previewLink();
      const url = new URL('/', window.location.origin);
      url.searchParams.set('ref', ref_code);
      window.open(url.toString(), '_blank', 'noopener');
    } catch {
      alert('No se pudo abrir la vista previa del sitio. Probá de nuevo en un momento.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  // Push en vivo: nueva orden pagada (MP o cobro en efectivo confirmado por el
  // vendedor). Muestra un toast desde cualquier pantalla del admin y, si ya está
  // mirando "Órdenes", esa pantalla escucha el mismo evento para refrescarse sola.
  const connectSSE = useCallback(async () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const url = await getAdminNotificationStreamUrl();
    if (!url) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('new_order_paid', (e) => {
      try {
        const payload = JSON.parse(e.data) as AdminNewOrderPaidEvent;
        setToast(payload);
        if (toastRef.current) clearTimeout(toastRef.current);
        toastRef.current = setTimeout(() => setToast(null), 8000);
        window.dispatchEvent(new CustomEvent(NEW_ORDER_PAID_EVENT, { detail: payload }));
      } catch { /* ignore parse error */ }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      reconnectRef.current = setTimeout(() => { connectSSE(); }, SSE_RECONNECT_MS);
    };
  }, []);

  useEffect(() => {
    connectSSE();
    return () => {
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtArs = (n: number) => `ARS ${Math.round(n).toLocaleString('es-AR')}`;

  return (
    <div className="h-[100dvh] overflow-hidden flex bg-ink text-cream">
      {/* Toast de nueva orden pagada — push en vivo, visible desde cualquier pantalla */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 md:bottom-6 md:right-6 z-50 max-w-sm rounded-xl border border-gold/30 bg-ink-soft shadow-xl px-4 py-3 flex items-start gap-3 animate-toast-in"
        >
          <span className="text-xl leading-none mt-0.5">🎉</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-cream">
              {toast.payment_method === 'cash' ? 'Cobro en efectivo confirmado' : '¡Nueva orden pagada!'}
            </p>
            <p className="text-xs text-cream/60 mt-0.5 line-clamp-2">
              {toast.customer_name} · {toast.option_name ?? 'Reserva'} · {fmtArs(toast.total_ars)}
              {toast.seller_name ? ` · ${toast.seller_name}` : ''}
            </p>
            <Link
              to={`/admin/orders?highlight=${encodeURIComponent(toast.public_id)}`}
              onClick={() => setToast(null)}
              className="mt-2 inline-block text-xs font-medium text-gold-soft hover:text-gold underline underline-offset-2"
            >
              Ver orden →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-cream/40 hover:text-cream/80 text-lg leading-none mt-0.5 shrink-0"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}
      {/* Sidebar — solo desktop */}
      <aside className={`hidden md:flex ${collapsed ? 'w-[72px]' : 'w-64'} shrink-0 border-r border-gold/10 bg-ink-soft/40 flex-col relative transition-[width] duration-200`}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gold/30 bg-ink-soft text-cream/60 hover:text-gold hover:border-gold/50 shadow transition"
        >
          <span className={`inline-block text-xs transition-transform ${collapsed ? 'rotate-180' : ''}`}>‹</span>
        </button>

        <div className={`border-b border-gold/10 ${collapsed ? 'px-3 py-5 flex justify-center' : 'px-6 py-5'}`}>
          {collapsed ? (
            <img src="/icon-512.png" alt="" className="h-8 w-8 object-contain" />
          ) : (
            <>
              <Logo className="h-9 w-auto" />
              <p className="text-xs text-cream/50 mt-2">Panel administrativo</p>
            </>
          )}
        </div>

        <nav ref={navRef} className="flex-1 px-3 py-4 space-y-1 relative">
          {navIndicator && (
            <div
              aria-hidden
              className="absolute inset-x-0 rounded-md bg-gold/15 transition-[top,height] duration-300 ease-out"
              style={{ top: navIndicator.top, height: navIndicator.height }}
            />
          )}
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `relative z-10 flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${collapsed ? 'justify-center' : ''} ${
                  isActive
                    ? 'text-gold'
                    : 'text-cream/70 hover:bg-gold/5 hover:text-cream'
                }`
              }
            >
              <span className="w-5 text-center shrink-0">{item.icon}</span>
              {!collapsed && <span className="flex-1">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gold/10">
          <button
            type="button"
            onClick={handlePreviewSite}
            disabled={previewLoading}
            title={collapsed ? 'Ver sitio' : undefined}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 mb-3 rounded-md border border-gold/25 bg-gold/5 text-sm text-gold-soft hover:bg-gold/15 transition disabled:opacity-50"
          >
            {collapsed ? '↗' : (previewLoading ? 'Abriendo...' : <>Ver sitio ↗</>)}
          </button>
          {me && !collapsed && (
            <div className="px-3 mb-3">
              <p className="text-xs text-cream/50">Conectado como</p>
              <p className="text-sm text-cream truncate">{me.admin.email}</p>
              <p className="text-[10px] uppercase tracking-wider text-gold-soft">{me.admin.role}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full px-3 py-2 rounded-md text-sm text-cream/60 hover:bg-bordeaux-deep/30 hover:text-cream transition ${collapsed ? 'text-center' : 'text-left'}`}
          >
            {collapsed ? '⏻' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header móvil */}
        <header className="md:hidden sticky top-0 z-30 bg-ink-soft/90 backdrop-blur border-b border-gold/10 flex items-center justify-between px-4 h-12">
          <Logo className="h-8 w-auto" />
          <div className="flex items-center gap-3">
            {me && <p className="text-xs text-cream/50 truncate max-w-[100px]">{me.admin.email}</p>}
            <button
              type="button"
              onClick={handlePreviewSite}
              disabled={previewLoading}
              aria-label="Ver sitio"
              className="text-xs text-gold-soft hover:text-gold transition disabled:opacity-50"
            >
              {previewLoading ? '...' : 'Ver sitio ↗'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs text-cream/60 hover:text-cream transition"
            >
              Salir
            </button>
          </div>
        </header>

        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-24 md:pb-0">
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNavAdmin />
    </div>
  );
}
