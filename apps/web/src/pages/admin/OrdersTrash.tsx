import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type TrashedOrderItem } from '../../lib/adminApi';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function DaysChip({ days }: Readonly<{ days: number }>) {
  const color =
    days <= 3 ? 'text-bordeaux-light border-bordeaux-light/40 bg-bordeaux-deep/20' :
    days <= 7 ? 'text-amber-400 border-amber-500/30 bg-amber-900/10' :
    'text-cream/50 border-cream/15 bg-cream/5';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${color} whitespace-nowrap`}>
      {days === 0 ? 'Vence hoy' : `${days}d restantes`}
    </span>
  );
}

function RestoreChip({ at }: Readonly<{ at: string | null }>) {
  if (!at) return null;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-900/15 text-amber-400 whitespace-nowrap">
      Vendedor pide restaurar
    </span>
  );
}

export default function OrdersTrash() {
  const [orders, setOrders] = useState<TrashedOrderItem[] | null>(null);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'restore' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setOrders(null);
    setError(null);
    adminApi.orders.trash.list()
      .then(({ orders: rows, retention_days }) => {
        setOrders(rows);
        setRetentionDays(retention_days);
      })
      .catch((err) => setError((err as Error).message));
  };

  useEffect(() => { load(); }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!orders) return;
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map((o) => o.public_id)));
    }
  }

  async function handleRestore() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const { restored } = await adminApi.orders.trash.restore(Array.from(selected));
      setMsg(`✓ ${restored} ${restored === 1 ? 'orden restaurada' : 'órdenes restauradas'}.`);
      setSelected(new Set());
      setAction(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePermanentDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const { deleted } = await adminApi.orders.trash.permanentDelete(Array.from(selected));
      setMsg(`✓ ${deleted} ${deleted === 1 ? 'orden eliminada' : 'órdenes eliminadas'} permanentemente.`);
      setSelected(new Set());
      setAction(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    setBusy(true);
    try {
      const { deleted } = await adminApi.orders.trash.purge();
      setMsg(`✓ Purga completa: ${deleted} ${deleted === 1 ? 'orden eliminada' : 'órdenes eliminadas'}.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    const url = adminApi.orders.trash.downloadUrl();
    const { data: session } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'papelera-ordenes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const allSelected = !!orders && orders.length > 0 && selected.size === orders.length;
  const someSelected = selected.size > 0;
  const expiring = orders?.filter((o) => o.days_remaining <= 3).length ?? 0;
  const restoreRequests = orders?.filter((o) => o.restore_requested_at).length ?? 0;

  return (
    <div className={`p-4 md:p-8 max-w-7xl ${someSelected ? 'pb-24' : ''}`}>
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link to="/admin/orders" className="text-xs text-cream/40 hover:text-cream/70 transition">← Órdenes</Link>
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Papelera</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Órdenes eliminadas</h1>
        <p className="mt-1 text-xs text-cream/40">
          Las órdenes se eliminan permanentemente después de {retentionDays} días.
        </p>
      </header>

      {/* Alertas rápidas */}
      {(expiring > 0 || restoreRequests > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {expiring > 0 && (
            <div className="rounded-lg border border-bordeaux-light/40 bg-bordeaux-deep/20 px-4 py-2 text-xs text-bordeaux-light">
              ⚠ {expiring} {expiring === 1 ? 'orden vence' : 'órdenes vencen'} en los próximos 3 días
            </div>
          )}
          {restoreRequests > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-4 py-2 text-xs text-amber-400">
              🔔 {restoreRequests} {restoreRequests === 1 ? 'vendedor pidió restaurar una orden' : 'vendedores pidieron restaurar órdenes'}
            </div>
          )}
        </div>
      )}

      {/* Acciones globales */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {orders && orders.length > 0 && (
          <button type="button" onClick={handleDownload} disabled={busy}
            className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 transition disabled:opacity-40">
            Descargar CSV
          </button>
        )}
        <button type="button" onClick={() => { setAction('purge'); }} disabled={busy || !orders || orders.length === 0}
          className="px-3 py-1.5 rounded-md border border-bordeaux-light/30 text-xs text-bordeaux-light/80 hover:border-bordeaux-light/60 hover:text-bordeaux-light transition disabled:opacity-40">
          Purgar expiradas
        </button>
        {msg && (
          <span className="text-xs text-gold ml-2">{msg}</span>
        )}
      </div>

      {/* Confirmación de purga */}
      {action === 'purge' && (
        <div className="rounded-lg border border-bordeaux-light/40 bg-bordeaux-deep/20 px-4 py-3 mb-5 flex items-center gap-4 flex-wrap text-sm">
          <span className="text-cream/80">¿Eliminar definitivamente todas las órdenes expiradas ({retentionDays}+ días)?</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAction(null)} disabled={busy}
              className="text-xs text-cream/50 hover:text-cream transition">Cancelar</button>
            <button type="button" onClick={handlePurge} disabled={busy}
              className="px-3 py-1.5 rounded-md bg-bordeaux-light text-ink text-xs font-bold hover:bg-bordeaux-light/80 transition disabled:opacity-60">
              {busy ? 'Purgando...' : 'Sí, purgar'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {/* Lista */}
      {orders === null ? (
        <div className="space-y-3">
          {['sk-a', 'sk-b', 'sk-c'].map((k) => (
            <div key={k} className="h-16 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-12 text-center">
          <p className="text-4xl mb-3">🗑</p>
          <p className="text-cream/50 text-sm">La papelera está vacía.</p>
        </div>
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-ink-soft/60 text-cream/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 w-8">
                    <input type="checkbox" checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gold/40 bg-ink accent-gold cursor-pointer"
                      aria-label="Seleccionar todas" />
                  </th>
                  <th className="text-left py-3 px-3">Orden</th>
                  <th className="text-left py-3 px-3">Servicio</th>
                  <th className="text-left py-3 px-3">Vendedor</th>
                  <th className="text-right py-3 px-3">Total</th>
                  <th className="text-left py-3 px-3">Eliminada</th>
                  <th className="text-left py-3 px-3">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.public_id}
                    onClick={() => toggle(o.public_id)}
                    className={`border-t border-gold/5 transition cursor-pointer ${selected.has(o.public_id) ? 'bg-gold/5' : 'hover:bg-gold/5'}`}
                  >
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.public_id)} onChange={() => toggle(o.public_id)}
                        className="w-4 h-4 rounded border-gold/40 bg-ink accent-gold cursor-pointer"
                        aria-label={`Seleccionar ${o.customer_name}`} />
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="text-cream/80 text-xs font-medium">{o.customer_name}</p>
                      <p className="text-cream/40 text-[10px] truncate max-w-[160px]">{o.customer_email}</p>
                      {o.restore_requested_at && <RestoreChip at={o.restore_requested_at} />}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-cream/70">
                      {o.option_name}
                      <p className="text-[10px] text-cream/40">{o.product_name}{o.service_date ? ` · ${o.service_date}` : ''}</p>
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {o.seller_name
                        ? <><p className="text-cream/70">{o.seller_name}</p><p className="font-mono text-cream/35 text-[10px]">{o.seller_code}</p></>
                        : <span className="text-cream/25">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-cream/60 font-mono text-xs whitespace-nowrap">
                      USD {o.total_usd}
                    </td>
                    <td className="py-2.5 px-3 text-cream/40 text-xs whitespace-nowrap">{fmtDate(o.deleted_at)}</td>
                    <td className="py-2.5 px-3"><DaysChip days={o.days_remaining} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3 mb-4">
            {orders.map((o) => (
              <div key={o.public_id}
                onClick={() => toggle(o.public_id)}
                className={`rounded-xl border transition cursor-pointer ${selected.has(o.public_id) ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/40'}`}
              >
                <div className="px-4 pt-3 pb-2 flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(o.public_id)} onChange={() => toggle(o.public_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 mt-0.5 rounded border-gold/40 bg-ink accent-gold cursor-pointer shrink-0"
                    aria-label={`Seleccionar ${o.customer_name}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-cream/80 text-sm font-medium truncate">{o.customer_name}</p>
                      <p className="text-cream/60 font-mono text-xs whitespace-nowrap">USD {o.total_usd}</p>
                    </div>
                    <p className="text-cream/40 text-xs truncate">{o.customer_email}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <DaysChip days={o.days_remaining} />
                      <RestoreChip at={o.restore_requested_at} />
                    </div>
                    {o.option_name && (
                      <p className="text-[10px] text-cream/40 mt-1">{o.option_name}{o.service_date ? ` · ${o.service_date}` : ''}</p>
                    )}
                    <p className="text-[10px] text-cream/30 mt-0.5">Eliminada {fmtDate(o.deleted_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-cream/30">{orders.length} {orders.length === 1 ? 'orden' : 'órdenes'} en la papelera</p>
        </>
      )}

      {/* Barra de acciones flotante */}
      {someSelected && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-ink border-t border-gold/20 shadow-2xl px-4 py-3 md:px-8">
          {action === null ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-cream">
                <span className="font-semibold text-gold">{selected.size}</span>{' '}
                {selected.size === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelected(new Set())}
                  className="text-xs text-cream/50 hover:text-cream transition">
                  Deseleccionar
                </button>
                <button type="button" onClick={() => setAction('restore')}
                  className="px-4 py-1.5 rounded-md border border-gold/30 bg-gold/10 text-gold text-xs font-medium hover:bg-gold/20 transition">
                  Restaurar
                </button>
                <button type="button" onClick={() => setAction('delete')}
                  className="px-4 py-1.5 rounded-md bg-bordeaux-deep border border-bordeaux-light/40 text-bordeaux-light text-xs font-medium hover:bg-bordeaux-deep/80 transition">
                  Eliminar definitivamente
                </button>
              </div>
            </div>
          ) : action === 'restore' ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-cream/80">
                ¿Restaurar <span className="font-semibold text-gold">{selected.size}</span>{' '}
                {selected.size === 1 ? 'orden' : 'órdenes'}?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAction(null)} disabled={busy}
                  className="text-xs text-cream/50 hover:text-cream transition disabled:opacity-40">Cancelar</button>
                <button type="button" onClick={handleRestore} disabled={busy}
                  className="px-4 py-1.5 rounded-md bg-gold text-ink text-xs font-bold hover:bg-gold/90 transition disabled:opacity-60">
                  {busy ? 'Restaurando...' : 'Sí, restaurar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-cream/80">
                ¿Eliminar permanentemente{' '}
                <span className="font-semibold text-bordeaux-light">{selected.size}</span>{' '}
                {selected.size === 1 ? 'orden' : 'órdenes'}?{' '}
                <strong>Esta acción es irreversible.</strong>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAction(null)} disabled={busy}
                  className="text-xs text-cream/50 hover:text-cream transition disabled:opacity-40">Cancelar</button>
                <button type="button" onClick={handlePermanentDelete} disabled={busy}
                  className="px-4 py-1.5 rounded-md bg-bordeaux-light text-ink text-xs font-bold hover:bg-bordeaux-light/80 transition disabled:opacity-60">
                  {busy ? 'Eliminando...' : 'Sí, eliminar para siempre'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
