import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminSeller, type AdminSellerOrder } from '../../../lib/adminApi';
import Checkbox from '../../../components/Checkbox';

interface Props { seller: AdminSeller; }

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'failed', label: 'Fallidas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'refunded', label: 'Reintegradas' },
];

const SETTLEMENT_OPTIONS: { value: '' | 'pending' | 'settled'; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendientes de liquidar' },
  { value: 'settled', label: 'Ya rendidas' },
];

export default function SellerOrdersSection({ seller }: Props) {
  const [orders, setOrders] = useState<AdminSellerOrder[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('paid');
  const [settlementFilter, setSettlementFilter] = useState<'' | 'pending' | 'settled'>('');
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);

  // Acordeón: detalle de la orden para reconocerla al momento de liquidar (solo
  // lectura — igual que en el listado general de órdenes del admin).
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const load = async () => {
    try {
      setError(null);
      const data = await adminApi.sellers.orders(seller.id, statusFilter || undefined, settlementFilter || undefined);
      setOrders(data);
      setSelectedOrderIds([]);
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.id, statusFilter, settlementFilter]);

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
        if (o.payment_method === 'cash') {
          // Efectivo: no hay comisión trazada; nos deben rendir el neto (en ARS)
          if (!o.net_settled_at) acc.netToCollect += (o.net_total_usd ?? 0) * o.exchange_rate_used;
        } else {
          acc.totalCommission += o.commission_amount_ars ?? 0;
          if (o.paid_to_seller_at) {
            acc.paid += o.commission_amount_ars ?? 0;
          } else {
            acc.pending += o.commission_amount_ars ?? 0;
          }
        }
      }
      return acc;
    }, { totalCommission: 0, paid: 0, pending: 0, netToCollect: 0 });
  }, [orders]);

  // Total de lo tildado, en vivo — así el admin va viendo cuánto va a liquidar antes
  // de confirmar, sumado por separado (MP = comisión, efectivo = neto) porque son
  // conceptos distintos aunque las dos se muestren en pesos.
  const selectedTotal = useMemo(() => {
    if (!orders) return { mpArs: 0, cashArs: 0, mpCount: 0, cashCount: 0 };
    const byId = new Map(orders.map((o) => [o.order_id, o]));
    return selectedOrderIds.reduce((acc, id) => {
      const o = byId.get(id);
      if (!o) return acc;
      if (o.payment_method === 'cash') {
        acc.cashArs += (o.net_total_usd ?? 0) * o.exchange_rate_used;
        acc.cashCount++;
      } else {
        acc.mpArs += o.commission_amount_ars ?? 0;
        acc.mpCount++;
      }
      return acc;
    }, { mpArs: 0, cashArs: 0, mpCount: 0, cashCount: 0 });
  }, [selectedOrderIds, orders]);

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
    const totalArs = Math.round(selectedTotal.mpArs + selectedTotal.cashArs).toLocaleString('es-AR');
    if (!confirm(
      `Liquidar ${selectedOrderIds.length} venta(s) por un total de ARS ${totalArs}?\n` +
      `• ${mpIds.length} por Mercado Pago (ARS ${Math.round(selectedTotal.mpArs).toLocaleString('es-AR')}): marcamos la comisión como pagada al vendedor.\n` +
      `• ${cashIds.length} en efectivo (ARS ${Math.round(selectedTotal.cashArs).toLocaleString('es-AR')}): marcamos el neto como rendido por el vendedor.`,
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
          <Card label="Comisión total (MP)" value={`ARS ${Math.round(summary.totalCommission).toLocaleString('es-AR')}`} sub="todas las ventas pagadas por Mercado Pago" />
          <Card label="Ya pagada (MP)" value={`ARS ${Math.round(summary.paid).toLocaleString('es-AR')}`} sub="comisión ya liquidada al vendedor" />
          <Card label="A pagar (MP)" value={`ARS ${Math.round(summary.pending).toLocaleString('es-AR')}`} sub="comisión pendiente de liquidar" highlight />
          <Card label="A cobrar neto (efectivo)" value={`ARS ${Math.round(summary.netToCollect).toLocaleString('es-AR')}`} sub="lo que el vendedor todavía nos tiene que rendir" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-cream/60">Estado:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input max-w-xs">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="text-sm text-cream/60">Liquidación:</label>
          <select
            value={settlementFilter}
            onChange={(e) => setSettlementFilter(e.target.value as '' | 'pending' | 'settled')}
            className="input max-w-xs"
          >
            {SETTLEMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {selectedOrderIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-cream/70">
              <span className="text-gold font-mono font-semibold">
                ARS {Math.round(selectedTotal.mpArs + selectedTotal.cashArs).toLocaleString('es-AR')}
              </span>
              {' '}total a liquidar
              {selectedTotal.mpCount > 0 && selectedTotal.cashCount > 0 && (
                <span className="block text-[11px] text-cream/40">
                  MP: ARS {Math.round(selectedTotal.mpArs).toLocaleString('es-AR')} · Efectivo: ARS {Math.round(selectedTotal.cashArs).toLocaleString('es-AR')}
                </span>
              )}
            </div>
            <button type="button" onClick={handleSettle} disabled={processing}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {processing ? 'Procesando...' : `Liquidar ${selectedOrderIds.length} venta${selectedOrderIds.length !== 1 ? 's' : ''}`}
            </button>
          </div>
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
        <>
          {/* ── Mobile: tarjetas — esta pantalla se usa para liquidar desde el celular ── */}
          <div className="md:hidden space-y-2">
            {pendingSettlementOrders.length > 0 && (
              <button
                type="button"
                onClick={togglePendingAll}
                className="w-full text-left text-xs text-gold-soft hover:text-gold px-1 py-1"
              >
                {selectedOrderIds.length === pendingSettlementOrders.length
                  ? '☑ Destildar todas las pendientes'
                  : `☐ Tildar las ${pendingSettlementOrders.length} pendiente${pendingSettlementOrders.length !== 1 ? 's' : ''}`}
              </button>
            )}
            {orders.map((o) => {
              const canSelect = isPendingSettlement(o);
              const selected = selectedOrderIds.includes(o.order_id);
              const settledAt = o.payment_method === 'cash' ? o.net_settled_at : o.paid_to_seller_at;
              const amount = o.payment_method === 'cash'
                ? Math.round((o.net_total_usd ?? 0) * o.exchange_rate_used)
                : Math.round(o.commission_amount_ars ?? 0);
              return (
                <div
                  key={o.order_id}
                  onClick={() => canSelect && toggleOne(o.order_id)}
                  className={`rounded-xl border p-3 transition ${canSelect ? 'cursor-pointer active:scale-[0.99]' : ''} ${
                    selected
                      ? 'border-gold/50 bg-gold/10'
                      : settledAt
                        ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
                        : 'border-gold/10 bg-ink-soft/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {canSelect && (
                      <div onClick={(e) => e.stopPropagation()} className="pt-0.5 shrink-0">
                        <Checkbox checked={selected} onChange={() => toggleOne(o.order_id)} aria-label="Seleccionar venta" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/admin/orders/${o.public_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-cream hover:text-gold text-sm font-medium truncate"
                        >
                          {o.customer_name}
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={o.status} />
                          <ExpandToggle
                            open={expandedOrderId === o.order_id}
                            onClick={() => setExpandedOrderId(expandedOrderId === o.order_id ? null : o.order_id)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-cream/40 truncate">{o.customer_email}</p>
                      <p className="text-xs text-cream/70 mt-1">{o.option_name}</p>
                      <p className="text-[11px] text-cream/40">{o.product_name} · {o.service_date}</p>

                      <div className="flex items-end justify-between gap-2 mt-2 pt-2 border-t border-gold/10">
                        <div>
                          {o.payment_method !== 'cash' && (
                            <p className="text-[10px] text-cream/40">Venta ARS {Math.round(o.total_ars).toLocaleString('es-AR')}</p>
                          )}
                          <p className="text-gold font-mono text-sm font-semibold">
                            ARS {amount.toLocaleString('es-AR')}
                            <span className="ml-1 text-[10px] font-normal text-cream/40">
                              {o.payment_method === 'cash' ? 'neto a cobrar' : 'comisión'}
                            </span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {settledAt ? (
                            <span className="inline-flex flex-col items-end text-[10px] text-emerald-400">
                              ✓ {new Date(settledAt).toLocaleDateString()}
                              <span className="text-emerald-400/70">{o.payment_method === 'cash' ? 'neto rendido' : 'comisión pagada'}</span>
                            </span>
                          ) : o.status === 'paid' ? (
                            <span className="text-[10px] text-bordeaux-light">{o.payment_method === 'cash' ? 'Neto pendiente' : 'Pago pendiente'}</span>
                          ) : null}
                        </div>
                      </div>

                      {expandedOrderId === o.order_id && (
                        <div onClick={(e) => e.stopPropagation()} className="mt-2 pt-2 border-t border-gold/10">
                          <SettleOrderExtraDetails o={o} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop: tabla ── */}
          <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                {pendingSettlementOrders.length > 0 && (
                  <th className="text-center py-3 px-3 w-10">
                    <Checkbox
                      checked={selectedOrderIds.length === pendingSettlementOrders.length && pendingSettlementOrders.length > 0}
                      indeterminate={selectedOrderIds.length > 0 && selectedOrderIds.length < pendingSettlementOrders.length}
                      onChange={togglePendingAll}
                      aria-label="Seleccionar todas las pendientes"
                    />
                  </th>
                )}
                <th className="text-left py-3 px-4">Cliente</th>
                <th className="text-left py-3 px-4">Servicio</th>
                <th className="text-left py-3 px-4">Fecha servicio</th>
                <th className="text-center py-3 px-4">Estado</th>
                <th className="text-right py-3 px-4">Venta</th>
                <th className="text-right py-3 px-4">Comisión / Neto</th>
                <th className="text-center py-3 px-4">Liquidación</th>
                <th className="py-3 px-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const canSelect = isPendingSettlement(o);
                const selected = selectedOrderIds.includes(o.order_id);
                const settledAt = o.payment_method === 'cash' ? o.net_settled_at : o.paid_to_seller_at;
                return (
                  <Fragment key={o.order_id}>
                  <tr
                    className={`border-t transition-all duration-200 ${
                      settledAt
                        ? 'border-emerald-500/10 bg-emerald-500/[0.06] hover:bg-emerald-500/10 hover:shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]'
                        : 'border-gold/5 hover:bg-gold/5 hover:shadow-[inset_0_0_0_1px_rgba(200,168,90,0.35)]'
                    }`}
                  >
                    {pendingSettlementOrders.length > 0 && (
                      <td className="text-center py-3 px-3">
                        {canSelect && (
                          <Checkbox checked={selected} onChange={() => toggleOne(o.order_id)} aria-label="Seleccionar venta" />
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
                    <td className="py-3 px-4 text-right text-cream/80 tabular-nums">
                      {o.payment_method === 'cash'
                        ? <span className="text-cream/30">—</span>
                        : `ARS ${Math.round(o.total_ars).toLocaleString('es-AR')}`}
                    </td>
                    <td className="py-3 px-4 text-right text-gold tabular-nums">
                      {o.payment_method === 'cash' ? (
                        <>
                          ARS {Math.round((o.net_total_usd ?? 0) * o.exchange_rate_used).toLocaleString('es-AR')}
                          <span className="block text-[10px] text-cream/40">neto a cobrar</span>
                        </>
                      ) : (
                        `ARS ${Math.round(o.commission_amount_ars).toLocaleString('es-AR')}`
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {settledAt ? (
                        <span className="inline-flex flex-col items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                          ✓ {new Date(settledAt).toLocaleDateString()}
                          <span className="text-[10px] text-emerald-400/70">{o.payment_method === 'cash' ? 'neto rendido' : 'comisión pagada'}</span>
                        </span>
                      ) : o.status === 'paid' ? (
                        <span className="text-xs text-bordeaux-light">{o.payment_method === 'cash' ? 'Neto pendiente' : 'Pago pendiente'}</span>
                      ) : (
                        <span className="text-xs text-cream/30">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <ExpandToggle
                        open={expandedOrderId === o.order_id}
                        onClick={() => setExpandedOrderId(expandedOrderId === o.order_id ? null : o.order_id)}
                      />
                    </td>
                  </tr>
                  {expandedOrderId === o.order_id && (
                    <tr className="border-t border-gold/5 bg-ink-soft/20">
                      <td colSpan={9} className="px-6 py-3">
                        <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Detalle</p>
                        <div className="max-w-sm">
                          <SettleOrderExtraDetails o={o} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
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

function Card({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/60'}`}>
      <p className="text-xs uppercase tracking-widest text-gold-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-cream/40">{sub}</p>}
    </div>
  );
}

function DetailRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-cream/40 shrink-0">{label}</span>
      <span className="text-cream/80 text-right">{children}</span>
    </div>
  );
}

function ExpandToggle({ open, onClick }: Readonly<{ open: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={open ? 'Ocultar detalle' : 'Ver detalle'}
      aria-expanded={open}
      className="text-gold-soft hover:text-gold text-xs shrink-0 inline-flex items-center gap-1"
    >
      <span className={`inline-block transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
    </button>
  );
}

const PAYMENT_LABEL: Record<string, string> = { mercadopago: 'Mercado Pago', cash: 'Efectivo' };

// Detalle para reconocer la orden al momento de liquidar — solo lectura, no repite
// lo que ya se ve en la fila/tarjeta (cliente, servicio, monto, estado).
function SettleOrderExtraDetails({ o }: Readonly<{ o: AdminSellerOrder }>) {
  return (
    <div className="space-y-1.5">
      {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
      {o.customer_nationality && <DetailRow label="Nacionalidad">{o.customer_nationality}</DetailRow>}
      <DetailRow label="Pasajeros">{o.adults} ad.{o.children ? ` · ${o.children} men.` : ''}</DetailRow>
      <DetailRow label="Medio de pago">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
      {o.payment_method === 'cash' && o.cash_collected_currency && (
        <DetailRow label="Cobrado en">{o.cash_collected_currency === 'USD' ? 'Dólares (USD)' : 'Pesos (ARS)'}</DetailRow>
      )}
      <DetailRow label="Compra">{new Date(o.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</DetailRow>
      <DetailRow label="Referencia"><span className="font-mono">{o.public_id.slice(0, 12).toUpperCase()}</span></DetailRow>
    </div>
  );
}
