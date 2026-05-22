import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminOrderListItem } from '../../lib/adminApi';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'paid', label: 'Pagada' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'failed', label: 'Fallida' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded', label: 'Reintegrada' },
];

export default function OrdersList() {
  const [orders, setOrders] = useState<AdminOrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', ref: '', from: '', to: '', search: '' });

  useEffect(() => {
    setOrders(null);
    setError(null);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    adminApi.orders.list(params)
      .then(setOrders)
      .catch((err) => setError((err as Error).message));
  }, [filters]);

  const summary = useMemo(() => {
    if (!orders) return null;
    return orders.reduce((acc, o) => {
      acc.count++;
      if (o.status === 'paid') {
        acc.paidCount++;
        acc.revenue += o.total_usd ?? 0;
        acc.commission += o.commission_amount_usd ?? 0;
      }
      return acc;
    }, { count: 0, paidCount: 0, revenue: 0, commission: 0 });
  }, [orders]);

  return (
    <div className="p-8 max-w-7xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Ventas</p>
        <h1 className="mt-2 font-display text-4xl text-cream">Órdenes</h1>
      </header>

      {summary && (
        <div className="grid sm:grid-cols-4 gap-4 mb-8">
          <Card label="Total mostrado" value={`${summary.count}`} />
          <Card label="Pagadas" value={`${summary.paidCount}`} />
          <Card label="Revenue" value={`USD ${summary.revenue.toFixed(2)}`} />
          <Card label="Comisiones" value={`USD ${summary.commission.toFixed(2)}`} highlight />
        </div>
      )}

      <div className="grid sm:grid-cols-[1fr_1fr_140px_140px_140px] gap-3 mb-6">
        <input
          type="search" placeholder="Buscar por email o nombre..." value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="input"
        />
        <input
          type="text" placeholder="Código vendedor" value={filters.ref}
          onChange={(e) => setFilters({ ...filters, ref: e.target.value })}
          className="input font-mono text-sm"
        />
        <input type="date" value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="input" />
        <input type="date" value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="input" />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="input">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {error && <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>}

      {!orders && !error && (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded bg-ink-soft/60 animate-pulse" />)}</div>
      )}

      {orders && orders.length === 0 && (
        <p className="text-cream/60 text-sm py-12 text-center">Sin órdenes para los filtros aplicados.</p>
      )}

      {orders && orders.length > 0 && (
        <div className="rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-3 px-4">Fecha</th>
                <th className="text-left py-3 px-4">Cliente</th>
                <th className="text-left py-3 px-4">Servicio</th>
                <th className="text-left py-3 px-4">Vendedor</th>
                <th className="text-center py-3 px-4">Estado</th>
                <th className="text-right py-3 px-4">Total</th>
                <th className="text-right py-3 px-4">Comisión</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                  <td className="py-3 px-4 text-cream/60 text-xs tabular-nums">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <Link to={`/admin/orders/${o.public_id}`} className="text-cream hover:text-gold">{o.customer_name}</Link>
                    <p className="text-xs text-cream/40">{o.customer_email}</p>
                  </td>
                  <td className="py-3 px-4 text-cream/80 text-xs">
                    {o.option_name}
                    <p className="text-cream/40">{o.product_name} · {o.service_date}</p>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {o.seller_name ? (
                      <>
                        <Link to={`/admin/sellers/${o.seller_id}`} className="text-cream/80 hover:text-gold">{o.seller_name}</Link>
                        <p className="font-mono text-cream/40">{o.seller_code}</p>
                      </>
                    ) : <span className="text-cream/30">Sin atribución</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StatusBadge status={o.status} />
                    {o.payment_method === 'cash' && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded border border-gold/30 text-gold-soft bg-gold/5">
                        Efectivo
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-cream/80 tabular-nums">USD {o.total_usd}</td>
                  <td className="py-3 px-4 text-right text-gold tabular-nums">
                    {o.commission_amount_usd != null ? `USD ${o.commission_amount_usd}` : <span className="text-cream/30">—</span>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/admin/orders/${o.public_id}`} className="text-gold-soft hover:text-gold text-sm">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = {
    paid: 'text-gold border-gold/40 bg-gold/10',
    pending: 'text-gold-soft border-gold-soft/30 bg-gold-soft/5',
    failed: 'text-bordeaux-light border-bordeaux-light/40 bg-bordeaux-deep/20',
    cancelled: 'text-cream/50 border-cream/20 bg-cream/5',
    refunded: 'text-cream/60 border-cream/20 bg-cream/5',
  }[status] ?? 'text-cream/60 border-cream/20';
  const label = { paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', cancelled: 'Cancelada', refunded: 'Reintegrada' }[status] ?? status;
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/60'}`}>
      <p className="text-xs uppercase tracking-widest text-gold-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
    </div>
  );
}
