import { useEffect, useState } from 'react';
import { sellerApi, type SellerArchivedOrder, type ArchivePage } from '../../lib/sellerApi';

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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

const PAGE_SIZE = 20;

export default function SellerArchive() {
  const [data, setData] = useState<ArchivePage<SellerArchivedOrder> | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    sellerApi.archive.list({ page, limit: PAGE_SIZE, ...(status ? { status } : {}) })
      .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [page, status]);

  function handleStatus(v: string) { setStatus(v); setPage(1); }

  async function handleDownload() {
    const { supabase } = await import('../../lib/supabase');
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const url = sellerApi.archive.downloadUrl(status ? { status } : undefined);
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
    <div className="px-4 pb-24 pt-4 max-w-2xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-cream">Archivo</h1>
          <p className="mt-1 text-xs text-cream/50">
            Tus órdenes terminadas o rendidas. No se borran — siempre disponibles acá.
          </p>
        </div>
        <button type="button" onClick={handleDownload} disabled={loading || total === 0}
          className="mt-1 px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 transition disabled:opacity-40 whitespace-nowrap">
          CSV
        </button>
      </header>

      {/* Tabs de estado */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-5 scrollbar-none">
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

      {error && (
        <div className="rounded-xl border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-12 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-cream/50 text-sm">
            {status ? 'Sin órdenes en esta categoría.' : 'Tu archivo está vacío.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.public_id} className="rounded-xl border border-gold/10 bg-ink-soft/40 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-cream font-medium truncate">{o.customer_name}</p>
                  <p className="text-cream/40 text-[11px] truncate">{o.customer_email}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLOR[o.status] ?? 'text-cream/50 border-cream/20'}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-cream/40">
                <span>{o.option_name ?? '—'}{o.service_date ? ` · ${fmtDate(o.service_date + 'T00:00:00')}` : ''}</span>
                <span className="font-mono text-cream/70">{fmtArs(o.total_ars)}</span>
              </div>
              {(o.archived_at || o.net_settled_at) && (
                <div className="mt-2 flex gap-3 text-[10px] text-cream/30">
                  {o.net_settled_at && <span>Rendida {fmtDate(o.net_settled_at)}</span>}
                  {o.archived_at && <span>Archivada {fmtDate(o.archived_at)}</span>}
                </div>
              )}
            </div>
          ))}
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
