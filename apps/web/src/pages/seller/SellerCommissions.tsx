import { Fragment, useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type SellerCommission, type SellerCommissionOrder } from '../../lib/sellerApi';
import { useSellerAuth } from '../../hooks/useSellerAuth';

const PAGE_SIZE = 10;
const SKELETON_KEYS = ['sk-a', 'sk-b', 'sk-c', 'sk-d'];

function fmt(usd: number) {
  return `USD ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtArs(ars: number) {
  return `ARS ${ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
}

type DetailState = { loading: boolean; orders: SellerCommissionOrder[] | null; error: string | null };

// ── Mobile card: una orden dentro de una liquidación ──────────────────────────
function OrderCard({ o }: Readonly<{ o: SellerCommissionOrder }>) {
  return (
    <div className="rounded-lg border border-gold/10 bg-ink/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-cream/90 text-sm font-medium truncate">{o.customer_name}</p>
          {o.customer_nationality && (
            <p className="text-cream/40 text-[10px] mt-0.5">{o.customer_nationality}</p>
          )}
        </div>
        <p className="text-cream/80 font-mono text-sm whitespace-nowrap shrink-0">{fmt(o.total_usd)}</p>
      </div>
      <div>
        <p className="text-cream/70 text-xs">{o.product_name}</p>
        <p className="text-cream/40 text-[10px]">{o.option_name}</p>
      </div>
      <div className="flex items-center justify-between text-[10px] text-cream/50 pt-0.5 border-t border-gold/5">
        <span>{fmtDate(o.service_date)}</span>
        <span>
          {o.adults} ad.{o.children > 0 ? ` · ${o.children} men.` : ''}
          {' · '}
          {o.payment_method === 'cash' ? 'Efectivo' : 'MercadoPago'}
        </span>
        <span className="text-gold font-mono font-medium">{fmt(o.commission_amount_usd)}</span>
      </div>
    </div>
  );
}

// ── Mobile card: una liquidación ──────────────────────────────────────────────
function CommissionCard({
  c, isOpen, onToggle, detailState,
}: Readonly<{
  c: SellerCommission;
  isOpen: boolean;
  onToggle: () => void;
  detailState: DetailState | undefined;
}>) {
  return (
    <div className={`rounded-xl border transition-colors overflow-hidden ${isOpen ? 'border-gold/25 bg-ink-soft/60' : 'border-gold/10 bg-ink-soft/40'}`}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gold/5 transition">
        <div className="flex-1 min-w-0">
          <p className="text-cream text-sm font-medium">{fmtDate(c.paid_date)}</p>
          <p className="text-[10px] text-cream/45 mt-0.5">
            {c.orders_count} {c.orders_count === 1 ? 'venta' : 'ventas'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-gold font-mono font-medium text-sm">{fmt(c.total_usd)}</p>
          <p className="text-[10px] font-mono text-cream/40 mt-0.5">{fmtArs(c.total_ars)}</p>
        </div>
        <span className={`text-gold/50 text-xs transition-transform inline-block shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
      </button>

      {isOpen && (
        <div className="border-t border-gold/10 px-4 py-4">
          {detailState?.loading && (
            <div className="space-y-2">
              {['det-a', 'det-b'].map((k) => (
                <div key={k} className="h-20 rounded-lg bg-ink-soft/60 animate-pulse" />
              ))}
            </div>
          )}
          {detailState?.error && <p className="text-sm text-bordeaux-light py-2">{detailState.error}</p>}
          {detailState?.orders?.length === 0 && (
            <p className="text-sm text-cream/40 py-2">No se encontraron órdenes para esta liquidación.</p>
          )}
          {(detailState?.orders?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-cream/30 mb-3">
                Ventas incluidas ({detailState?.orders?.length})
              </p>
              {detailState?.orders?.map((o) => <OrderCard key={o.public_id} o={o} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Desktop: tabla de detalle de órdenes dentro de una liquidación ─────────────
function DetailTable({ d }: Readonly<{ d: DetailState | undefined }>) {
  if (d?.loading) {
    return (
      <div className="space-y-2 py-1">
        {['det-a', 'det-b'].map((k) => (
          <div key={k} className="h-10 rounded bg-ink-soft/60 animate-pulse" />
        ))}
      </div>
    );
  }
  if (d?.error) return <p className="text-sm text-bordeaux-light py-2">{d.error}</p>;
  if (d?.orders?.length === 0) return <p className="text-sm text-cream/40 py-2">No se encontraron órdenes para esta liquidación.</p>;
  if ((d?.orders?.length ?? 0) === 0) return null;
  return (
    <div className="rounded-lg border border-gold/10 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gold/10 text-cream/40 uppercase tracking-wider">
            <th className="text-left px-3 py-2">Pasajero</th>
            <th className="text-left px-3 py-2">Show / Opción</th>
            <th className="text-left px-3 py-2">Pax</th>
            <th className="text-left px-3 py-2">Fecha</th>
            <th className="text-left px-3 py-2">Pago</th>
            <th className="text-right px-3 py-2">Venta</th>
            <th className="text-right px-3 py-2">Comisión</th>
          </tr>
        </thead>
        <tbody>
          {d?.orders?.map((o) => (
            <tr key={o.public_id} className="border-b border-gold/5 last:border-0 hover:bg-ink-soft/30 transition">
              <td className="px-3 py-2.5">
                <p className="text-cream/80">{o.customer_name}</p>
                {o.customer_nationality && <p className="text-cream/35 text-[10px]">{o.customer_nationality}</p>}
              </td>
              <td className="px-3 py-2.5">
                <p className="text-cream/80">{o.product_name}</p>
                <p className="text-cream/40">{o.option_name}</p>
              </td>
              <td className="px-3 py-2.5 text-cream/70 whitespace-nowrap">
                {o.adults} ad.{o.children > 0 ? ` · ${o.children}` : ''}
              </td>
              <td className="px-3 py-2.5 text-cream/70 whitespace-nowrap">{fmtDate(o.service_date)}</td>
              <td className="px-3 py-2.5 text-cream/50 whitespace-nowrap">
                {o.payment_method === 'cash' ? 'Efectivo' : 'MP'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-cream/80 whitespace-nowrap">{fmt(o.total_usd)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-gold whitespace-nowrap">{fmt(o.commission_amount_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Paginación compartida ─────────────────────────────────────────────────────
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
export default function SellerCommissions() {
  const { me } = useSellerAuth();
  const [commissions, setCommissions] = useState<SellerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, DetailState>>({});
  const [page, setPage] = useState(0);

  useEffect(() => {
    sellerApi.commissions()
      .then(setCommissions)
      .catch((err) => setError((err as SellerApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const toggleRow = (date: string) => {
    if (expanded === date) { setExpanded(null); return; }
    setExpanded(date);
    if (detail[date]) return;
    setDetail((prev) => ({ ...prev, [date]: { loading: true, orders: null, error: null } }));
    sellerApi.commissionOrders(date)
      .then((orders) => setDetail((prev) => ({ ...prev, [date]: { loading: false, orders, error: null } })))
      .catch((err) => setDetail((prev) => ({ ...prev, [date]: { loading: false, orders: null, error: (err as SellerApiError).message } })));
  };

  const handlePageChange = (newPage: number) => { setPage(newPage); setExpanded(null); };

  const totalPaid = commissions.reduce((acc, c) => acc + c.total_usd, 0);
  const totalPages = Math.ceil(commissions.length / PAGE_SIZE);
  const paginated = commissions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  let mainContent: React.ReactNode;
  if (loading) {
    mainContent = (
      <div className="space-y-3">
        {SKELETON_KEYS.map((k) => (
          <div key={k} className="h-[72px] rounded-xl bg-ink-soft/60 animate-pulse" />
        ))}
      </div>
    );
  } else if (commissions.length === 0) {
    const pendingNote = (me?.commission_pending_usd ?? 0) > 0
      ? <p className="mt-2 text-cream/30 text-sm">Tu primera liquidación aparecerá aquí cuando sea procesada.</p>
      : null;
    mainContent = (
      <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-10 text-center text-cream/40">
        Todavía no hay liquidaciones registradas.
        {pendingNote}
      </div>
    );
  } else {
    const pluralSuffix = commissions.length === 1 ? '' : 'es';
    mainContent = (
      <>
        {/* ── Mobile: cards ── */}
        <div className="md:hidden space-y-3 mb-4">
          {paginated.map((c) => (
            <CommissionCard
              key={c.paid_date}
              c={c}
              isOpen={expanded === c.paid_date}
              onToggle={() => toggleRow(c.paid_date)}
              detailState={detail[c.paid_date]}
            />
          ))}
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="hidden md:block rounded-xl border border-gold/10 mb-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gold/10 text-cream/50 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Fecha de pago</th>
                <th className="text-center px-4 py-3">Ventas</th>
                <th className="text-right px-4 py-3">USD</th>
                <th className="text-right px-4 py-3">ARS</th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((c) => {
                const isOpen = expanded === c.paid_date;
                return (
                  <Fragment key={c.paid_date}>
                    <tr
                      onClick={() => toggleRow(c.paid_date)}
                      className={`border-b border-gold/5 cursor-pointer select-none transition ${isOpen ? 'bg-gold/5' : 'hover:bg-ink-soft/30'}`}
                    >
                      <td className="px-4 py-3 text-cream">{fmtDate(c.paid_date)}</td>
                      <td className="px-4 py-3 text-center text-cream/70 text-xs">
                        {c.orders_count} {c.orders_count === 1 ? 'venta' : 'ventas'}
                      </td>
                      <td className="px-4 py-3 text-right text-gold font-mono font-medium whitespace-nowrap">{fmt(c.total_usd)}</td>
                      <td className="px-4 py-3 text-right text-cream/60 font-mono whitespace-nowrap text-xs">{fmtArs(c.total_ars)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-gold/60 text-xs transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-gold/10 bg-ink-soft/20">
                        <td colSpan={5} className="px-4 py-4">
                          <DetailTable d={detail[c.paid_date]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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

        {/* ── Pie: total mobile + paginación ── */}
        <div className="flex items-center justify-between gap-4 mt-2">
          <p className="text-xs text-cream/40 md:hidden">
            Total: <span className="text-gold font-mono font-semibold">{fmt(totalPaid)}</span>
          </p>
          <p className="text-xs text-cream/40 hidden md:block">
            {commissions.length} liquidación{pluralSuffix}
          </p>
          <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
        </div>
        <p className="text-xs text-cream/25 text-right mt-2 md:hidden">
          {commissions.length} liquidación{pluralSuffix} · Tocá para ver el detalle
        </p>
      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <header className="mb-4 md:mb-6">
        <h1 className="font-display text-3xl md:text-4xl text-cream">Liquidaciones</h1>
        <p className="mt-0.5 text-xs md:text-sm text-cream/50">
          Historial de pagos de comisiones acreditados a tu cuenta
        </p>
      </header>

      {me && me.commission_pending_usd > 0 && (
        <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 p-3 md:p-4 mb-4 md:mb-6 text-sm">
          <p className="text-amber-400 font-medium mb-1">Comisión en proceso</p>
          <p className="text-cream/70 text-xs md:text-sm">
            Tenés {fmt(me.commission_pending_usd)} pendientes de liquidar. El equipo de ticketstangoshow lo procesa periódicamente.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-6">{error}</div>
      )}

      {mainContent}
    </div>
  );
}
