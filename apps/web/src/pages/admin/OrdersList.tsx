import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminOrderListItem } from '../../lib/adminApi';

const PAGE_SIZE = 10;
const SKELETON_KEYS = ['sk-a', 'sk-b', 'sk-c', 'sk-d', 'sk-e'];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'paid', label: 'Pagada' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'failed', label: 'Fallida' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded', label: 'Reintegrada' },
];

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtServiceDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const color = {
    paid: 'text-gold border-gold/40 bg-gold/10',
    pending: 'text-gold-soft border-gold-soft/30 bg-gold-soft/5',
    failed: 'text-bordeaux-light border-bordeaux-light/40 bg-bordeaux-deep/20',
    cancelled: 'text-cream/50 border-cream/20 bg-cream/5',
    refunded: 'text-cream/60 border-cream/20 bg-cream/5',
  }[status] ?? 'text-cream/60 border-cream/20';
  const label = {
    paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', cancelled: 'Cancelada', refunded: 'Reintegrada',
  }[status] ?? status;
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}

function SummaryCard({ label, value, highlight }: Readonly<{ label: string; value: string; highlight?: boolean }>) {
  return (
    <div className={`rounded-lg border p-3 md:p-4 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/60'}`}>
      <p className="text-[10px] uppercase tracking-widest text-gold-soft">{label}</p>
      <p className={`mt-0.5 font-display text-xl md:text-2xl ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function OrderCard({ o }: Readonly<{ o: AdminOrderListItem }>) {
  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/40 hover:bg-ink-soft/60 transition overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-cream/40 tabular-nums">{fmtShortDate(o.created_at)}</span>
          <StatusBadge status={o.status} />
          {o.payment_method === 'cash' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-gold/30 text-gold-soft bg-gold/5">Efectivo</span>
          )}
        </div>
        <p className="text-gold font-mono font-medium text-sm whitespace-nowrap shrink-0">USD {o.total_usd}</p>
      </div>

      <div className="px-4 pb-3 border-b border-gold/10">
        <Link to={`/admin/orders/${o.public_id}`} className="text-cream hover:text-gold font-medium text-sm">
          {o.customer_name}
        </Link>
        <p className="text-xs text-cream/40 truncate">{o.customer_email}</p>
      </div>

      <div className="px-4 py-3 space-y-2">
        {(o.product_name || o.option_name) && (
          <div>
            <p className="text-xs text-cream/80">{o.product_name}</p>
            <p className="text-[10px] text-cream/50">
              {o.option_name}
              {o.service_date ? ` · ${fmtServiceDate(o.service_date)}` : ''}
              {o.adults != null ? ` · ${o.adults} ad.${o.children ? ` ${o.children} men.` : ''}` : ''}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {o.seller_name ? (
              <p className="text-[10px] text-cream/50 truncate">
                <Link to={`/admin/sellers/${o.seller_id}`} className="hover:text-cream/80 transition">{o.seller_name}</Link>
                {' '}<span className="font-mono text-cream/30">{o.seller_code}</span>
              </p>
            ) : (
              <p className="text-[10px] text-cream/25">Sin vendedor</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {o.commission_amount_usd != null && (
              <span className="text-[10px] text-gold font-mono">Com. {o.commission_amount_usd}</span>
            )}
            <Link to={`/admin/orders/${o.public_id}`} className="text-xs text-gold-soft hover:text-gold transition">Ver →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Paginación ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: Readonly<{ page: number; totalPages: number; onChange: (p: number) => void }>) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 0}
        className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 disabled:opacity-30 disabled:cursor-not-allowed transition">
        ← Anterior
      </button>
      <span className="text-xs text-cream/40">{page + 1} / {totalPages}</span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page + 1 >= totalPages}
        className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 disabled:opacity-30 disabled:cursor-not-allowed transition">
        Siguiente →
      </button>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function OrdersList() {
  const [orders, setOrders] = useState<AdminOrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', ref: '', from: '', to: '', search: '' });
  const [page, setPage] = useState(0);

  useEffect(() => {
    setOrders(null);
    setError(null);
    setPage(0);
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

  const totalPages = Math.ceil((orders?.length ?? 0) / PAGE_SIZE);
  const paginated = orders?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];

  let mainContent: React.ReactNode;
  if (!orders && !error) {
    mainContent = (
      <div className="space-y-3">
        {SKELETON_KEYS.map((k) => (
          <div key={k} className="h-[120px] rounded-xl bg-ink-soft/60 animate-pulse" />
        ))}
      </div>
    );
  } else if (orders && orders.length === 0) {
    mainContent = (
      <p className="text-cream/60 text-sm py-12 text-center">Sin órdenes para los filtros aplicados.</p>
    );
  } else if (orders && orders.length > 0) {
    const pluralSuffix = orders.length === 1 ? '' : 'es';
    mainContent = (
      <>
        {/* ── Mobile: cards ── */}
        <div className="md:hidden space-y-3 mb-4">
          {paginated.map((o) => <OrderCard key={o.id} o={o} />)}
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-3 px-3 whitespace-nowrap">Fecha</th>
                <th className="text-left py-3 px-3">Cliente</th>
                <th className="text-left py-3 px-3">Servicio</th>
                <th className="text-left py-3 px-3">Vendedor</th>
                <th className="text-center py-3 px-3">Estado</th>
                <th className="text-right py-3 px-3">Total</th>
                <th className="text-right py-3 px-3">Comisión</th>
                <th className="py-3 px-3" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((o) => (
                <tr key={o.id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                  <td className="py-2.5 px-3 text-cream/60 text-xs tabular-nums whitespace-nowrap">
                    {fmtShortDate(o.created_at)}
                  </td>
                  <td className="py-2.5 px-3">
                    <Link to={`/admin/orders/${o.public_id}`} className="text-cream hover:text-gold text-xs font-medium">
                      {o.customer_name}
                    </Link>
                    <p className="text-xs text-cream/40 truncate max-w-[140px]">{o.customer_email}</p>
                  </td>
                  <td className="py-2.5 px-3 text-cream/80 text-xs">
                    {o.option_name}
                    <p className="text-cream/40">{o.product_name}{o.service_date ? ` · ${o.service_date}` : ''}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {o.seller_name ? (
                      <>
                        <Link to={`/admin/sellers/${o.seller_id}`} className="text-cream/80 hover:text-gold">{o.seller_name}</Link>
                        <p className="font-mono text-cream/40">{o.seller_code}</p>
                      </>
                    ) : <span className="text-cream/30">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <StatusBadge status={o.status} />
                    {o.payment_method === 'cash' && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded border border-gold/30 text-gold-soft bg-gold/5">Ef.</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-cream/80 tabular-nums text-xs whitespace-nowrap">
                    USD {o.total_usd}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gold tabular-nums text-xs whitespace-nowrap">
                    {o.commission_amount_usd != null ? `USD ${o.commission_amount_usd}` : <span className="text-cream/30">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Link to={`/admin/orders/${o.public_id}`} className="text-gold-soft hover:text-gold text-xs">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pie: conteo + paginación ── */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-cream/30">
            {orders.length} orden{pluralSuffix}
          </p>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <header className="mb-4 md:mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Ventas</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Órdenes</h1>
      </header>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 md:mb-6">
          <SummaryCard label="Total" value={`${summary.count}`} />
          <SummaryCard label="Pagadas" value={`${summary.paidCount}`} />
          <SummaryCard label="Revenue" value={`$${summary.revenue.toFixed(0)}`} />
          <SummaryCard label="Comisiones" value={`$${summary.commission.toFixed(0)}`} highlight />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_140px_140px_140px] gap-2 mb-4">
        <input type="search" placeholder="Email o nombre..." value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="input col-span-2 sm:col-span-1" />
        <input type="text" placeholder="Cód. vendedor" value={filters.ref}
          onChange={(e) => setFilters({ ...filters, ref: e.target.value })}
          className="input font-mono text-sm" />
        <input type="date" value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="input" />
        <input type="date" value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="input" />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="input col-span-2 sm:col-span-1 lg:col-span-1">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {mainContent}
    </div>
  );
}
