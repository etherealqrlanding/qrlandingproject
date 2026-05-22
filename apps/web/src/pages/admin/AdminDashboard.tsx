import { Link } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function AdminDashboard() {
  const { me } = useAdminAuth();
  if (!me) return null;

  const cards = [
    {
      label: 'Productos activos',
      value: me.stats.products,
      hint: 'Casas de tango publicadas',
      href: '/admin/products',
    },
    {
      label: 'Órdenes pagadas',
      value: me.stats.orders_paid,
      hint: 'Total histórico',
      href: '/admin/orders',
    },
    {
      label: 'Órdenes pendientes',
      value: me.stats.orders_pending,
      hint: 'Esperando confirmación de pago',
      href: '/admin/orders',
    },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
          Bienvenido, {me.admin.full_name ?? me.admin.email}
        </p>
        <h1 className="mt-2 font-display text-4xl text-cream">Dashboard</h1>
      </header>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.href}
            className="rounded-lg border border-gold/10 bg-ink-soft/60 p-6 transition hover:border-gold/30"
          >
            <p className="text-xs uppercase tracking-widest text-gold-soft">{c.label}</p>
            <p className="mt-3 font-display text-5xl text-cream">{c.value}</p>
            <p className="mt-2 text-xs text-cream/50">{c.hint}</p>
          </Link>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-cream mb-4">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/products/new" className="btn-primary">+ Nuevo producto</Link>
          <Link to="/admin/products" className="btn-ghost">Ver todos los productos</Link>
        </div>
      </section>
    </div>
  );
}
