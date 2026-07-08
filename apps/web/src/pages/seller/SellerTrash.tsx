import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sellerApi, SellerApiError, type SellerTrashedOrder } from '../../lib/sellerApi';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtArs(ars: number) {
  return `ARS ${Math.round(ars).toLocaleString('es-AR')}`;
}

export default function SellerTrash() {
  const [orders, setOrders] = useState<SellerTrashedOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmHide, setConfirmHide] = useState<SellerTrashedOrder | null>(null);

  const load = () => {
    setOrders(null);
    setError(null);
    sellerApi.trash.list()
      .then(setOrders)
      .catch((err) => setError((err as SellerApiError).message));
  };

  useEffect(() => { load(); }, []);

  async function handleRequestRestore(publicId: string) {
    setBusy(publicId);
    setMsg(null);
    try {
      await sellerApi.trash.requestRestore(publicId);
      setMsg('✓ Solicitud enviada al administrador.');
      load();
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleHide(publicId: string) {
    setBusy(publicId);
    setMsg(null);
    setConfirmHide(null);
    try {
      await sellerApi.trash.hide(publicId);
      setMsg('✓ Orden eliminada de tu vista.');
      load();
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    const url = sellerApi.trash.downloadUrl();
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
    a.download = 'papelera-mis-ventas.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      {/* Modal confirmación de ocultar */}
      {confirmHide && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm">
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl bg-ink-soft border border-gold/20 p-6">
              <h2 className="font-display text-xl text-cream mb-2">Eliminar de tu vista</h2>
              <p className="text-sm text-cream/60 mb-5">
                Esta orden desaparecerá de tu papelera. El administrador seguirá viéndola y puede restaurarla en cualquier momento.
              </p>
              <div className="rounded-lg border border-gold/15 bg-ink/40 p-3 mb-5 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-cream/50">Pasajero</span>
                  <span className="text-cream font-medium">{confirmHide.customer_name}</span>
                </div>
                {confirmHide.option_name && (
                  <div className="flex justify-between">
                    <span className="text-cream/50">Servicio</span>
                    <span className="text-cream/80">{confirmHide.option_name}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirmHide(null)}
                  className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition">
                  Cancelar
                </button>
                <button type="button" onClick={() => handleHide(confirmHide.public_id)}
                  disabled={busy === confirmHide.public_id}
                  className="flex-1 rounded-lg border border-red-500/30 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-60">
                  {busy === confirmHide.public_id ? 'Eliminando...' : 'Sí, eliminar de mi vista'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 md:p-8 max-w-3xl">
        <header className="mb-5">
          <div className="mb-1">
            <Link to="/seller/ventas" className="text-xs text-cream/40 hover:text-cream/70 transition">← Mis ventas</Link>
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-cream">Papelera</h1>
          <p className="mt-1 text-xs text-cream/50">
            Órdenes tuyas eliminadas por el administrador. Podés pedir que las restauren o quitarlas de tu vista.
          </p>
        </header>

        {msg && (
          <div className="rounded-md border border-gold/20 bg-gold/5 px-4 py-2 text-sm text-gold mb-4">{msg}</div>
        )}
        {error && (
          <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
        )}

        {orders === null ? (
          <div className="space-y-3">
            {['sk-a', 'sk-b', 'sk-c'].map((k) => (
              <div key={k} className="h-24 rounded-xl bg-ink-soft/60 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-12 text-center">
            <p className="text-4xl mb-3">🗑</p>
            <p className="text-cream/50 text-sm">No tenés órdenes en la papelera.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-end mb-3">
              <button type="button" onClick={handleDownload}
                className="px-3 py-1.5 rounded-md border border-gold/20 text-xs text-cream/60 hover:text-cream hover:border-gold/40 transition">
                Descargar CSV
              </button>
            </div>
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.public_id} className="rounded-xl border border-gold/10 bg-ink-soft/40 overflow-hidden">
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-cream font-medium text-sm">{o.customer_name}</p>
                        <p className="text-cream/40 text-xs truncate">{o.customer_email}</p>
                        {o.option_name && (
                          <p className="text-cream/60 text-xs mt-1">{o.option_name}{o.service_date ? ` · ${fmtDate(o.service_date)}` : ''}</p>
                        )}
                        <p className="text-[10px] text-cream/30 mt-1">
                          Eliminada el {fmtDate(o.deleted_at)}
                          {o.payment_method === 'cash' && ' · Efectivo'}
                        </p>
                      </div>
                      <p className="text-cream font-mono text-sm shrink-0">{fmtArs(o.total_ars)}</p>
                    </div>

                    {o.restore_requested_at && (
                      <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-950/10 px-3 py-1.5 text-xs text-amber-400">
                        ✓ Solicitud de restauración enviada el {fmtDate(o.restore_requested_at)}. El admin la procesará a la brevedad.
                      </div>
                    )}

                    <div className="flex gap-2 mt-3 flex-wrap">
                      {!o.restore_requested_at && (
                        <button
                          type="button"
                          onClick={() => handleRequestRestore(o.public_id)}
                          disabled={busy === o.public_id}
                          className="flex-1 rounded-lg border border-gold/25 px-3 py-2 text-xs text-gold-soft hover:bg-gold/10 transition disabled:opacity-50"
                        >
                          {busy === o.public_id ? '...' : 'Pedir restauración'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmHide(o)}
                        disabled={busy === o.public_id}
                        className="flex-1 rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition disabled:opacity-50"
                      >
                        Quitar de mi vista
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-cream/30 text-right">
              {orders.length} {orders.length === 1 ? 'orden' : 'órdenes'} en papelera
            </p>
          </>
        )}
      </div>
    </>
  );
}
