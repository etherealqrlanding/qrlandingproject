// Fuente única del menú del admin — la usan tanto el sidebar de desktop
// (AdminLayout) como la barra inferior de mobile (BottomNavAdmin), para que
// una sección nueva se agregue en un solo lugar y aparezca en los dos.
export interface AdminNavItem { to: string; label: string; icon: string; end?: boolean }

export const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: '◆', end: true },
  { to: '/admin/products', label: 'Productos', icon: '⌂' },
  { to: '/admin/products/bulk-capacity', label: 'Cupos', icon: '▦' },
  { to: '/admin/sellers', label: 'Vendedores', icon: '☉' },
  { to: '/admin/orders', label: 'Órdenes', icon: '✦' },
  { to: '/admin/holds', label: 'Cupos en espera', icon: '⏳' },
  { to: '/admin/content', label: 'Contenido', icon: '✎' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
];

// Solo super_admin puede otorgar/quitar acceso admin — el resto ni ve el link.
export const ADMIN_SUPER_NAV: AdminNavItem = { to: '/admin/admins', label: 'Admins', icon: '🛡' };

// Items fijos en la barra inferior de mobile (BottomNavAdmin) — todo lo demás
// del menú completo cae en el botón "Más", así la barra no sigue creciendo
// cada vez que se agrega una sección nueva al sidebar.
export const BOTTOM_NAV_PINNED_PATHS = new Set<string>([
  '/admin', '/admin/products', '/admin/sellers', '/admin/orders', '/admin/content', '/admin/settings',
]);
