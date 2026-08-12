import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type PendingAttributionRequest } from '../../lib/sellerApi';

interface Props {
  // Se usa para forzar un refetch cuando algo externo puede haber sumado un reclamo
  // nuevo (ej. push en vivo de otra pestaña) — igual que el resto del portal.
  refreshKey?: number;
  onResolved?: () => void;
}

// Panel de "Reclamos pendientes": cualquiera del equipo puede pedir (con su propio
// PIN) que se le sume una venta sin asignar, pero eso no la asigna sola — el
// administrador del vendedor tiene que aprobarla o rechazarla acá con SU PIN antes de
// que quede escrita. Reemplaza tener que salir a investigar quién vendió qué por una
// listita corta para revisar.
export default function PendingAttributionRequests({ refreshKey, onResolved }: Props) {
  const [requests, setRequests] = useState<PendingAttributionRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [adminPin, setAdminPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    sellerApi.listAttributionRequests()
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoaded(true));
  };

  useEffect(() => { load(); }, [refreshKey]);

  const startDecision = (id: number, d: 'approve' | 'reject') => {
    setActiveId(id);
    setDecision(d);
    setAdminPin('');
    setError(null);
  };

  const confirmDecision = async () => {
    if (!activeId || !decision) return;
    if (!/^\d{4,6}$/.test(adminPin)) return setError('Ingresá el PIN de administrador (4-6 dígitos).');
    setSaving(true);
    setError(null);
    try {
      await sellerApi.resolveAttributionRequest(activeId, decision, adminPin);
      setActiveId(null);
      setDecision(null);
      setAdminPin('');
      load();
      onResolved?.();
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded || requests.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-gold/25 bg-gold/5 p-3 md:p-4">
      <p className="text-xs md:text-sm font-medium text-gold-soft mb-2">
        {requests.length} reclamo{requests.length !== 1 ? 's' : ''} pendiente{requests.length !== 1 ? 's' : ''} de aprobar
      </p>
      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.request_id} className="rounded-md bg-ink/40 border border-gold/10 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs md:text-sm text-cream/90">
                <span className="text-gold">{r.seller_member_name}</span> dice que suya es la venta de{' '}
                <span className="font-mono">{r.order_public_id}</span> ({r.customer_name}, {r.service_date})
              </span>
              {activeId !== r.request_id && (
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => startDecision(r.request_id, 'approve')}
                    className="rounded-md bg-gold px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold/90 transition">
                    Aprobar
                  </button>
                  <button type="button" onClick={() => startDecision(r.request_id, 'reject')}
                    className="rounded-md border border-cream/20 px-2.5 py-1 text-xs text-cream/60 hover:text-cream/90 transition">
                    Rechazar
                  </button>
                </div>
              )}
            </div>
            {activeId === r.request_id && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-cream/50">
                  {decision === 'approve' ? 'Confirmá con tu PIN de administrador:' : 'Rechazar — confirmá con tu PIN de administrador:'}
                </span>
                <input
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="PIN de administrador"
                  inputMode="numeric"
                  autoFocus
                  className="w-32 rounded-md border border-gold/20 bg-ink/60 px-2 py-1 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                />
                <button type="button" onClick={confirmDecision} disabled={saving}
                  className="rounded-md bg-gold px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50">
                  Confirmar
                </button>
                <button type="button" onClick={() => { setActiveId(null); setDecision(null); }}
                  className="text-xs text-cream/40 hover:text-cream/70 transition">
                  Cancelar
                </button>
              </div>
            )}
            {activeId === r.request_id && error && <p className="mt-1 text-[10px] text-bordeaux-light">⚠ {error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
