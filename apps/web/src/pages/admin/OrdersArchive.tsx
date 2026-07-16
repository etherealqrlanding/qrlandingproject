import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi, type ArchivedOrderItem } from '../../lib/adminApi';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'paid', label: 'Pagada' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded', label: 'Reintegrada' },
  { value: 'expired', label: 'Vencida' },
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

export default function OrdersArchive() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ArchivedOrderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (p = page, s = search, st = status) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const res = await adminApi.orders.archiveList({
        page: p, limit: PAGE_SIZE,
        ...(s ? { search: s } : {}),
        ...(st ? { status: st } : {}),
      });
      setOrders(res.orders);
      setTotal(res.total);
      setTotalPages(res.total_pages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(page, search, status); }, [page, search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function handleStatus(v: string) {
    setStatus(v);
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.public_id)));
  }

  async function handleRestore() {
    if (!selected.size || busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await adminApi.orders.archiveRestore([...selected]);
      setMsg(`✓ ${res.restored} orden(es) restauradas al panel activo.`);
      load(page, search, status);
    } catch (e) { setMsg(`Error: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  async function handleDownload() {
    const token = (await (await import('../../lib/supabase')).supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const url = adminApi.orders.archiveDownloadUrl(status ? { status } : search ? { search } : undefined);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'archivo-ordenes.csv'; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <header className="mb-6">
        <div className="mb-1">
          <Link to="/admin/orders" className="text-xs text-cream/40 hover:text-cream/70 transition">← Órdenes</Link>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl text-cream">Archivo</h1>
            <p className="mt-1 text-xs text-cream/50">
              Órdenes archivadas manualmente. Nunca se borran — pueden restaurarse en cualquier momento.
            </p>
          </div>
          <button type="button" onClick={handleDownload} disabled={loading || total === 0}
            className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 transition disabled:opacity-40">
            Descargar CSV
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="input text-sm py-1.5 w-56"
          />
          <button type="submit" className="px-3 py-1.5 rounded-md bg-gold/10 border border-gold/30 text-xs text-gold hover:bg-gold/20 transition">
            Buscar
          </button>
          {search && (
            <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
              className="px-3 py-1.5 rounded-md border border-cream/15 text-xs text-cream/50 hover:text-cream transition">
              ✕
            </button>
          )}
        </form>

        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => handleStatus(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                status === f.value
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-cream/15 text-cream/50 hover:border-cream/30 hover:text-cream/80'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="rounded-md border border-gold/20 bg-gold/5 px-4 py-2 text-sm text-gold mb-4">{msg}</div>
      )}
      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {/* Barra de acción con selección */}
      {selected.size > 0 && (
        <div className="sticky top-4 z-20 mb-4 flex items-center gap-3 rounded-xl border border-gold/25 bg-ink-soft/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm text-cream/70">{selected.size} seleccionada(s)</span>
          <button type="button" onClick={handleRestore} disabled={busy}
            className="ml-auto rounded-lg border border-gold/30 px-4 py-1.5 text-sm text-gold hover:bg-gold/10 transition disabled:opacity-50">
            {busy ? 'Restaurando...' : 'Restaurar al panel'}
          </button>
          <button type="button" onClick={() => setSelected(new Set())}
            className="text-xs text-cream/40 hover:text-cream transition">✕</button>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-12 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-cream/50 text-sm">
            {search || status ? 'Sin resultados para ese filtro.' : 'El archivo está vacío.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gold/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10 bg-ink-soft/40">
                  <th className="px-3 py-2 text-left">
                    <input type="checkbox" checked={selected.size === orders.length && orders.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gold/30 bg-ink accent-gold" />
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-cream/40">Pasajero</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-cream/40">Servicio</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-cream/40">Vendedor</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-cream/40">Total USD</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-cream/40">Total ARS</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-cream/40">Estado</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-cream/40">Archivada</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={o.public_id}
                    onClick={() => navigate(`/admin/orders/${o.public_id}`)}
                    className={`border-b border-gold/5 hover:bg-gold/5 transition cursor-pointer ${i % 2 === 0 ? '' : 'bg-ink-soft/20'} ${selected.has(o.public_id) ? 'bg-gold/5' : ''}`}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.public_id)} onChange={() => toggleSelect(o.public_id)}
                        className="rounded border-gold/30 bg-ink accent-gold" />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-cream font-medium truncate max-w-[160px]">{o.customer_name}</p>
                      <p className="text-cream/40 text-[11px] truncate max-w-[160px]">{o.customer_email}</p>
                      {o.customer_phone && <p className="text-cream/30 text-[11px] truncate max-w-[160px]">{o.customer_phone}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-cream/80 truncate max-w-[180px]">{o.option_name ?? '—'}</p>
                      {o.service_date && <p className="text-cream/40 text-[11px]">{fmtDate(o.service_date + 'T00:00:00')}</p>}
                      {o.status === 'cancelled' && o.cancel_reason && (
                        <p className="text-cream/30 text-[11px] italic truncate max-w-[180px]" title={o.cancel_reason}>"{o.cancel_reason}"</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-cream/60 text-[11px]">
                      {o.seller_name ?? <span className="text-cream/30">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-cream/60 text-xs">${o.total_usd.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-cream/80">{fmtArs(o.total_ars)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[o.status] ?? 'text-cream/50 border-cream/20'}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      {o.payment_method === 'cash' && (
                        <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full border border-cream/15 text-cream/40">Ef.</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-cream/40 text-[11px] whitespace-nowrap">
                      {o.archived_at ? fmtDate(o.archived_at) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/admin/orders/${o.public_id}`} className="text-xs text-gold-soft hover:text-gold transition">Ver →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-cream/40">{total} resultado(s) · pág {page}/{totalPages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream transition disabled:opacity-30">
              ← Anterior
            </button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream transition disabled:opacity-30">
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
