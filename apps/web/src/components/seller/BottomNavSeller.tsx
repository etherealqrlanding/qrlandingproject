import { NavLink } from 'react-router-dom';

interface Props {
  unread: number;
}

const NAV = [
  { to: '/seller', label: 'Resumen', icon: '◆', end: true },
  { to: '/seller/catalogo', label: 'Catálogo', icon: '◈' },
  { to: '/seller/nueva-reserva', label: 'Nueva', icon: '＋' },
  { to: '/seller/ventas', label: 'Ventas', icon: '✦' },
  { to: '/seller/archivo', label: 'Archivo', icon: '📁' },
  { to: '/seller/notificaciones', label: 'Alertas', icon: '🔔', notif: true },
  { to: '/seller/ayuda', label: 'Ayuda', icon: '?' },
];

export default function BottomNavSeller({ unread }: Props) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/[0.97] backdrop-blur-xl border-t border-gold/20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-16 items-stretch">
        {NAV.map((item) => (
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
      </div>
    </nav>
  );
}
