import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/admin', label: 'Panel', icon: '◆', end: true },
  { to: '/admin/products', label: 'Productos', icon: '⌂' },
  { to: '/admin/sellers', label: 'Vendedores', icon: '☉' },
  { to: '/admin/orders', label: 'Órdenes', icon: '✦' },
  { to: '/admin/settings', label: 'Config', icon: '⚙' },
];

export default function BottomNavAdmin() {
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
              `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
                isActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
              }`
            }
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px] leading-none mt-0.5 truncate w-full text-center px-1">
              {item.label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
