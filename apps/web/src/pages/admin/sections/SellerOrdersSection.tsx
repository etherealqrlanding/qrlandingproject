import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminSeller, type AdminSellerOrder } from '../../../lib/adminApi';

interface Props { seller: AdminSeller; }

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'failed', label: 'Fallidas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'refunded', label: 'Reintegradas' },
];

export default function SellerOrdersSection({ seller }: Props) {
  const [orders, setOrders] = useState<AdminSellerOrder[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('paid');
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const data = await adminApi.sellers.orders(seller.id, statusFilter || undefined);
      setOrders(data);
      setSelectedOrderIds([]);
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.id, statusFilter]);

  const pendingCommissionOrders = useMemo(
    () => (orders ?? []).filter((o) => o.status === 'paid' && !o.paid_to_seller_at),
    [orders],
  );

  const summary = useMemo(() => {
    if (!orders) return null;
    return orders.reduce((acc, o) => {
      if (o.status === 'paid') {
        acc.totalCommission += o.commission_amount_usd ?? 0;
        if (!o.paid_to_seller_at) acc.pending += o.commission_amount_usd ?? 0;
        else acc.paid += o.commission_amount_usd ?? 0;
      }
      return acc;
    }, { totalCommission: 0, paid: 0, pending: 0 });
  }, [orders]);

  const togglePendingAll = () => {
    if (selectedOrderIds.length === pendingCommissionOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(pendingCommissionOrders.map((o) => o.order_id));
    }
  };

  const toggleOne = (orderId: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  };

  const handleMarkPaid = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`Confirmar pago de comisiones para ${selectedOrderIds.length} venta(s)?`)) return;
    try {
      setProcessing(true);
      const { updated } = await adminApi.sellers.markCommissionsPaid(seller.id, selectedOrderIds);
      alert(`✓ ${updated} comisión(es) marcadas como pagadas.`);
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card label="Comisión total acumulada" value={`USD ${summary.totalCommission.toFixed(2)}`} />
          <Card label="Ya pagada al vendedor" value={`USD ${summary.paid.toFixed(2)}`} />
          <Card label="Pendiente de pago" value={`USD ${summary.pending.toFixed(2)}`} highlight />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-cream/60">Estado:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input max-w-xs">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {selectedOrderIds.length > 0 && (
          <button type="button" onClick={handleMarkPaid} disabled={processing}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {processing ? 'Procesando...' : `Marcar ${selectedOrderIds.length} como pagada${selectedOrderIds.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {error && <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">{error}</div>}

      {!orders && !error && (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded bg-ink-soft/60 animate-pulse" />)}</div>
      )}

      {orders && orders.length === 0 && (
        <p className="text-cream/60 text-sm py-12 text-center">
          Sin ventas {statusFilter ? `con estado "${statusFilter}"` : ''} todavía.
        </p>
      )}

      {orders && orders.length > 0 && (
        <div className="rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                {pendingCommissionOrders.length > 0 && (
                  <th className="text-center py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.length === pendingCommissionOrders.length && pendingCommissionOrders.length > 0}
                      onChange={togglePendingAll}
                      className="accent-gold"
                      title="Seleccionar todas las pendientes"
                    />
                  </th>
                )}
                <th className="text-left py-3 px-4">Cliente</th>
                <th className="text-left py-3 px-4">Servicio</th>
                <th className="text-left py-3 px-4">Fecha servicio</th>
                <th className="text-center py-3 px-4">Estado</th>
                <th className="text-right py-3 px-4">Venta</th>
                <th className="text-right py-3 px-4">Comisión</th>
                <th className="text-center py-3 px-4">Pago al vendedor</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const canSelect = o.status === 'paid' && !o.paid_to_seller_at;
                const selected = selectedOrderIds.includes(o.order_id);
                return (
                  <tr key={o.order_id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                    {pendingCommissionOrders.length > 0 && (
                      <td className="text-center py-3 px-3">
                        {canSelect && (
                          <input type="checkbox" checked={selected} onChange={() => toggleOne(o.order_id)} className="accent-gold" />
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <Link to={`/admin/orders/${o.public_id}`} className="text-cream hover:text-gold">
                        {o.customer_name}
                      </Link>
                      <p className="text-xs text-cream/40">{o.customer_email}</p>
                    </td>
                    <td className="py-3 px-4 text-cream/80">
                      {o.option_name}
                      <p className="text-xs text-cream/40">{o.product_name}</p>
                    </td>
                    <td className="py-3 px-4 text-cream/70 tabular-nums">{o.service_date}</td>
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-3 px-4 text-right text-cream/80 tabular-nums">USD {o.total_usd}</td>
                    <td className="py-3 px-4 text-right text-gold tabular-nums">USD {o.commission_amount_usd}</td>
                    <td className="py-3 px-4 text-center">
                      {o.paid_to_seller_at ? (
                        <span className="text-xs text-gold-soft">
                          ✓ {new Date(o.paid_to_seller_at).toLocaleDateString()}
                        </span>
                      ) : o.status === 'paid' ? (
                        <span className="text-xs text-bordeaux-light">Pendiente</span>
                      ) : (
                        <span className="text-xs text-cream/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
