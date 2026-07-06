import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sellerApi, SellerApiError, type SellerOrder } from '../../lib/sellerApi';
import ModifyReservationModal from '../../components/admin/ModifyReservationModal';
import PaymentLinkShare from '../../components/PaymentLinkShare';

// Estado mostrado al vendedor según método de pago + sub-estado real de la orden:
//  - Pendiente: reservó, todavía no se cobró.
//  - Cobrada:   efectivo cobrado por el vendedor, neto aún no rendido.
//  - Rendida:   efectivo cobrado y neto ya rendido al operador.
//  - Pagada:    Mercado Pago confirmado.
//  - Caducada:  efectivo no cobrado dentro de las 24 hs (cancelada automáticamente).
type DerivedKey = 'pending' | 'collected' | 'settled' | 'paid' | 'expired' | 'cancelled' | 'refunded' | 'failed';

const STATUS_CLASS: Record<DerivedKey, string> = {
  pending: 'bg-amber-900/30 text-amber-400 border border-amber-800/40',
  collected: 'bg-sky-900/30 text-sky-400 border border-sky-800/40',
  settled: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
  paid: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
  expired: 'bg-zinc-800/40 text-cream/40 border border-zinc-700/30',
  cancelled: 'bg-zinc-800/40 text-cream/40 border border-zinc-700/30',
  refunded: 'bg-blue-900/30 text-blue-400 border border-blue-800/40',
  failed: 'bg-bordeaux-deep/40 text-bordeaux-light border border-bordeaux-light/30',
};

const DERIVED_LABEL: Record<DerivedKey, string> = {
  pending: 'Pendiente',
  collected: 'Cobrada',
  settled: 'Rendida',
  paid: 'Pagada',
  expired: 'Caducada',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
  failed: 'Fallida',
};

function derivedStatus(o: SellerOrder): { key: DerivedKey; label: string; cls: string } {
  let key: DerivedKey;
  if (o.status === 'expired') key = 'expired';
  else if (o.status === 'cancelled') key = 'cancelled';
  else if (o.status === 'refunded') key = 'refunded';
  else if (o.status === 'failed') key = 'failed';
  else if (o.status === 'pending') key = 'pending';
  else if (o.payment_method === 'cash') key = o.net_settled_at ? 'settled' : 'collected';
  else key = 'paid';
  return { key, label: DERIVED_LABEL[key], cls: STATUS_CLASS[key] };
}

const PAYMENT_LABEL: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  cash: 'Efectivo',
};

function fmt(usd: number) {
  return `USD ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function paxLabel(adults: number, children: number) {
  const parts = [`${adults} adulto${adults !== 1 ? 's' : ''}`];
  if (children > 0) parts.push(`${children} menor${children !== 1 ? 'es' : ''}`);
  return parts.join(' · ');
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-cream/40 shrink-0">{label}</span>
      <span className="text-cream/80 text-right">{children}</span>
    </div>
  );
}

export default function SellerOrders() {
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');

  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(''); // '' = Todas (default)
  const [expanded, setExpanded] = useState<number | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [confirmPublicId, setConfirmPublicId] = useState<string | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [modifyOrder, setModifyOrder] = useState<SellerOrder | null>(null);

  const reload = async () => {
    const data = await sellerApi.orders();
    setOrders(data);
  };
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  // Auto-expand y scroll a la orden destacada una vez que carguen los datos
  useEffect(() => {
    if (!highlight || loading || orders.length === 0) return;
    const target = orders.find((o) => o.public_id === highlight);
    if (target) {
      setExpanded(target.order_id);
      setTimeout(() => {
        highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlight, loading, orders]);

  const handleCollect = async (publicId: string) => {
    setCollecting(publicId);
    setCollectError(null);
    try {
      await sellerApi.collectCash(publicId);
      setConfirmPublicId(null);
      // Refrescar la lista
      const data = await sellerApi.orders(filter || undefined);
      setOrders(data);
      setExpanded(null);
    } catch (err) {
      setCollectError((err as SellerApiError).message);
    } finally {
      setCollecting(null);
    }
  };

  // Traemos todas las órdenes y filtramos en el cliente por estado derivado
  // (Cobrada/Rendida son sub-estados de 'paid', no se pueden filtrar server-side).
  useEffect(() => {
    setLoading(true);
    setError(null);
    sellerApi.orders()
      .then((data) => { setOrders(data); setExpanded(null); })
      .catch((err) => setError((err as SellerApiError).message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => (filter ? orders.filter((o) => derivedStatus(o).key === filter) : orders),
    [orders, filter],
  );

  const pendingOrder = confirmPublicId
    ? orders.find((o) => o.public_id === confirmPublicId)
    : null;

  return (
    <>
    {modifyOrder && (
      <ModifyReservationModal
        order={{
          public_id: modifyOrder.public_id,
          payment_method: modifyOrder.payment_method === 'cash' ? 'cash' : 'mercadopago',
          customer_name: modifyOrder.customer_name,
          customer_phone: modifyOrder.customer_phone,
          total_usd: modifyOrder.total_usd,
          total_ars: modifyOrder.total_ars,
        }}
        item={{
          adults: modifyOrder.adults,
          children: modifyOrder.children,
          unit_price_adult_usd: String(modifyOrder.unit_price_adult_usd),
          unit_price_child_usd: modifyOrder.unit_price_child_usd != null ? String(modifyOrder.unit_price_child_usd) : null,
          subtotal_usd: String(modifyOrder.subtotal_usd),
          service_date: modifyOrder.service_date,
          option_name_snapshot: modifyOrder.option_name,
        }}
        handlers={{
          // El vendedor NO reintegra por MP (lo hace el admin) → sin reduceMp.
          reduceCash: (body) => sellerApi.reduceCash(modifyOrder.public_id, body),
          increaseCash: (body) => sellerApi.increaseCash(modifyOrder.public_id, body),
          addMp: (body) => sellerApi.addMp(modifyOrder.public_id, body),
        }}
        onClose={() => setModifyOrder(null)}
        onDone={() => { setModifyOrder(null); reload().catch(() => {}); }}
      />
    )}
    {confirmPublicId && pendingOrder && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-6 md:p-8">
            <h2 className="font-display text-2xl text-cream mb-2">Confirmar cobro</h2>
            <p className="text-sm text-cream/60 mb-5">
              ¿Confirmás que recibiste el dinero del pasajero para la siguiente reserva?
            </p>
            <div className="rounded-lg border border-gold/15 bg-ink/40 p-4 space-y-1.5 mb-6 text-sm">
              <div className="flex justify-between">
                <span className="text-cream/50">Pasajero</span>
                <span className="text-cream font-medium">{pendingOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Servicio</span>
                <span className="text-cream/80">{pendingOrder.option_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Fecha</span>
                <span className="text-cream/80">{fmtDate(pendingOrder.service_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Total</span>
                <span className="text-gold font-mono font-semibold">{fmt(pendingOrder.total_usd)}</span>
              </div>
            </div>
            <p className="text-xs text-cream/40 mb-5">
              Al confirmar, la reserva pasa a <strong className="text-cream/60">Cobrada</strong> y se envía el email de confirmación al pasajero.
            </p>
            {collectError && (
              <p className="text-xs text-bordeaux-light mb-4">⚠ {collectError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setConfirmPublicId(null); setCollectError(null); }}
                className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
                disabled={collecting === confirmPublicId}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCollect(confirmPublicId)}
                disabled={collecting === confirmPublicId}
                className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors disabled:opacity-60"
              >
                {collecting === confirmPublicId ? 'Procesando...' : 'Sí, cobré el dinero'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    <div className="p-4 md:p-8 max-w-6xl">
      <header className="mb-4 md:mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-cream">Mis ventas</h1>
          <p className="mt-0.5 text-xs md:text-sm text-cream/50">Órdenes generadas con tu código</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input w-36 md:w-44 text-sm">
          <option value="">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="collected">Cobradas</option>
          <option value="settled">Rendidas</option>
          <option value="paid">Pagadas (MP)</option>
          <option value="expired">Caducadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </header>

      {filter && !loading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs md:text-sm">
          <span className="text-gold-soft">Filtro:</span>
          <span className="text-cream/80 font-medium">{DERIVED_LABEL[filter as DerivedKey] ?? filter}</span>
          <span className="text-cream/40">·</span>
          <span className="text-cream/50">{visible.length} resultado{visible.length !== 1 ? 's' : ''}</span>
          <button type="button" onClick={() => setFilter('')}
            className="ml-auto text-xs text-gold-soft hover:text-gold transition underline underline-offset-2">
            Ver todas
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-8 text-center text-cream/40 text-sm">
          No hay ventas{filter ? ' con ese filtro' : ''} todavía.
        </div>
      ) : (
        <>
          {/* ── MOBILE: tarjetas ── */}
          <div className="md:hidden space-y-2">
            {visible.map((o) => {
              const isOpen = expanded === o.order_id;
              const isHighlighted = o.public_id === highlight;
              return (
                <div
                  key={o.order_id}
                  ref={isHighlighted ? highlightRowRef : null}
                  onClick={() => setExpanded(isOpen ? null : o.order_id)}
                  className={`rounded-xl border overflow-hidden cursor-pointer select-none transition
                    ${isOpen ? 'border-gold/30 bg-ink-soft/60' : 'border-gold/10 bg-ink-soft/30'}
                    ${isHighlighted ? 'ring-1 ring-gold/40' : ''}`}
                >
                  <div className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-cream text-sm font-medium leading-tight truncate">{o.product_name}</p>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs ${derivedStatus(o).cls}`}>
                          {derivedStatus(o).label}
                        </span>
                      </div>
                      <p className="text-xs text-cream/50 truncate">{o.option_name}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-cream/40">
                        <span>{fmtDate(o.service_date || o.created_at)}</span>
                        <span>·</span>
                        <span>{paxLabel(o.adults ?? 0, o.children ?? 0)}</span>
                        {o.payment_method === 'cash' && <span className="text-cream/30">· Efectivo</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-cream font-mono text-sm">{fmt(o.total_usd)}</p>
                      {(o.status === 'paid' || o.status === 'pending') && (
                        <p className="text-gold font-mono text-xs" title="Tu ganancia">{fmt(o.commission_amount_usd)}</p>
                      )}
                      <span className={`text-gold/50 text-xs inline-block mt-1 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-gold/10 px-4 py-3 bg-ink-soft/20 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Detalle</p>
                      <DetailRow label="Pasajero">{o.customer_name}</DetailRow>
                      <DetailRow label="Email">{o.customer_email}</DetailRow>
                      {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
                      {o.customer_nationality && <DetailRow label="Nac.">{o.customer_nationality}</DetailRow>}
                      <DetailRow label="Fecha servicio">{fmtDate(o.service_date)}</DetailRow>
                      <DetailRow label="Pago">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
                      <DetailRow label="Total"><span className="text-cream font-mono">{fmt(o.total_usd)}</span></DetailRow>
                      {(o.status === 'paid' || o.status === 'pending') && (
                        <DetailRow label={o.status === 'paid' ? 'Tu ganancia' : 'Tu ganancia (estimada)'}>
                          <span className="text-gold font-mono">{fmt(o.commission_amount_usd)}</span>
                        </DetailRow>
                      )}
                      {o.payment_method === 'cash' ? (
                        <>
                          {o.status === 'paid' && (
                            <DetailRow label="Neto a rendir"><span className="text-cream font-mono">{fmt(o.net_total_usd ?? 0)}</span></DetailRow>
                          )}
                          <DetailRow label="Neto rendido">
                            {o.net_settled_at
                              ? <span className="text-emerald-400">✓ {fmtDate(o.net_settled_at)}</span>
                              : o.status === 'paid'
                                ? <span className="text-amber-400">Pendiente</span>
                                : <span className="text-cream/30">—</span>}
                          </DetailRow>
                        </>
                      ) : (
                        <DetailRow label="Te liquidamos">
                          {o.paid_to_seller_at
                            ? <span className="text-emerald-400">✓ {fmtDate(o.paid_to_seller_at)}</span>
                            : o.status === 'paid'
                              ? <span className="text-amber-400">Pendiente</span>
                              : <span className="text-cream/30">—</span>}
                        </DetailRow>
                      )}
                      {o.status === 'pending' && o.payment_method === 'mercadopago' && o.mp_init_point && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Link de pago (re-compartir)</p>
                          <PaymentLinkShare
                            link={o.mp_init_point}
                            phone={o.customer_phone}
                            waMessage={`Hola ${o.customer_name}, te dejo el link para pagar tu reserva de ${o.option_name} (${fmtDate(o.service_date)}). Total ${fmt(o.total_usd)}. Pagá acá: ${o.mp_init_point}`}
                          />
                        </div>
                      )}
                      {o.payment_method === 'cash' && o.status === 'pending' && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirmPublicId(o.public_id); }}
                            className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
                          >
                            ✓ Confirmar cobro en efectivo
                          </button>
                        </div>
                      )}
                      {o.status === 'paid' && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setModifyOrder(o); }}
                            className="w-full rounded-lg border border-gold/25 px-4 py-2.5 text-sm text-gold-soft hover:bg-gold/10 transition-colors"
                          >
                            ✎ Modificar pasajeros
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── DESKTOP: tabla ── */}
          <div className="hidden md:block rounded-xl border border-gold/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10 text-cream/50 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Fecha servicio</th>
                  <th className="text-left px-4 py-3">Show / Opción</th>
                  <th className="text-left px-4 py-3">Pasajeros</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Venta</th>
                  <th className="text-right px-4 py-3">Comisión</th>
                  <th className="text-center px-4 py-3">Liquidado</th>
                  <th className="w-8 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const isOpen = expanded === o.order_id;
                  const isHighlighted = o.public_id === highlight;
                  return (
                    <>
                      <tr
                        key={o.order_id}
                        ref={isHighlighted ? highlightRowRef : null}
                        onClick={() => setExpanded(isOpen ? null : o.order_id)}
                        className={`border-b border-gold/5 cursor-pointer select-none transition ${isOpen ? 'bg-gold/5' : 'hover:bg-ink-soft/30'} ${isHighlighted ? 'ring-1 ring-inset ring-gold/40' : ''}`}
                      >
                        <td className="px-4 py-3 text-cream/70 whitespace-nowrap text-xs">{fmtDate(o.service_date || o.created_at)}</td>
                        <td className="px-4 py-3">
                          <p className="text-cream text-sm">{o.product_name}</p>
                          <p className="text-xs text-cream/50">{o.option_name}</p>
                        </td>
                        <td className="px-4 py-3 text-cream/70 text-xs whitespace-nowrap">{paxLabel(o.adults ?? 0, o.children ?? 0)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${derivedStatus(o).cls}`}>
                              {derivedStatus(o).label}
                            </span>
                            {o.utm_source === 'seller_portal' && (
                              <span className="px-2 py-0.5 rounded-full text-xs border border-gold/30 bg-gold/5 text-gold-soft">Manual</span>
                            )}
                            {o.payment_method === 'cash' && (
                              <span className="px-2 py-0.5 rounded-full text-xs border border-cream/15 bg-cream/5 text-cream/40">Efectivo</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-cream font-mono whitespace-nowrap text-xs">{fmt(o.total_usd)}</td>
                        <td className="px-4 py-3 text-right text-gold font-mono whitespace-nowrap text-xs">
                          {(o.status === 'paid' || o.status === 'pending') ? fmt(o.commission_amount_usd) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-xs">
                          {(o.payment_method === 'cash' ? o.net_settled_at : o.paid_to_seller_at)
                            ? <span className="text-emerald-400">✓</span>
                            : o.status === 'paid'
                              ? <span className="text-amber-400">Pdte.</span>
                              : <span className="text-cream/30">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`text-gold/50 text-xs inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${o.order_id}-detail`} className="border-b border-gold/10 bg-ink-soft/20">
                          <td colSpan={8} className="px-5 py-4">
                            <div className="grid sm:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Pasajero</p>
                                <DetailRow label="Nombre">{o.customer_name}</DetailRow>
                                <DetailRow label="Email">{o.customer_email}</DetailRow>
                                {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
                                {o.customer_nationality && <DetailRow label="Nacionalidad">{o.customer_nationality}</DetailRow>}
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Reserva</p>
                                <DetailRow label="Show">{o.product_name}</DetailRow>
                                <DetailRow label="Opción">{o.option_name}</DetailRow>
                                <DetailRow label="Fecha">{fmtDate(o.service_date)}</DetailRow>
                                <DetailRow label="Adultos">{o.adults}</DetailRow>
                                {o.children > 0 && <DetailRow label="Menores">{o.children}</DetailRow>}
                                <DetailRow label="Compra">{fmtDateTime(o.created_at)}</DetailRow>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Pago y comisión</p>
                                <DetailRow label="Medio">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
                                <DetailRow label="Total"><span className="text-cream font-mono">{fmt(o.total_usd)}</span></DetailRow>
                                {(o.status === 'paid' || o.status === 'pending') && (
                                  <DetailRow label={o.status === 'paid' ? 'Tu ganancia' : 'Tu ganancia (estimada)'}>
                                    <span className="text-gold font-mono">{fmt(o.commission_amount_usd)}</span>
                                  </DetailRow>
                                )}
                                {o.payment_method === 'cash' ? (
                                  <>
                                    {o.status === 'paid' && (
                                      <DetailRow label="Neto a rendir"><span className="text-cream font-mono">{fmt(o.net_total_usd ?? 0)}</span></DetailRow>
                                    )}
                                    <DetailRow label="Neto rendido">
                                      {o.net_settled_at
                                        ? <span className="text-emerald-400">✓ {fmtDate(o.net_settled_at)}</span>
                                        : o.status === 'paid'
                                          ? <span className="text-amber-400">Pendiente</span>
                                          : <span className="text-cream/30">—</span>}
                                    </DetailRow>
                                  </>
                                ) : (
                                  <DetailRow label="Te liquidamos">
                                    {o.paid_to_seller_at
                                      ? <span className="text-emerald-400">✓ {fmtDate(o.paid_to_seller_at)}</span>
                                      : o.status === 'paid'
                                        ? <span className="text-amber-400">Pendiente</span>
                                        : <span className="text-cream/30">—</span>}
                                  </DetailRow>
                                )}
                                <DetailRow label="N° orden"><span className="font-mono text-cream/50">{o.public_id.slice(0, 12).toUpperCase()}</span></DetailRow>
                              </div>
                            </div>
                            {o.status === 'pending' && o.payment_method === 'mercadopago' && o.mp_init_point && (
                              <div className="mt-4 pt-4 border-t border-gold/10 max-w-md">
                                <PaymentLinkShare
                                  link={o.mp_init_point}
                                  phone={o.customer_phone}
                                  label="Link de pago (re-compartir)"
                                  waMessage={`Hola ${o.customer_name}, te dejo el link para pagar tu reserva de ${o.option_name} (${fmtDate(o.service_date)}). Total ${fmt(o.total_usd)}. Pagá acá: ${o.mp_init_point}`}
                                />
                              </div>
                            )}
                            {o.payment_method === 'cash' && o.status === 'pending' && (
                              <div className="mt-4 pt-4 border-t border-gold/10">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setConfirmPublicId(o.public_id); }}
                                  className="w-full rounded-lg bg-gold px-4 py-3 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
                                >
                                  ✓ Confirmar cobro en efectivo
                                </button>
                                <p className="mt-1.5 text-xs text-cream/35 text-center">Confirmar envía el email al pasajero</p>
                              </div>
                            )}
                            {o.status === 'paid' && (
                              <div className="mt-4 pt-4 border-t border-gold/10">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setModifyOrder(o); }}
                                  className="w-full rounded-lg border border-gold/25 px-4 py-2.5 text-sm text-gold-soft hover:bg-gold/10 transition-colors"
                                >
                                  ✎ Modificar pasajeros / traslado
                                </button>
                                <p className="mt-1.5 text-xs text-cream/35 text-center">
                                  {o.payment_method === 'cash'
                                    ? 'Sumás/bajás pax y cobrás o devolvés en el momento'
                                    : 'Sumar pax genera un link de pago para el cliente'}
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && visible.length > 0 && (
        <p className="mt-3 text-xs text-cream/30 text-right">
          {visible.length} resultado{visible.length !== 1 ? 's' : ''} · Tocá para ver el detalle
        </p>
      )}
    </div>
    </>
  );
}
