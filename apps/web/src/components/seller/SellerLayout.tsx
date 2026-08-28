import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { useNavIndicator } from '../../hooks/useNavIndicator';
import { sellerApi, getNotificationStreamUrl, SELLER_NOTIFICATION_EVENT, type SellerNotification } from '../../lib/sellerApi';
import { buildShareUrl } from '../../lib/shareLinks';
import { useSupportWhatsapp } from '../../lib/useSupportWhatsapp';
import BottomNavSeller from './BottomNavSeller';
import Logo from '../Logo';

const WhatsAppIcon = (
  <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

interface NavItem { to: string; label: string; icon: string; end?: boolean }

const NAV: NavItem[] = [
  { to: '/seller', label: 'Resumen', icon: '◆', end: true },
  { to: '/seller/catalogo', label: 'Catálogo', icon: '◈' },
  { to: '/seller/nueva-reserva', label: 'Nueva Reserva', icon: '＋' },
  { to: '/seller/ventas', label: 'Órdenes', icon: '✦' },
  { to: '/seller/configuracion', label: 'Configuración', icon: '⚙' },
  { to: '/seller/liquidaciones', label: 'Liquidaciones', icon: '⬡' },
  { to: '/seller/notificaciones', label: 'Notificaciones', icon: '🔔' },
  { to: '/seller/archivo', label: 'Archivo', icon: '📁' },
  { to: '/seller/ayuda', label: 'Ayuda', icon: '?' },
];

// Solo aparece si el admin habilitó "Mi equipo" (sub-vendedores) para esta cuenta
// desde el panel interno — sellers.team_enabled, ver GET /api/seller/me.
const NAV_TEAM: NavItem = { to: '/seller/equipo', label: 'Mi Equipo', icon: '👥' };

const FALLBACK_POLL_MS = 10_000;
const SSE_RECONNECT_MS = 5_000;

export default function SellerLayout() {
  const { me, signOut } = useSellerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [polledUnread, setPolledUnread] = useState<number | null>(null);
  const [toast, setToast] = useState<SellerNotification | null>(null);
  // Sidebar colapsable — preferencia persistida para que no se resetee al navegar/recargar.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('seller_sidebar_collapsed') === '1');
  useEffect(() => {
    localStorage.setItem('seller_sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);
  const navRef = useRef<HTMLElement>(null);
  const hasTeam = me?.team_enabled ?? false;
  // Botón flotante de WhatsApp -- solo para recomendadores que el admin marcó como
  // estables/de confianza (sellers.whatsapp_button_enabled). El número sale del mismo
  // support_whatsapp global que ya usan SellerHelp/SellerNotifications.
  const showWhatsappButton = me?.whatsapp_button_enabled ?? false;
  const supportWhatsapp = useSupportWhatsapp();
  const whatsappUrl = `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent('Hola, soy recomendador de Tango QR y necesito contactarlos.')}`;
  const navItems = hasTeam
    ? [...NAV.slice(0, 4), NAV_TEAM, ...NAV.slice(4)]
    : NAV;
  const navIndicator = useNavIndicator(navRef, [location.pathname, collapsed, hasTeam]);
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
        window.dispatchEvent(new CustomEvent(SELLER_NOTIFICATION_EVENT, { detail: notif }));
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

  // Abre el sitio público en otra pestaña ya con SU propio código de referido — a
  // diferencia del admin (que no es un vendedor real y necesita un código "preview"
  // generado por el backend), el vendedor ya tiene el suyo a mano.
  const handlePreviewSite = () => {
    if (!me) return;
    window.open(buildShareUrl('/', me.code), '_blank', 'noopener');
  };

  // Compartir el código propio a un click desde el header móvil: comparte el link
  // de referido (mismo link/mensaje que ya arma SellerDashboard) vía el share nativo
  // del sistema si está disponible; si no, lo copia y avisa brevemente en el mismo lugar.
  const [codeCopied, setCodeCopied] = useState(false);
  const handleShareCode = async () => {
    if (!me) return;
    const refLink = buildShareUrl('/', me.code);
    const waMessage = `Hola! Te paso el link para reservar la experiencia: ${refLink}`;
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'Tango QR', text: waMessage, url: refLink }); } catch { /* cancelado */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(refLink);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  const unread = polledUnread ?? me?.unread_notifications ?? 0;

  return (
    <div className="h-[100dvh] overflow-hidden flex bg-ink text-cream">
      {/* Botón flotante de WhatsApp -- solo si el admin lo habilitó para esta cuenta.
          Apilado arriba del toast (misma esquina) para que nunca se solapen. */}
      {showWhatsappButton && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contactar por WhatsApp"
          title="Contactar por WhatsApp"
          className="fixed z-40 bottom-20 right-4 md:bottom-10 md:right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-[#0d0a0a] shadow-xl shadow-black/30 hover:bg-[#22c55e] transition-colors"
        >
          {WhatsAppIcon}
        </a>
      )}
      {/* Toast de notificación en tiempo real */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 max-w-sm rounded-xl border border-gold/30 bg-ink-soft shadow-xl px-4 py-3 flex items-start gap-3 animate-toast-in"
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

        <div className={`border-b border-gold/10 ${collapsed ? 'px-3 py-3 flex justify-center' : 'px-5 py-3.5'}`}>
          {collapsed ? (
            <img src="/icon-512.png" alt="" className="h-7 w-7 object-contain" />
          ) : (
            <>
              <Logo className="h-8 w-auto" />
              <p className="text-[11px] text-cream/50 mt-1">Portal de recomendadores</p>
            </>
          )}
        </div>

        <nav ref={navRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-0.5 relative">
          {navIndicator && (
            <div
              aria-hidden
              className="absolute inset-x-0 rounded-md bg-gold/15 transition-[top,height] duration-300 ease-out"
              style={{ top: navIndicator.top, height: navIndicator.height }}
            />
          )}
          {navItems.map((item) => {
            const isNotifItem = item.to === '/seller/notificaciones';
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `relative z-10 flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition ${collapsed ? 'justify-center' : ''} ${
                    isActive
                      ? 'text-gold'
                      : 'text-cream/70 hover:bg-gold/5 hover:text-cream'
                  }`
                }
              >
                <span className="w-5 text-center shrink-0 relative">
                  {item.icon}
                  {collapsed && isNotifItem && unread > 0 && (
                    <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-gold" />
                  )}
                </span>
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && isNotifItem && unread > 0 && (
                  <span className="rounded-full bg-gold text-ink text-[10px] font-bold px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 py-2.5 border-t border-gold/10">
          <button
            type="button"
            onClick={handlePreviewSite}
            title={collapsed ? 'Ver sitio' : undefined}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 mb-2 rounded-md border border-gold/25 bg-gold/5 text-sm text-gold-soft hover:bg-gold/15 transition"
          >
            {collapsed ? '↗' : <>Ver sitio ↗</>}
          </button>
          {me && !collapsed && (
            <div className="px-3 mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm text-cream truncate">{me.name}</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gold-soft shrink-0">{me.code}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full px-3 py-1.5 rounded-md text-sm text-cream/60 hover:bg-bordeaux-deep/30 hover:text-cream transition ${collapsed ? 'text-center' : 'text-left'}`}
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
            {me && (
              <button
                type="button"
                onClick={handleShareCode}
                title="Compartir tu código"
                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-gold-soft hover:text-gold transition-colors"
              >
                {codeCopied ? '✓ Copiado' : <>{me.code} <span aria-hidden>↗</span></>}
              </button>
            )}
            <button
              type="button"
              onClick={handlePreviewSite}
              className="text-xs text-gold-soft hover:text-gold transition"
            >
              Ver sitio ↗
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
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNavSeller unread={unread} />
    </div>
  );
}
