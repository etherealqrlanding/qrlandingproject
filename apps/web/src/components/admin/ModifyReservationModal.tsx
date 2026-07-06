import { useMemo, useState } from 'react';
import { adminApi, AdminApiError } from '../../lib/adminApi';

interface Props {
  order: {
    public_id: string;
    payment_method: 'mercadopago' | 'cash';
    customer_name: string;
    customer_phone: string | null;
    total_usd: number;
    total_ars: number;
  };
  item: {
    adults: number;
    children: number;
    unit_price_adult_usd: string;
    unit_price_child_usd: string | null;
    subtotal_usd: string;
    service_date: string;
    option_name_snapshot: string;
  };
  onClose: () => void;
  onDone: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function ModifyReservationModal({ order, item, onClose, onDone }: Props) {
  const origAdults = item.adults;
  const origChildren = item.children;
  const unitAdult = Number(item.unit_price_adult_usd);
  const unitChild = item.unit_price_child_usd != null ? Number(item.unit_price_child_usd) : null;
  const subtotal = Number(item.subtotal_usd);

  // Porción de traslado inferida (lo que se cobró por encima de las entradas).
  const ticketsPortion = round2(origAdults * unitAdult + origChildren * (unitChild ?? 0));
  const transferPortion = Math.max(0, round2(subtotal - ticketsPortion));
  const origHasTransfer = transferPortion > 0.005;
  const transferPerPax = origHasTransfer ? transferPortion / (origAdults + origChildren) : 0;

  const [adults, setAdults] = useState(origAdults);
  const [children, setChildren] = useState(origChildren);
  const [keepTransfer, setKeepTransfer] = useState(origHasTransfer);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpLink, setMpLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const newPax = adults + children;
  const isIncreasing = newPax > origAdults + origChildren;
  // Al AGREGAR pax, el traslado queda como estaba (no se puede togglear en la misma operación).
  const effectiveTransfer = isIncreasing ? origHasTransfer : keepTransfer;

  const preview = useMemo(() => {
    const newTickets = round2(adults * unitAdult + children * (unitChild ?? 0));
    const newTransfer = effectiveTransfer ? round2(transferPerPax * newPax) : 0;
    const newSubtotal = round2(newTickets + newTransfer);
    const delta = round2(newSubtotal - subtotal);
    const deltaArs = subtotal > 0 ? Math.round((Math.abs(delta) / subtotal) * order.total_ars) : 0;
    let direction: 'none' | 'reduce' | 'increase' = 'none';
    if (delta < -0.005) direction = 'reduce';
    else if (delta > 0.005) direction = 'increase';
    return { newSubtotal, delta, deltaArs, direction };
  }, [adults, children, effectiveTransfer, newPax, unitAdult, unitChild, transferPerPax, subtotal, order.total_ars]);

  const isMp = order.payment_method === 'mercadopago';
  const phoneDigits = (order.customer_phone ?? '').replace(/\D/g, '');

  const confirmLabel = (() => {
    if (preview.direction === 'none') return 'Sin cambios';
    if (preview.direction === 'reduce') return `Reintegrar USD ${Math.abs(preview.delta)}`;
    if (isMp) return `Generar link · USD ${preview.delta}`;
    return `Cobrar USD ${preview.delta} en efectivo`;
  })();

  const handleConfirm = async () => {
    setError(null);
    setProcessing(true);
    try {
      if (preview.direction === 'reduce') {
        const body = { adults, children, transfer_requested: effectiveTransfer, reason: reason.trim() || undefined, notify_customer: notify };
        if (isMp) await adminApi.orders.modifyMp(order.public_id, body);
        else await adminApi.orders.reduceCash(order.public_id, body);
        onDone();
      } else if (preview.direction === 'increase') {
        if (isMp) {
          const r = await adminApi.orders.addMp(order.public_id, { adults, children });
          setMpLink(r.init_point);
        } else {
          await adminApi.orders.increaseCash(order.public_id, { adults, children, reason: reason.trim() || undefined, notify_customer: notify });
          onDone();
        }
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const copyLink = async () => {
    if (!mpLink) return;
    try {
      await navigator.clipboard.writeText(mpLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  // ── Pantalla del link de MP generado (agregar en MP) ──
  if (mpLink) {
    const waMsg = `Hola ${order.customer_name}, para sumar los pasajeros a tu reserva de ${item.option_name_snapshot} (${item.service_date}) pagá la diferencia acá: ${mpLink}`;
    const waUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waMsg)}` : `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    return (
      <Overlay>
        <div className="w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-7 text-center">
          <h2 className="font-display text-2xl text-cream mb-2">Link de ampliación generado</h2>
          <p className="text-sm text-cream/70 mb-5">
            Enviale este link al pasajero para que pague la diferencia (<strong className="text-gold">USD {preview.delta}</strong>).
            El lugar queda reservado hasta que pague; si no lo hace, caduca.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-gold/20 bg-ink/40 p-2 mb-3">
            <span className="flex-1 truncate text-left text-xs text-cream/60 px-1">{mpLink}</span>
            <button onClick={copyLink} className="shrink-0 rounded-md border border-gold/30 px-3 py-1.5 text-xs text-cream hover:bg-gold/10 transition">
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-95 transition mb-3">
            Enviar por WhatsApp{phoneDigits ? ' al pasajero' : ''}
          </a>
          <button onClick={() => { onDone(); }} className="w-full rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition">
            Listo
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className="w-full max-w-lg rounded-2xl bg-ink-soft border border-gold/20 my-8">
        <header className="p-6 border-b border-gold/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Modificar reserva</p>
          <h2 className="mt-2 font-display text-2xl text-cream">{item.option_name_snapshot}</h2>
          <p className="mt-1 text-sm text-cream/50">
            Actual: {origAdults} ad{origChildren > 0 ? ` · ${origChildren} men` : ''}{origHasTransfer ? ' · c/traslado' : ''} — USD {subtotal}
          </p>
        </header>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Adultos" value={adults} min={1} max={20} onChange={setAdults} />
            {(origChildren > 0 || unitChild != null) && (
              <Stepper label="Menores" value={children} min={0} max={20} onChange={setChildren} />
            )}
          </div>

          {origHasTransfer && (
            <label className={`flex items-center gap-2 text-sm ${isIncreasing ? 'opacity-40' : ''}`}>
              <input type="checkbox" checked={effectiveTransfer} disabled={isIncreasing}
                onChange={(e) => setKeepTransfer(e.target.checked)} className="accent-gold" />
              <span className="text-cream/80">Mantener traslado {isIncreasing && '(no se puede quitar al agregar pax)'}</span>
            </label>
          )}

          {/* Preview del delta */}
          <div className={`rounded-lg border p-4 ${
            preview.direction === 'reduce' ? 'border-bordeaux-light/40 bg-bordeaux-deep/15'
            : preview.direction === 'increase' ? 'border-gold/30 bg-gold/5'
            : 'border-cream/15 bg-ink/30'
          }`}>
            {preview.direction === 'none' && <p className="text-sm text-cream/60">Sin cambios respecto de la reserva actual.</p>}
            {preview.direction === 'reduce' && (
              <p className="text-sm text-cream/80">
                {isMp ? 'Se reintegrará al cliente ' : 'El vendedor devuelve en efectivo '}
                <strong className="text-cream">USD {Math.abs(preview.delta)}</strong> (≈ ARS {preview.deltaArs.toLocaleString('es-AR')}).
                Nuevo total: <strong className="text-cream">USD {preview.newSubtotal}</strong>.
              </p>
            )}
            {preview.direction === 'increase' && (
              <p className="text-sm text-cream/80">
                {isMp ? 'Se generará un link de MP por ' : 'Se cobra en efectivo '}
                <strong className="text-cream">USD {preview.delta}</strong> (≈ ARS {preview.deltaArs.toLocaleString('es-AR')}).
                Nuevo total: <strong className="text-cream">USD {preview.newSubtotal}</strong>.
                {isMp && ' El pasajero paga con su cuenta.'}
              </p>
            )}
          </div>

          {preview.direction === 'reduce' && (
            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Motivo (opcional, lo ve el cliente)</span>
              <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
            </label>
          )}

          {preview.direction !== 'none' && (preview.direction === 'reduce' || !isMp) && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-gold" />
              <span className="text-sm text-cream/80">Notificar por email al cliente</span>
            </label>
          )}

          {error && <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">{error}</div>}
        </div>

        <div className="p-6 border-t border-gold/10 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={processing} className="btn-ghost text-sm disabled:opacity-40">Cancelar</button>
          <button type="button" onClick={handleConfirm} disabled={processing || preview.direction === 'none'}
            className="btn-primary text-sm disabled:opacity-40">
            {processing ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-ink/85 backdrop-blur-sm">
      {children}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="block text-sm text-cream/80 mb-1.5">{label}</span>
      <div className="flex items-center rounded-md border border-gold/20 bg-ink/40 overflow-hidden">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-3 py-2 text-cream hover:bg-gold/10 transition" aria-label="menos">−</button>
        <span className="flex-1 text-center text-cream tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)} className="px-3 py-2 text-cream hover:bg-gold/10 transition" aria-label="más">+</button>
      </div>
    </div>
  );
}
