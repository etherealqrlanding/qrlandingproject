import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type SellerCommission, type SellerCommissionOrder } from '../../lib/sellerApi';
import { useSellerAuth } from '../../hooks/useSellerAuth';

function fmt(usd: number) {
  return `USD ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtArs(ars: number) {
  return `ARS ${ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type DetailState = { loading: boolean; orders: SellerCommissionOrder[] | null; error: string | null };

export default function SellerCommissions() {
  const { me } = useSellerAuth();
  const [commissions, setCommissions] = useState<SellerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, DetailState>>({});

  useEffect(() => {
    sellerApi.commissions()
      .then(setCommissions)
      .catch((err) => setError((err as SellerApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const toggleRow = (date: string) => {
    if (expanded === date) {
      setExpanded(null);
      return;
    }
    setExpanded(date);
    if (detail[date]) return; // ya cargado
    setDetail((prev) => ({ ...prev, [date]: { loading: true, orders: null, error: null } }));
    sellerApi.commissionOrders(date)
      .then((orders) => setDetail((prev) => ({ ...prev, [date]: { loading: false, orders, error: null } })))
      .catch((err) => setDetail((prev) => ({ ...prev, [date]: { loading: false, orders: null, error: (err as SellerApiError).message } })));
  };

  const totalPaid = commissions.reduce((acc, c) => acc + c.total_usd, 0);

  return (
    <div className="p-8 max-w-none">
      <header className="mb-6">
        <h1 className="font-display text-4xl text-cream">Liquidaciones</h1>
        <p className="mt-1 text-sm text-cream/50">
          Historial de pagos de comisiones acreditados a tu cuenta
        </p>
      </header>

      {me && me.commission_pending_usd > 0 && (
        <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 p-4 mb-6 text-sm">
          <p className="text-amber-400 font-medium mb-1">Comisión en proceso</p>
          <p className="text-cream/70">
            Tenés {fmt(me.commission_pending_usd)} pendientes de liquidar. El equipo de Ethereal lo procesa periódicamente.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-6">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : commissions.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-10 text-center text-cream/40">
          Todavía no hay liquidaciones registradas.
          {me && me.commission_pending_usd > 0 && (
            <p className="mt-2 text-cream/30 text-sm">Tu primera liquidación aparecerá aquí cuando sea procesada.</p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gold/10 mb-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10 text-cream/50 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Fecha de pago</th>
                  <th className="text-center px-4 py-3">Ventas incluidas</th>
                  <th className="text-right px-4 py-3">Total USD</th>
                  <th className="text-right px-4 py-3">Total ARS</th>
                  <th className="w-8 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => {
                  const isOpen = expanded === c.paid_date;
                  const d = detail[c.paid_date];
                  return (
                    <>
                      <tr
                        key={c.paid_date}
                        onClick={() => toggleRow(c.paid_date)}
                        className={`border-b border-gold/5 cursor-pointer select-none transition ${isOpen ? 'bg-gold/5' : 'hover:bg-ink-soft/30'}`}
                      >
                        <td className="px-4 py-4 text-cream">{fmtDate(c.paid_date)}</td>
                        <td className="px-4 py-4 text-center text-cream/70">
                          {c.orders_count} {c.orders_count === 1 ? 'venta' : 'ventas'}
                        </td>
                        <td className="px-4 py-4 text-right text-gold font-mono font-medium whitespace-nowrap">{fmt(c.total_usd)}</td>
                        <td className="px-4 py-4 text-right text-cream/60 font-mono whitespace-nowrap">{fmtArs(c.total_ars)}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`text-gold/60 text-xs transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${c.paid_date}-detail`} className="border-b border-gold/10 bg-ink-soft/20">
                          <td colSpan={5} className="px-4 py-4">
                            {d?.loading && (
                              <div className="space-y-2 py-1">
                                {[1, 2].map((i) => (
                                  <div key={i} className="h-10 rounded bg-ink-soft/60 animate-pulse" />
                                ))}
                              </div>
                            )}
                            {d?.error && (
                              <p className="text-sm text-bordeaux-light py-2">{d.error}</p>
                            )}
                            {d?.orders && d.orders.length === 0 && (
                              <p className="text-sm text-cream/40 py-2">No se encontraron órdenes para esta liquidación.</p>
                            )}
                            {d?.orders && d.orders.length > 0 && (
                              <div className="rounded-lg border border-gold/10 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-gold/10 text-cream/40 uppercase tracking-wider">
                                      <th className="text-left px-3 py-2">Reserva</th>
                                      <th className="text-left px-3 py-2">Pasajero</th>
                                      <th className="text-left px-3 py-2">Show / Opción</th>
                                      <th className="text-left px-3 py-2">Pasajeros</th>
                                      <th className="text-left px-3 py-2">Fecha servicio</th>
                                      <th className="text-left px-3 py-2">Compra</th>
                                      <th className="text-left px-3 py-2">Pago</th>
                                      <th className="text-right px-3 py-2">Venta</th>
                                      <th className="text-right px-3 py-2">Comisión</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.orders.map((o) => (
                                      <tr key={o.public_id} className="border-b border-gold/5 last:border-0 hover:bg-ink-soft/30 transition">
                                        <td className="px-3 py-2.5 font-mono text-cream/50">{o.public_id.slice(0, 8).toUpperCase()}</td>
                                        <td className="px-3 py-2.5">
                                          <p className="text-cream/80">{o.customer_name}</p>
                                          {o.customer_phone && <p className="text-cream/40 text-[10px]">{o.customer_phone}</p>}
                                          {o.customer_nationality && <p className="text-cream/35 text-[10px]">{o.customer_nationality}</p>}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <p className="text-cream/80">{o.product_name}</p>
                                          <p className="text-cream/40">{o.option_name}</p>
                                        </td>
                                        <td className="px-3 py-2.5 text-cream/70 whitespace-nowrap text-xs">
                                          {o.adults} ad.{o.children > 0 ? ` · ${o.children} men.` : ''}
                                        </td>
                                        <td className="px-3 py-2.5 text-cream/70 whitespace-nowrap">{fmtDate(o.service_date)}</td>
                                        <td className="px-3 py-2.5 text-cream/50 whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                                        <td className="px-3 py-2.5 text-cream/50 text-xs whitespace-nowrap">
                                          {o.payment_method === 'cash' ? 'Efectivo' : 'Mercado Pago'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono text-cream/80 whitespace-nowrap">{fmt(o.total_usd)}</td>
                                        <td className="px-3 py-2.5 text-right font-mono text-gold whitespace-nowrap">{fmt(o.commission_amount_usd)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gold/20 text-xs text-cream/50">
                  <td colSpan={2} className="px-4 py-3 text-right">Total acreditado</td>
                  <td className="px-4 py-3 text-right text-gold font-mono font-semibold">{fmt(totalPaid)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-cream/30 text-right">{commissions.length} liquidación{commissions.length !== 1 ? 'es' : ''} · Hacé click en una fila para ver el detalle</p>
        </>
      )}
    </div>
  );
}
