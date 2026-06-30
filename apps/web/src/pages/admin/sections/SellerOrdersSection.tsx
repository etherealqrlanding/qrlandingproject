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

  // Una orden está "pendiente de liquidar" según su método:
  //  - MP   → todavía no le pagamos la comisión al vendedor (paid_to_seller_at NULL)
  //  - Cash → el vendedor todavía no nos rindió el neto (net_settled_at NULL)
  const isPendingSettlement = (o: AdminSellerOrder) =>
    o.status === 'paid' &&
    (o.payment_method === 'cash' ? !o.net_settled_at : !o.paid_to_seller_at);

  const pendingSettlementOrders = useMemo(
    () => (orders ?? []).filter(isPendingSettlement),
    [orders],
  );

  const summary = useMemo(() => {
    if (!orders) return null;
    return orders.reduce((acc, o) => {
      if (o.status === 'paid') {
        acc.totalCommission += o.commission_amount_usd ?? 0;
        if (o.payment_method === 'cash') {
          // Efectivo: nos deben rendir el neto
          if (!o.net_settled_at) acc.netToCollect += o.net_total_usd ?? 0;
        } else if (o.paid_to_seller_at) {
          acc.paid += o.commission_amount_usd ?? 0;
        } else {
          acc.pending += o.commission_amount_usd ?? 0;
        }
      }
      return acc;
    }, { totalCommission: 0, paid: 0, pending: 0, netToCollect: 0 });
  }, [orders]);

  const togglePendingAll = () => {
    if (selectedOrderIds.length === pendingSettlementOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(pendingSettlementOrders.map((o) => o.order_id));
    }
  };

  const toggleOne = (orderId: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  };

  const handleSettle = async () => {
    if (selectedOrderIds.length === 0 || !orders) return;
    const byId = new Map(orders.map((o) => [o.order_id, o]));
    const mpIds = selectedOrderIds.filter((id) => byId.get(id)?.payment_method !== 'cash');
    const cashIds = selectedOrderIds.filter((id) => byId.get(id)?.payment_method === 'cash');
    if (!confirm(
      `Liquidar ${selectedOrderIds.length} venta(s)?\n` +
      `• ${mpIds.length} por Mercado Pago: marcamos la comisión como pagada al vendedor.\n` +
      `• ${cashIds.length} en efectivo: marcamos el neto como rendido por el vendedor.`,
    )) return;
    try {
      setProcessing(true);
      let updated = 0;
      if (mpIds.length > 0) updated += (await adminApi.sellers.markCommissionsPaid(seller.id, mpIds)).updated;
      if (cashIds.length > 0) updated += (await adminApi.sellers.markNetSettled(seller.id, cashIds)).updated;
      alert(`✓ ${updated} venta(s) liquidadas.`);
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Comisión total" value={`USD ${summary.totalCommission.toFixed(2)}`} />
          <Card label="Ya pagada (MP)" value={`USD ${summary.paid.toFixed(2)}`} />
          <Card label="A pagar (MP)" value={`USD ${summary.pending.toFixed(2)}`} highlight />
          <Card label="A cobrar neto (efectivo)" value={`USD ${summary.netToCollect.toFixed(2)}`} />
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
          <button type="button" onClick={handleSettle} disabled={processing}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {processing ? 'Procesando...' : `Liquidar ${selectedOrderIds.length} venta${selectedOrderIds.length !== 1 ? 's' : ''}`}
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
                {pendingSettlementOrders.length > 0 && (
                  <th className="text-center py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.length === pendingSettlementOrders.length && pendingSettlementOrders.length > 0}
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
                <th className="text-center py-3 px-4">Liquidación</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const canSelect = isPendingSettlement(o);
                const selected = selectedOrderIds.includes(o.order_id);
                const settledAt = o.payment_method === 'cash' ? o.net_settled_at : o.paid_to_seller_at;
                return (
                  <tr key={o.order_id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                    {pendingSettlementOrders.length > 0 && (
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
                    <td className="py-3 px-4 text-right text-gold tabular-nums">
                      USD {o.commission_amount_usd}
                      {o.payment_method === 'cash' && (
                        <span className="block text-[10px] text-cream/40">neto a cobrar: USD {o.net_total_usd ?? 0}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {settledAt ? (
                        <span className="text-xs text-emerald-400">
                          ✓ {new Date(settledAt).toLocaleDateString()}
                          <span className="block text-[10px] text-cream/40">{o.payment_method === 'cash' ? 'neto rendido' : 'comisión pagada'}</span>
                        </span>
                      ) : o.status === 'paid' ? (
                        <span className="text-xs text-bordeaux-light">{o.payment_method === 'cash' ? 'Neto pendiente' : 'Pago pendiente'}</span>
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
    expired: 'text-cream/40 border-cream/15 bg-cream/5',
    refunded: 'text-cream/60 border-cream/20 bg-cream/5',
  }[status] ?? 'text-cream/60 border-cream/20';
  const label = { paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', cancelled: 'Cancelada', expired: 'Caducada', refunded: 'Reintegrada' }[status] ?? status;
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
