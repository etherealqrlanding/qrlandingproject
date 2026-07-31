import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BOTTOM_NAV_PINNED_PATHS, type AdminNavItem } from '../../lib/adminNav';
import MoreSheet from '../MoreSheet';

interface Props {
  items: AdminNavItem[];
  newOrdersCount?: number;
}

export default function BottomNavAdmin({ items, newOrdersCount = 0 }: Readonly<Props>) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Si se navega mientras el sheet de "Más" está abierto (ej. desde uno de sus
  // propios links), lo cerramos — evita que quede colgado sobre la pantalla nueva.
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  const pinned = items.filter((item) => BOTTOM_NAV_PINNED_PATHS.has(item.to));
  const rest = items.filter((item) => !BOTTOM_NAV_PINNED_PATHS.has(item.to));

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/[0.97] backdrop-blur-xl border-t border-gold/20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-16 items-stretch">
        {pinned.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors relative ${
                isActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
              }`
            }
          >
            <span className="text-xl leading-none relative">
              {item.icon}
              {item.to === '/admin/orders' && newOrdersCount > 0 && (
                <span className="absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-ink leading-none">
                  {newOrdersCount > 9 ? '9+' : newOrdersCount}
                </span>
              )}
            </span>
            <span className="text-[10px] leading-none mt-0.5 truncate w-full text-center px-1">
              {item.label}
            </span>
          </NavLink>
        ))}

        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Más opciones"
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
              rest.some((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
                ? 'text-gold'
                : 'text-cream/40 active:text-cream/60'
            }`}
          >
            <span className="text-xl leading-none">⋯</span>
            <span className="text-[10px] leading-none mt-0.5">Más</span>
          </button>
        )}
      </div>

      {/* Sheet "Más" — el resto de las secciones del admin, en grilla, para no
          tener que seguir agregando iconos a la barra fija cada vez que crece el menú. */}
      {moreOpen && (
        <MoreSheet title="Más" onClose={() => setMoreOpen(false)}>
          <div className="px-3 pb-2 grid grid-cols-3 gap-1.5">
            {rest.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
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
