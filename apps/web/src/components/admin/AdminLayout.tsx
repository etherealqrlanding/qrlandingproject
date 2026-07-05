import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import BottomNavAdmin from './BottomNavAdmin';
import Logo from '../Logo';

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

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="h-[100dvh] overflow-hidden flex bg-ink text-cream">
      {/* Sidebar — solo desktop */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-gold/10 bg-ink-soft/40 flex-col">
        <div className="px-6 py-5 border-b border-gold/10">
          <Logo className="h-9 w-auto" />
          <p className="text-xs text-cream/50 mt-2">Panel administrativo</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
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
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gold/10">
          {me && (
            <div className="px-3 mb-3">
              <p className="text-xs text-cream/50">Conectado como</p>
              <p className="text-sm text-cream truncate">{me.admin.email}</p>
              <p className="text-[10px] uppercase tracking-wider text-gold-soft">{me.admin.role}</p>
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
          <Logo className="h-8 w-auto" />
          <div className="flex items-center gap-4">
            {me && <p className="text-xs text-cream/50 truncate max-w-[140px]">{me.admin.email}</p>}
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
          <Outlet />
        </main>
      </div>

      <BottomNavAdmin />
    </div>
  );
}
