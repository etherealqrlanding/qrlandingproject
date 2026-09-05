import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sellerApi, SellerApiError, type SellerArchivedOrder, type SellerMember, type ArchivePage } from '../../lib/sellerApi';
import DetailRow from '../../components/DetailRow';
import SimpleSelect from '../../components/SimpleSelect';
import DateRangePicker from '../../components/DateRangePicker';
import Collapse from '../../components/Collapse';

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'refunded', label: 'Reintegradas' },
  { value: 'expired', label: 'Vencidas' },
  { value: 'settled', label: 'Rendidas' },
];

const STATUS_LABEL: Record<string, string> = {
  paid: 'Pagada', pending: 'Pendiente', cancelled: 'Cancelada',
  refunded: 'Reintegrada', expired: 'Vencida', failed: 'Fallida',
};
const STATUS_COLOR: Record<string, string> = {
  paid: 'text-gold border-gold/40',
  pending: 'text-gold-soft border-gold-soft/30',
  cancelled: 'text-cream/50 border-cream/20',
  refunded: 'text-cream/60 border-cream/20',
  expired: 'text-cream/40 border-cream/15',
  failed: 'text-bordeaux-light border-bordeaux-light/30',
};
const PAYMENT_LABEL: Record<string, string> = {
  mercadopago: 'Tarjeta',
  cash: 'Efectivo',
};
const CANCELLED_BY_LABEL: Record<string, string> = {
  seller: 'Vos',
  admin: 'El operador',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

const PAGE_SIZE = 20;

export default function SellerArchive() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ArchivePage<SellerArchivedOrder> | null>(null);
  // Precarga el filtro de estado si se llega con ?status=... (ej. desde la notificación
  // de rendición, que apunta acá con status=settled para mostrar directo "Rendidas").
  const [status, setStatus] = useState(() => {
    const s = searchParams.get('status') ?? '';
    return STATUS_TABS.some((t) => t.value === s) ? s : '';
  });
  const [memberId, setMemberId] = useState(''); // '' = todos
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [members, setMembers] = useState<SellerMember[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  useEffect(() => {
    sellerApi.members.list().then((list) => setMembers(list.filter((m) => m.is_active))).catch(() => {});
  }, []);

  const memberOptions = useMemo(
    () => [{ value: '', label: 'Todos (equipo)' }, ...members.map((m) => ({ value: String(m.id), label: m.name }))],
    [members],
  );

  const load = () => {
    setLoading(true);
    setError(null);
    return sellerApi.archive.list({
      page, limit: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(memberId ? { member_id: Number(memberId) } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })
      .then((res) => { setData(res); setLoading(false); })
      .catch((e) => { setError((e as Error).message); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    sellerApi.archive.list({
      page, limit: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(memberId ? { member_id: Number(memberId) } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })
      .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [page, status, memberId, from, to]);

  function handleStatus(v: string) { setStatus(v); setPage(1); setExpanded(null); }
  function handleMember(v: string) { setMemberId(v); setPage(1); setExpanded(null); }
  function handleDateRange(f: string, t: string) { setFrom(f); setTo(t); setPage(1); setExpanded(null); }

  async function handleRestore(publicId: string) {
    setRestoring(publicId);
    setRestoreMsg(null);
    try {
      await sellerApi.archive.restore(publicId);
      setRestoreMsg('✓ Orden restaurada a "Órdenes".');
      setExpanded(null);
      await load();
    } catch (err) {
      setRestoreMsg(`Error: ${(err as SellerApiError).message}`);
    } finally {
      setRestoring(null);
    }
  }

  async function handleDownload() {
    const { supabase } = await import('../../lib/supabase');
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const url = sellerApi.archive.downloadUrl({
      ...(status ? { status } : {}),
      ...(memberId ? { member_id: Number(memberId) } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'archivo.csv'; a.click();
    URL.revokeObjectURL(a.href);
  }

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <header className="mb-4 md:mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-cream">Archivo</h1>
          <p className="mt-0.5 text-xs md:text-sm text-cream/50">
            Tus órdenes terminadas o rendidas. No se borran — siempre disponibles acá.
          </p>
        </div>
        <button type="button" onClick={handleDownload} disabled={loading || total === 0}
          className="mt-1 px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 transition disabled:opacity-40 whitespace-nowrap">
          CSV
        </button>
      </header>

      {/* Tabs de estado + filtro de sub-vendedor (si tiene equipo) + rango de fechas */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {STATUS_TABS.map((t) => (
            <button key={t.value} type="button" onClick={() => handleStatus(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs border whitespace-nowrap transition flex-shrink-0 ${
                status === t.value
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-cream/15 text-cream/50 hover:border-cream/30 hover:text-cream/80'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {members.length > 0 && (
            <SimpleSelect className="w-40 shrink-0" options={memberOptions} value={memberId} onChange={handleMember} />
          )}
          <DateRangePicker className="w-56 shrink-0" from={from} to={to} onChange={handleDateRange} />
        </div>
      </div>

      {restoreMsg && (
        <div className="rounded-md border border-gold/20 bg-gold/5 px-4 py-2 text-sm text-gold mb-4">{restoreMsg}</div>
      )}
      {error && (
        <div className="rounded-xl border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {loading && orders.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-12 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-cream/50 text-sm">
            {status || memberId || from || to ? 'Sin órdenes en esta categoría.' : 'Tu archivo está vacío.'}
          </p>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity duration-150 ${loading ? 'opacity-50' : 'opacity-100'}`}>
          {orders.map((o) => {
            const isOpen = expanded === o.public_id;
            const canRestore = !!o.archived_at || !!o.net_settled_at;
            return (
              <div key={o.public_id} className="rounded-xl border border-gold/10 bg-ink-soft/40 overflow-hidden">
                <div
                  onClick={() => setExpanded(isOpen ? null : o.public_id)}
                  className="p-4 cursor-pointer select-none"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-cream font-medium truncate">{o.customer_name}</p>
                      <p className="text-cream/40 text-[11px] truncate">{o.customer_email}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLOR[o.status] ?? 'text-cream/50 border-cream/20'}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                  <p className="text-cream/70 text-xs truncate mb-0.5">{o.product_name ?? '—'}</p>
                  <div className="flex items-center justify-between text-[11px] text-cream/40">
                    <span>{o.option_name ?? '—'}{o.service_date ? ` · ${fmtDate(o.service_date + 'T00:00:00')}` : ''}</span>
                    <span className="font-mono text-cream/70">{fmtArs(o.total_ars)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {(o.archived_at || o.net_settled_at) ? (
                      <div className="flex gap-3 text-[10px] text-cream/30">
                        {o.net_settled_at && <span>Rendida {fmtDate(o.net_settled_at)}</span>}
                        {o.archived_at && <span>Archivada {fmtDate(o.archived_at)}</span>}
                      </div>
                    ) : <span />}
                    <span className={`text-gold/50 text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                  </div>
                </div>

                {isOpen && (
                  <Collapse className="border-t border-gold/10 px-4 py-3 bg-ink-soft/20 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Detalle</p>
                    <DetailRow label="Email">{o.customer_email}</DetailRow>
                    {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
                    {o.customer_nationality && <DetailRow label="Nacionalidad">{o.customer_nationality}</DetailRow>}
                    {o.product_name && <DetailRow label="Casa / Show">{o.product_name}</DetailRow>}
                    {o.option_name && <DetailRow label="Opción">{o.option_name}</DetailRow>}
                    {o.service_date && <DetailRow label="Fecha servicio">{fmtDate(o.service_date + 'T00:00:00')}</DetailRow>}
                    {(o.adults != null) && (
                      <DetailRow label="Pasajeros">
                        {o.adults} adulto{o.adults !== 1 ? 's' : ''}{(o.children ?? 0) > 0 ? ` · ${o.children} menor(es)` : ''}
                      </DetailRow>
                    )}
                    <DetailRow label="Pago">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
                    <DetailRow label="Total"><span className="text-cream font-mono">{fmtArs(o.total_ars)}</span></DetailRow>
                    {o.commission_amount_ars != null && o.commission_amount_ars > 0 && (
                      <DetailRow label="Tu incentivo por recomendación"><span className="text-gold font-mono">{fmtArs(o.commission_amount_ars)}</span></DetailRow>
                    )}
                    <DetailRow label="Te liquidamos">
                      {o.paid_to_seller_at
                        ? <span className="text-emerald-400">✓ {fmtDate(o.paid_to_seller_at)}</span>
                        : o.net_settled_at
                          ? <span className="text-amber-400">Pendiente</span>
                          : <span className="text-cream/30">—</span>}
                    </DetailRow>
                    {o.status === 'cancelled' && (o.cancelled_by || o.cancel_reason) && (
                      <>
                        {o.cancelled_by && <DetailRow label="Cancelada por">{CANCELLED_BY_LABEL[o.cancelled_by] ?? o.cancelled_by}</DetailRow>}
                        {o.cancelled_at && <DetailRow label="Fecha cancelación">{fmtDate(o.cancelled_at)}</DetailRow>}
                        {o.cancel_reason && (
                          <div className="pt-1">
                            <p className="text-cream/40 text-xs mb-0.5">Motivo</p>
                            <p className="text-cream/70 text-xs italic">"{o.cancel_reason}"</p>
                          </div>
                        )}
                      </>
                    )}
                    <DetailRow label="N° orden"><span className="font-mono text-cream/50">{o.public_id.slice(0, 12).toUpperCase()}</span></DetailRow>

                    {canRestore && (
                      <div className="mt-3 pt-3 border-t border-gold/10">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRestore(o.public_id); }}
                          disabled={restoring === o.public_id}
                          className="w-full rounded-lg border border-gold/25 px-4 py-2.5 text-sm text-gold-soft hover:bg-gold/10 transition-colors disabled:opacity-50"
                        >
                          {restoring === o.public_id ? 'Restaurando...' : '↺ Restaurar a Órdenes'}
                        </button>
                      </div>
                    )}
                  </Collapse>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-cream/40">{total} total · pág {page}/{totalPages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream transition disabled:opacity-30">
              ←
            </button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream transition disabled:opacity-30">
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
