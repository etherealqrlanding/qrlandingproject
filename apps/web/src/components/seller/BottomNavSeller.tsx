import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import MoreSheet from '../MoreSheet';
import { useSellerAuth } from '../../hooks/useSellerAuth';

interface Props {
  unread: number;
}

const PINNED = [
  { to: '/seller', label: 'Resumen', icon: '◆', end: true },
  { to: '/seller/catalogo', label: 'Catálogo', icon: '◈' },
  { to: '/seller/nueva-reserva', label: 'Nueva', icon: '＋' },
  { to: '/seller/ventas', label: 'Órdenes', icon: '✦' },
  { to: '/seller/notificaciones', label: 'Alertas', icon: '🔔', notif: true },
];

const MORE_BASE = [
  { to: '/seller/liquidaciones', label: 'Liquidaciones', icon: '⬡' },
  { to: '/seller/archivo', label: 'Archivo', icon: '📁' },
  { to: '/seller/configuracion', label: 'Configuración', icon: '⚙' },
  { to: '/seller/ayuda', label: 'Ayuda', icon: '?' },
];

// Solo si el vendedor tiene sub-vendedores activos cargados — ver SellerLayout.
const NAV_TEAM = { to: '/seller/equipo', label: 'Mi Equipo', icon: '👥' };

export default function BottomNavSeller({ unread }: Readonly<Props>) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const { me } = useSellerAuth();

  // Si se navega mientras el sheet de "Más" está abierto (ej. desde uno de sus
  // propios links), lo cerramos — evita que quede colgado sobre la pantalla nueva.
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  const MORE = me?.has_active_team ? [NAV_TEAM, ...MORE_BASE] : MORE_BASE;
  const moreActive = MORE.some((item) => location.pathname.startsWith(item.to));

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/[0.97] backdrop-blur-xl border-t border-gold/20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-16 items-stretch">
        {PINNED.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
                isActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
              }`
            }
          >
            <span className="relative text-xl leading-none">
              {item.icon}
              {item.notif && unread > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5 leading-none">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            <span className="text-[10px] leading-none mt-0.5 truncate w-full text-center px-0.5">
              {item.label}
            </span>
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Más opciones"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
            moreActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
          }`}
        >
          <span className="text-xl leading-none">⋯</span>
          <span className="text-[10px] leading-none mt-0.5">Más</span>
        </button>
      </div>

      {moreOpen && (
        <MoreSheet title="Más" onClose={() => setMoreOpen(false)}>
          <div className="px-3 pb-2 grid grid-cols-3 gap-1.5">
            {MORE.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1.5 rounded-lg py-3.5 transition-colors ${
                    isActive ? 'text-gold bg-gold/10' : 'text-cream/70 active:bg-gold/5'
                  }`
                }
              >
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="text-[11px] leading-none text-center px-1">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </MoreSheet>
      )}
    </nav>
  );
}
