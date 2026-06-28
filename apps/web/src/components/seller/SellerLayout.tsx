import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { sellerApi, getNotificationStreamUrl, type SellerNotification } from '../../lib/sellerApi';
import BottomNavSeller from './BottomNavSeller';

const NAV = [
  { to: '/seller', label: 'Resumen', icon: '◆', end: true },
  { to: '/seller/catalogo', label: 'Catálogo', icon: '◈' },
  { to: '/seller/nueva-reserva', label: 'Nueva Reserva', icon: '＋' },
  { to: '/seller/ventas', label: 'Mis ventas', icon: '✦' },
  { to: '/seller/liquidaciones', label: 'Liquidaciones', icon: '⬡' },
  { to: '/seller/notificaciones', label: 'Notificaciones', icon: '🔔' },
];

const FALLBACK_POLL_MS = 10_000;
const SSE_RECONNECT_MS = 5_000;

export default function SellerLayout() {
  const { me, signOut } = useSellerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [polledUnread, setPolledUnread] = useState<number | null>(null);
  const [toast, setToast] = useState<SellerNotification | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpUnread = useCallback(() => {
    setPolledUnread((prev) => (prev ?? 0) + 1);
  }, []);

  const showToast = useCallback((notif: SellerNotification) => {
    setToast(notif);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const startFallbackPoll = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      sellerApi.notifications.unreadCount()
        .then(({ count }) => setPolledUnread(count))
        .catch(() => {});
    }, FALLBACK_POLL_MS);
  }, []);

  const stopFallbackPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const connectSSE = useCallback(async () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const url = await getNotificationStreamUrl();
    if (!url) { startFallbackPoll(); return; }

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('notification', (e) => {
      try {
        const notif = JSON.parse(e.data) as SellerNotification;
        bumpUnread();
        showToast(notif);
      } catch { /* ignore parse error */ }
    });

    es.onopen = () => { stopFallbackPoll(); };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      startFallbackPoll();
      // Reintentar conexión SSE después de un delay
      reconnectRef.current = setTimeout(() => { connectSSE(); }, SSE_RECONNECT_MS);
    };
  }, [bumpUnread, showToast, startFallbackPoll, stopFallbackPoll]);

  useEffect(() => {
    connectSSE();
    return () => {
      esRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync badge down to 0 when the notifications page marks all as read
  useEffect(() => {
    if ((me?.unread_notifications ?? 0) === 0) setPolledUnread(0);
  }, [me?.unread_notifications]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/seller/login');
  };

  const unread = polledUnread ?? me?.unread_notifications ?? 0;

  return (
    <div className="h-[100dvh] overflow-hidden flex bg-ink text-cream">
      {/* Toast de notificación en tiempo real */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 max-w-sm rounded-xl border border-gold/30 bg-ink-soft shadow-xl px-4 py-3 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300"
        >
          <span className="text-xl leading-none mt-0.5">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-cream">{toast.title}</p>
            <p className="text-xs text-cream/60 mt-0.5 line-clamp-2">{toast.body}</p>
            {toast.type === 'cash_booking_pending' && typeof toast.metadata.order_public_id === 'string' && (
              <Link
                to={`/seller/ventas?highlight=${encodeURIComponent(toast.metadata.order_public_id)}`}
                onClick={() => setToast(null)}
                className="mt-2 inline-block text-xs font-medium text-gold-soft hover:text-gold underline underline-offset-2"
              >
                Ver venta →
              </Link>
            )}
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
      <aside className="hidden md:flex w-64 shrink-0 border-r border-gold/10 bg-ink-soft/40 flex-col">
        <div className="px-6 py-5 border-b border-gold/10">
          <p className="font-display text-xl text-gold">ticketstangoshow</p>
          <p className="text-xs text-cream/50">Portal de vendedores</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const isNotifItem = item.to === '/seller/notificaciones';
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                    isActive
                      ? 'bg-gold/15 text-gold'
                      : 'text-cream/70 hover:bg-gold/5 hover:text-cream'
                  }`
                }
              >
                <span className="w-5 text-center">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {isNotifItem && unread > 0 && (
                  <span className="rounded-full bg-gold text-ink text-[10px] font-bold px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gold/10">
          {me && (
            <div className="px-3 mb-3">
              <p className="text-xs text-cream/50">Conectado como</p>
              <p className="text-sm text-cream truncate">{me.name}</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gold-soft">{me.code}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-cream/60 hover:bg-bordeaux-deep/30 hover:text-cream transition"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header móvil */}
        <header className="md:hidden sticky top-0 z-30 bg-ink-soft/90 backdrop-blur border-b border-gold/10 flex items-center justify-between px-4 h-12">
          <p className="font-display text-lg text-gold">ticketstangoshow</p>
          <div className="flex items-center gap-3">
            {me && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-gold-soft">{me.code}</span>
            )}
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
          {/* Campanita fija alineada con los títulos — solo desktop */}
          <Link
            to="/seller/notificaciones"
            aria-label="Notificaciones"
            className="hidden md:flex fixed top-7 right-8 z-30 group p-2 rounded-full hover:bg-gold/10 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cream/60 group-hover:text-cream/90 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {/* Tooltip */}
            <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 whitespace-nowrap rounded-md bg-ink-soft border border-gold/15 px-2 py-1 text-xs text-cream/80 opacity-0 group-hover:opacity-100 transition-opacity">
              Notificaciones
            </span>
          </Link>
          <Outlet />
        </main>
      </div>

      <BottomNavSeller unread={unread} />
    </div>
  );
}
