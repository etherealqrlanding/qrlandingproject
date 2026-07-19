import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, type AdminOrderListItem } from '../../lib/adminApi';
import { NEW_ORDER_PAID_EVENT } from '../../components/admin/AdminLayout';
import Checkbox from '../../components/Checkbox';



const PAGE_SIZE = 10;
const SKELETON_KEYS = ['sk-a', 'sk-b', 'sk-c', 'sk-d', 'sk-e'];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'paid', label: 'Pagada' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'failed', label: 'Fallida' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'expired', label: 'Caducada' },
  { value: 'refunded', label: 'Reintegrada' },
];

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function fmtShortDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtServiceDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// "Total" de la tabla: Mercado Pago SIEMPRE cobra en pesos (no hay forma de que un
// pago por MP en Argentina sea en dólares), así que se muestra en ARS — mostrarlo en
// USD era solo la referencia interna, no lo que realmente se movió. Para efectivo no
// cobramos nada directamente — lo que importa es el NETO que el vendedor nos tiene
// que rendir, en la moneda en la que lo cobró (dólares si ya se cobró en dólares, pesos
// en cualquier otro caso). Mismo criterio que ya usa el detalle de la orden y el portal
// del vendedor.
function orderTotalDisplay(o: AdminOrderListItem): string {
  if (o.payment_method !== 'cash') return `ARS ${Math.round(o.total_ars).toLocaleString('es-AR')}`;
  if (o.net_total_usd != null && o.cash_collected_currency === 'USD') {
    return `USD ${o.net_total_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const netArs = o.net_total_usd != null ? o.net_total_usd * o.exchange_rate_used : o.total_ars;
  return `ARS ${Math.round(netArs).toLocaleString('es-AR')}`;
}

function DetailRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-cream/40 shrink-0">{label}</span>
      <span className="text-cream/80 text-right">{children}</span>
    </div>
  );
}

// Ícono de expandir/contraer, chevron que rota — mismo gesto en mobile y desktop.
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

// Detalle inline de la orden — solo lectura. Las acciones (reintegrar, modificar,
// confirmar cobro, etc.) siguen viviendo únicamente en el detalle completo ("Ver →");
// esto es para monitorear sin salir del listado.
const PAYMENT_LABEL: Record<string, string> = { mercadopago: 'Mercado Pago', cash: 'Efectivo' };

function OrderExtraDetails({ o, twoColumns }: Readonly<{ o: AdminOrderListItem; twoColumns?: boolean }>) {
  return (
    <div className={twoColumns ? 'grid sm:grid-cols-2 gap-x-8 gap-y-1.5' : 'space-y-1.5'}>
      {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
      {o.customer_nationality && <DetailRow label="Nacionalidad">{o.customer_nationality}</DetailRow>}
      {(o.adults != null) && (
        <DetailRow label="Pasajeros">{o.adults} ad.{o.children ? ` · ${o.children} men.` : ''}</DetailRow>
      )}
      <DetailRow label="Medio de pago">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
      {o.payment_method !== 'cash' && o.mp_payment_status && (
        <DetailRow label="Estado MP">{o.mp_payment_status}</DetailRow>
      )}
      {o.payment_method !== 'cash' && o.mp_payment_id && (
        <DetailRow label="Payment ID"><span className="font-mono">{o.mp_payment_id}</span></DetailRow>
      )}
      <DetailRow label="Creada">{fmtShortDateTime(o.created_at)}</DetailRow>
      {o.paid_at && <DetailRow label="Pagada">{fmtShortDateTime(o.paid_at)}</DetailRow>}
      <DetailRow label="Referencia"><span className="font-mono">{o.public_id.slice(0, 12).toUpperCase()}</span></DetailRow>
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const color = {
    paid: 'text-gold border-gold/40 bg-gold/10',
    pending: 'text-gold-soft border-gold-soft/30 bg-gold-soft/5',
    failed: 'text-bordeaux-light border-bordeaux-light/40 bg-bordeaux-deep/20',
    cancelled: 'text-cream/50 border-cream/20 bg-cream/5',
    expired: 'text-cream/40 border-cream/15 bg-cream/5',
    refunded: 'text-cream/60 border-cream/20 bg-cream/5',
  }[status] ?? 'text-cream/60 border-cream/20';
  const label = {
    paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', cancelled: 'Cancelada', expired: 'Caducada', refunded: 'Reintegrada',
  }[status] ?? status;
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}

function SummaryCard({ label, value, sub, highlight }: Readonly<{ label: string; value: string; sub?: string; highlight?: boolean }>) {
  return (
    <div className={`rounded-lg border p-3 md:p-4 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/60'}`}>
      <p className="text-[10px] uppercase tracking-widest text-gold-soft">{label}</p>
      <p className={`mt-0.5 font-display text-xl md:text-2xl ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-cream/40 hidden sm:block">{sub}</p>}
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function OrderCard({ o, selected, onToggle, highlighted, expanded, onToggleExpand }: Readonly<{
  o: AdminOrderListItem; selected: boolean; onToggle: () => void; highlighted?: boolean;
  expanded: boolean; onToggleExpand: () => void;
}>) {
  return (
    <div
      id={`order-row-mobile-${o.public_id}`}
      className={`rounded-xl border transition overflow-hidden ${highlighted ? 'ring-2 ring-inset ring-gold/60 border-gold/60' : selected ? 'border-gold/50 bg-gold/5' : 'border-gold/10 bg-ink-soft/40 hover:bg-ink-soft/60'}`}
    >
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Checkbox
            checked={selected}
            onChange={onToggle}
            aria-label={`Seleccionar orden de ${o.customer_name}`}
          />
          <span className="text-[10px] text-cream/40 tabular-nums">{fmtShortDateTime(o.created_at)}</span>
          <StatusBadge status={o.status} />
          {!o.admin_viewed_at && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gold text-ink bg-gold font-semibold">🆕 Nueva</span>
          )}
          {o.payment_method === 'cash' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-gold/30 text-gold-soft bg-gold/5">
              Efectivo{o.cash_collected_currency ? ` · ${o.cash_collected_currency}` : ''}
            </span>
          )}
        </div>
        <p className="text-gold font-mono font-medium text-sm whitespace-nowrap shrink-0">{orderTotalDisplay(o)}</p>
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
            {o.payment_method !== 'cash' && o.commission_amount_ars != null && (
              <span className="text-[10px] text-gold font-mono">Com. ARS {Math.round(o.commission_amount_ars).toLocaleString('es-AR')}</span>
            )}
            <Link to={`/admin/orders/${o.public_id}`} className="text-xs text-gold-soft hover:text-gold transition">Ver →</Link>
            <ExpandToggle open={expanded} onClick={onToggleExpand} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gold/10 px-4 py-3 bg-ink-soft/20">
          <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Detalle</p>
          <OrderExtraDetails o={o} />
        </div>
      )}
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

// ── Barra flotante de selección ───────────────────────────────────────────────
function SelectionBar({
  count, onClear, onDelete, confirming, onConfirm, onCancelConfirm, deleting,
}: Readonly<{
  count: number;
  onClear: () => void;
  onDelete: () => void;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  deleting: boolean;
}>) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3 bg-ink border-t border-gold/20 shadow-2xl md:px-8">
      {!confirming ? (
        <>
          <p className="text-sm text-cream">
            <span className="font-semibold text-gold">{count}</span> {count === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClear} className="text-xs text-cream/50 hover:text-cream transition">
              Deseleccionar todo
            </button>
            <button type="button" onClick={onDelete}
              className="px-4 py-1.5 rounded-md bg-ink-soft border border-gold/30 text-cream/70 text-xs font-medium hover:bg-gold/10 hover:text-cream transition">
              Archivar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-cream/80">
            ¿Archivar <span className="font-semibold text-gold">{count} {count === 1 ? 'orden' : 'órdenes'}</span>?
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onCancelConfirm} disabled={deleting}
              className="text-xs text-cream/50 hover:text-cream transition disabled:opacity-40">
              Cancelar
            </button>
            <button type="button" onClick={onConfirm} disabled={deleting}
              className="px-4 py-1.5 rounded-md bg-gold/20 border border-gold/40 text-cream text-xs font-bold hover:bg-gold/30 transition disabled:opacity-60">
              {deleting ? 'Archivando…' : 'Sí, archivar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function OrdersList() {
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');
  const [orders, setOrders] = useState<AdminOrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', ref: '', from: '', to: '', search: '' });
  const [page, setPage] = useState(0);

  // Selección
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Acordeón: qué orden está desplegada mostrando más detalle inline (solo lectura —
  // las acciones siguen viviendo en el detalle completo vía "Ver →").
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const reload = (currentFilters = filters) => {
    setOrders(null);
    setError(null);
    const params = Object.fromEntries(Object.entries(currentFilters).filter(([, v]) => v));
    adminApi.orders.list(params)
      .then(setOrders)
      .catch((err) => setError((err as Error).message));
  };

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    setConfirming(false);
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Push en vivo (AdminLayout): si entró una orden nueva pagada mientras el admin ya
  // está mirando esta pantalla, se refresca sola — sin esperar a que recargue a mano.
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(NEW_ORDER_PAID_EVENT, handler);
    return () => window.removeEventListener(NEW_ORDER_PAID_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Venimos del detalle de una orden (?highlight=<public_id>): saltamos a la página
  // donde está y la resaltamos, para que el admin/vendedor no la pierda de vista.
  useEffect(() => {
    if (!highlight || !orders) return;
    const idx = orders.findIndex((o) => o.public_id === highlight);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
  }, [highlight, orders]);

  useEffect(() => {
    if (!highlight || !orders) return;
    const t = setTimeout(() => {
      document.getElementById(`order-row-desktop-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById(`order-row-mobile-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(t);
  }, [highlight, orders, page]);

  const summary = useMemo(() => {
    if (!orders) return null;
    return orders.reduce((acc, o) => {
      acc.count++;
      if (o.status === 'paid') {
        acc.paidCount++;
        // Facturación/comisiones: solo MP (siempre en pesos — no hay pago por MP en
        // otra moneda). En efectivo no trazamos venta ni comisión.
        if (o.payment_method !== 'cash') {
          acc.revenue += o.total_ars ?? 0;
          acc.commission += o.commission_amount_ars ?? 0;
        } else if (!o.net_settled_at) {
          // Neto que el vendedor todavía nos tiene que rendir por ventas en efectivo
          // ya pagadas. Normalizamos todo a ARS (algunos se cobraron en dólares) para
          // poder sumarlos en un solo total.
          const netArs = o.net_total_usd != null ? o.net_total_usd * o.exchange_rate_used : o.total_ars;
          acc.netPending += netArs ?? 0;
          acc.netPendingCount++;
        }
      }
      return acc;
    }, { count: 0, paidCount: 0, revenue: 0, commission: 0, netPending: 0, netPendingCount: 0 });
  }, [orders]);

  const totalPages = Math.ceil((orders?.length ?? 0) / PAGE_SIZE);
  const paginated = orders?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const pageIds = paginated.map((o) => o.public_id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleSelect(publicId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId); else next.add(publicId);
      return next;
    });
  }

  async function handleBulkDelete() {
    setDeleting(true);
    try {
      await adminApi.orders.bulkArchive(Array.from(selected));
      setSelected(new Set());
      setConfirming(false);
      reload();
    } catch (err) {
      setError((err as Error).message);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

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
          {paginated.map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              selected={selected.has(o.public_id)}
              onToggle={() => toggleSelect(o.public_id)}
              highlighted={o.public_id === highlight}
              expanded={expandedRow === o.public_id}
              onToggleExpand={() => setExpandedRow(expandedRow === o.public_id ? null : o.public_id)}
            />
          ))}
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-8">
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todas las órdenes de esta página"
                  />
                </th>
                <th className="text-left py-3 px-3 whitespace-nowrap">Fecha</th>
                <th className="text-left py-3 px-3">Cliente</th>
                <th className="text-left py-3 px-3">Servicio</th>
                <th className="text-left py-3 px-3">Vendedor</th>
                <th className="text-center py-3 px-3">Estado</th>
                <th className="text-right py-3 px-3">Total / Neto</th>
                <th className="text-right py-3 px-3">Comisión</th>
                <th className="py-3 px-3" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((o) => (
                <Fragment key={o.id}>
                <tr
                  id={`order-row-desktop-${o.public_id}`}
                  className={`border-t border-gold/5 transition cursor-pointer ${
                    o.public_id === highlight
                      ? 'bg-gold/10 border-y-2 border-y-gold/60'
                      : selected.has(o.public_id) ? 'bg-gold/5' : 'hover:bg-gold/5 hover:shadow-[inset_0_0_0_1px_rgba(200,168,90,0.35)]'
                  }`}
                  onClick={() => toggleSelect(o.public_id)}
                >
                  <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(o.public_id)}
                      onChange={() => toggleSelect(o.public_id)}
                      aria-label={`Seleccionar orden de ${o.customer_name}`}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-cream/60 text-xs tabular-nums whitespace-nowrap">
                    <p>{fmtShortDate(o.created_at)}</p>
                    <p className="text-[10px] text-cream/35">{fmtTime(o.created_at)}</p>
                  </td>
                  <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                    <Link to={`/admin/orders/${o.public_id}`} className="text-cream hover:text-gold text-xs font-medium">
                      {o.customer_name}
                    </Link>
                    <p className="text-xs text-cream/40 truncate max-w-[140px]">{o.customer_email}</p>
                  </td>
                  <td className="py-2.5 px-3 text-cream/80 text-xs">
                    {o.option_name}
                    <p className="text-cream/40">{o.product_name}{o.service_date ? ` · ${o.service_date}` : ''}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs" onClick={(e) => e.stopPropagation()}>
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
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded border border-gold/30 text-gold-soft bg-gold/5">
                        Ef.{o.cash_collected_currency ? ` ${o.cash_collected_currency}` : ''}
                      </span>
                    )}
                    {!o.admin_viewed_at && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full border border-gold text-ink bg-gold font-semibold">🆕 Nueva</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-cream/80 tabular-nums text-xs whitespace-nowrap">
                    {orderTotalDisplay(o)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gold tabular-nums text-xs whitespace-nowrap">
                    {o.payment_method !== 'cash' && o.commission_amount_ars != null
                      ? `ARS ${Math.round(o.commission_amount_ars).toLocaleString('es-AR')}`
                      : <span className="text-cream/30">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3">
                      <Link to={`/admin/orders/${o.public_id}`} className="text-gold-soft hover:text-gold text-xs">Ver →</Link>
                      <ExpandToggle
                        open={expandedRow === o.public_id}
                        onClick={() => setExpandedRow(expandedRow === o.public_id ? null : o.public_id)}
                      />
                    </div>
                  </td>
                </tr>
                {expandedRow === o.public_id && (
                  <tr className="border-t border-gold/5 bg-ink-soft/20">
                    <td colSpan={9} className="px-6 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Detalle</p>
                      <div className="max-w-xl">
                        <OrderExtraDetails o={o} twoColumns />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pie: conteo + paginación ── */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-cream/30">
            {orders.length} orden{pluralSuffix}
          </p>
          <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); setConfirming(false); }} />
        </div>
      </>
    );
  }

  return (
    <div className={`p-4 md:p-8 max-w-7xl ${selected.size > 0 ? 'pb-24' : ''}`}>
      <header className="mb-4 md:mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Ventas</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Órdenes</h1>
        </div>
        <Link to="/admin/orders/archivo"
          className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gold/15 text-xs text-cream/50 hover:text-cream/80 hover:border-gold/30 transition">
          📁 Archivo
        </Link>
      </header>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 md:mb-6">
          <SummaryCard label="Total" value={`${summary.count}`} sub="órdenes en este listado" />
          <SummaryCard label="Pagadas" value={`${summary.paidCount}`} sub="confirmadas, MP o efectivo" />
          <SummaryCard label="Facturación MP" value={`ARS ${Math.round(summary.revenue).toLocaleString('es-AR')}`} sub="cobrado por Mercado Pago (no incluye efectivo)" />
          <SummaryCard label="Comisiones" value={`ARS ${Math.round(summary.commission).toLocaleString('es-AR')}`} sub="a liquidar, solo ventas por MP" highlight />
          <SummaryCard
            label="Neto por cobrar"
            value={`ARS ${Math.round(summary.netPending).toLocaleString('es-AR')}`}
            sub={`${summary.netPendingCount} venta${summary.netPendingCount !== 1 ? 's' : ''} en efectivo sin rendir, de todos los vendedores`}
            highlight
          />
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

      <SelectionBar
        count={selected.size}
        onClear={() => { setSelected(new Set()); setConfirming(false); }}
        onDelete={() => setConfirming(true)}
        confirming={confirming}
        onConfirm={handleBulkDelete}
        onCancelConfirm={() => setConfirming(false)}
        deleting={deleting}
      />
    </div>
  );
}
